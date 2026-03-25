// Copyright (c) 2020 Tencent, a Tencent company
// SPDX-License-Identifier: BSD-3-Clause
//
// Modifications Copyright (c) 2026 Yiwan Zhou
// SPDX-License-Identifier: MIT

import path from 'node:path'
import fs from 'node:fs'
import { execaCommand } from 'execa'
import pathToRegexp from 'path-to-regexp'
import colors from 'colors/safe.js'
import { setAdjustCssOptions, adjustCss } from './tool/adjust-css.js'
import * as _ from './tool/utils.js'

const PluginName = 'vite-plugin-kbone'

const appJsTmpl = fs.readFileSync(path.resolve(import.meta.dirname, './tmpl/app.tmpl.js'), 'utf8')
const pageBaseJsTmpl = fs.readFileSync(path.resolve(import.meta.dirname, './tmpl/page.base.tmpl.js'), 'utf8')
const pageJsTmpl = fs.readFileSync(path.resolve(import.meta.dirname, './tmpl/page.tmpl.js'), 'utf8')
const workerJsTmpl = fs.readFileSync(path.resolve(import.meta.dirname, './tmpl/worker.tmpl.js'), 'utf8')
const appDisplayWxssTmpl = fs.readFileSync(path.resolve(import.meta.dirname, './tmpl/app.display.tmpl.wxss'), 'utf8')
const appExtraWxssTmpl = fs.readFileSync(path.resolve(import.meta.dirname, './tmpl/app.extra.tmpl.wxss'), 'utf8')
const appWxssTmpl = fs.readFileSync(path.resolve(import.meta.dirname, './tmpl/app.tmpl.wxss'), 'utf8')
const customComponentJsTmpl = fs.readFileSync(path.resolve(import.meta.dirname, './tmpl/custom-component.tmpl.js'), 'utf8')
const projectConfigJsonTmpl = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, './tmpl/project.config.tmpl.json'), 'utf8'))
const packageConfigJsonTmpl = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, './tmpl/package.tmpl.json'), 'utf8'))

const globalVars = [
  'self',
  'HTMLElement',
  'Element',
  'Node',
  'localStorage',
  'sessionStorage',
  'navigator',
  'history',
  'location',
  'performance',
  'Image',
  'CustomEvent',
  'Event',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
  'XMLHttpRequest',
  'Worker',
  'SharedWorker'
]

/**
 * Get asset path for dependencies
 */
function getAssetPath(assetPathPrefix, filePath, assetsSubpackageMap, backwardStr = '../../') {
  if (assetsSubpackageMap[filePath]) assetPathPrefix = ''
  return `${assetPathPrefix}${backwardStr}common/${filePath}`
}

/**
 * Wrap JS chunk content to inject miniprogram globals
 */
function wrapJsContent(code, globalVarsConfig, workerConfig, fileName) {
  if (workerConfig) {
    if (typeof workerConfig !== 'string') workerConfig = 'common/workers'
    workerConfig = path.relative('common', workerConfig)
  }

  if (workerConfig && new RegExp(`${workerConfig}/(.)*.js$`).test(fileName)) {
    const headerContent = workerJsTmpl.replace(/[\r\n\t\s]+/gi, ' ')
    return `(function(){${headerContent}${code}})()`
  } else if (/\.js$/.test(fileName)) {
    const headerContent =
      'module.exports = function(window, document) {var App = function(options) {window.appOptions = options};' +
      globalVars.map(item => `var ${item} = window.${item}`).join(';') +
      ';'
    let customHeaderContent = globalVarsConfig
      .map(item => `var ${item[0]} = ${item[1] ? item[1] : "window['" + item[0] + "']"}`)
      .join(';')
    customHeaderContent = customHeaderContent ? customHeaderContent + ';' : ''
    const footerContent = '}'
    return headerContent + customHeaderContent + code + footerContent
  }

  return code
}

/**
 * kbone Vite plugin
 *
 * @param {object} options - kbone configuration options
 * @returns {import('vite').Plugin}
 */
export function kbonePlugin(options) {
  const generateConfig = options.generate || {}
  let resolvedConfig
  let outputPath

  setAdjustCssOptions(options)

  return {
    name: PluginName,

    configResolved(config) {
      resolvedConfig = config
      outputPath = path.resolve(config.root, config.build?.outDir || 'dist')
    },

    /**
     * Transform CSS files to adjust selectors for miniprogram
     */
    transform(code, id) {
      if (/\.(css|wxss)$/.test(id)) {
        return {
          code: adjustCss(code),
          map: null
        }
      }
      return null
    },

    /**
     * Main bundle generation - replaces webpack's emit hook.
     *
     * Uses this.emitFile() for assets that belong inside the output
     * directory, and writes directly to disk for miniprogram structure
     * files that live *outside* the output directory (../  paths).
     * Rolldown forbids relative paths in this.emitFile() fileName.
     */
    generateBundle(_outputOptions, bundle) {
      const entryNames = []
      const assetsMap = {}
      const assetsReverseMap = {}
      const assetsSubpackageMap = {}
      const externalWxssMap = {}
      const pages = []
      const subpackagesMap = {}
      const tabBarMap = {}

      const appJsEntryName = generateConfig.appEntry || generateConfig.app || ''
      const globalConfig = options.global || {}
      const pageConfigMap = options.pages || {}
      const subpackagesConfig = generateConfig.subpackages || {}
      const preloadRuleConfig = generateConfig.preloadRule || {}
      const tabBarConfig = generateConfig.tabBar || {}
      const wxCustomComponentConfig = generateConfig.wxCustomComponent || {}
      const wxCustomComponentRoot = wxCustomComponentConfig.root
      const wxCustomComponents = wxCustomComponentConfig.usingComponents || {}
      const globalVarsConfig = generateConfig.globalVars || []
      const workerConfig = generateConfig.worker
      let needEmitConfigToSubpackage = false

      /**
       * Emit a file.
       *  - If fileName is a plain relative path (no leading ../), use the
       *    Rollup this.emitFile() API so it lands inside the output dir.
       *  - If fileName starts with ../, resolve it relative to the output
       *    dir and write directly to disk, because Rolldown does not allow
       *    relative or absolute paths in emitFile().
       */
      const emit = (fileName, source) => {
        if (fileName.startsWith('../') || fileName.startsWith('..\\')) {
          const dest = path.resolve(outputPath, fileName)
          _.recursiveMkdir(path.dirname(dest))
          fs.writeFileSync(dest, source)
        } else {
          this.emitFile({ type: 'asset', fileName, source })
        }
      }

      // Collect entry names and assets from the bundle
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk' && chunk.isEntry) {
          const entryName = chunk.name || path.basename(fileName, path.extname(fileName))
          if (!entryNames.includes(entryName)) {
            entryNames.push(entryName)
          }
        }
      }

      // Build asset maps from bundle output
      for (const entryName of entryNames) {
        const assets = { js: [], css: [] }
        const filePathMap = {}

        for (const [fileName, chunk] of Object.entries(bundle)) {
          const isRelated =
            (chunk.type === 'chunk' && chunk.name === entryName) ||
            (chunk.type === 'chunk' && chunk.facadeModuleId && chunk.facadeModuleId.includes(entryName))

          if (!isRelated) continue

          const extMatch = /\.(css|js|wxss)(\?|$)/.exec(fileName)
          if (!extMatch) continue
          if (filePathMap[fileName]) continue
          filePathMap[fileName] = true

          let ext = extMatch[1]
          ext = ext === 'wxss' ? 'css' : ext
          assets[ext].push(fileName)

          assetsReverseMap[fileName] = assetsReverseMap[fileName] || []
          if (assetsReverseMap[fileName].indexOf(entryName) === -1) {
            assetsReverseMap[fileName].push(entryName)
          }

          // Adjust CSS content — delete original from bundle, re-emit adjusted version
          if (ext === 'css' && bundle[fileName]) {
            const original = bundle[fileName]
            const source =
              original.type === 'asset'
                ? typeof original.source === 'string'
                  ? original.source
                  : original.source.toString()
                : original.code || ''
            const adjusted = adjustCss(source)
            delete bundle[fileName]
            emit(fileName, adjusted)
          }
        }

        // Also find CSS assets that may be linked via imports
        for (const [fileName, chunk] of Object.entries(bundle)) {
          if (chunk.type === 'asset' && /\.(css|wxss)$/.test(fileName)) {
            const extMatch = /\.(css|wxss)(\?|$)/.exec(fileName)
            if (!extMatch || filePathMap[fileName]) continue
            filePathMap[fileName] = true
            assets.css.push(fileName)

            assetsReverseMap[fileName] = assetsReverseMap[fileName] || []
            if (assetsReverseMap[fileName].indexOf(entryName) === -1) {
              assetsReverseMap[fileName].push(entryName)
            }
          }
        }

        assetsMap[entryName] = assets
      }

      // Wrap JS entry chunks with miniprogram module wrapper.
      // Only entry chunks are wrapped — shared/vendor chunks are loaded
      // via require() and must remain plain CJS modules.
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk' && chunk.isEntry && /\.js$/.test(fileName)) {
          const wrapped = wrapJsContent(chunk.code, globalVarsConfig, workerConfig, fileName)
          delete bundle[fileName]
          emit(fileName, wrapped)
        }
      }

      // Process custom component fields
      Object.keys(wxCustomComponents).forEach(key => {
        if (typeof wxCustomComponents[key] === 'string') {
          wxCustomComponents[key] = { path: wxCustomComponents[key] }
        }
        const { props = [], propsVal = {}, externalWxss } = wxCustomComponents[key]
        wxCustomComponents[key].propsVal = props.reduce((tempObj, item, index) => {
          tempObj[item] = propsVal[index] || null
          return tempObj
        }, {})
        if (Array.isArray(externalWxss) && externalWxss.length) {
          externalWxss.forEach(item => {
            externalWxssMap[item] = true
          })
        }
      })

      // Process subpackage config — relocate assets into subpackage dirs.
      // Read source from the bundle entry, delete old key, emit under new path.
      Object.keys(subpackagesConfig).forEach(packageName => {
        let pkgPages = subpackagesConfig[packageName] || []
        if (!Array.isArray(pkgPages)) pkgPages = pkgPages.pages

        pkgPages.forEach(entryName => {
          subpackagesMap[entryName] = packageName

          const assets = assetsMap[entryName]
          if (assets) {
            ;[...assets.js, ...assets.css].forEach(filePath => {
              const requirePages = assetsReverseMap[filePath] || []

              const isWxss = /\.(css|wxss)(\?|$)/.test(filePath)
              const isExternalWxss = isWxss && requirePages.some(item => externalWxssMap[item])

              if (_.includes(pages, requirePages) && bundle[filePath] && !isExternalWxss) {
                assetsSubpackageMap[filePath] = packageName
                const entry = bundle[filePath]
                const source =
                  entry.type === 'asset'
                    ? typeof entry.source === 'string'
                      ? entry.source
                      : entry.source.toString()
                    : entry.code || ''
                const newFileName = `../${packageName}/common/${filePath}`
                delete bundle[filePath]
                emit(newFileName, typeof source === 'string' ? source : String(source))
              }
            })
          }
        })
      })

      // Remove app.js entry
      const appJsEntryIndex = entryNames.indexOf(appJsEntryName)
      if (appJsEntryIndex >= 0) entryNames.splice(appJsEntryIndex, 1)

      if (generateConfig.app === 'noemit') {
        needEmitConfigToSubpackage = !entryNames.find(entryName => !subpackagesMap[entryName])
      }

      // Process each entry page
      for (const entryName of entryNames) {
        const assets = assetsMap[entryName] || { js: [], css: [] }
        const pageConfig = (pageConfigMap[entryName] = Object.assign({}, globalConfig, pageConfigMap[entryName] || {}))
        const loadingView = pageConfig && pageConfig.loadingView
        const loadingViewName = (pageConfig && pageConfig.loadingViewName) || 'index'
        const addPageScroll = pageConfig && pageConfig.windowScroll
        const pageBackgroundColor = pageConfig && (pageConfig.pageBackgroundColor || pageConfig.backgroundColor)
        const reachBottom = pageConfig && pageConfig.reachBottom
        const reachBottomDistance = pageConfig && pageConfig.reachBottomDistance
        const pullDownRefresh = pageConfig && pageConfig.pullDownRefresh
        const rem = pageConfig && pageConfig.rem
        const pageStyle = pageConfig && pageConfig.pageStyle
        const pageExtraConfig = (pageConfig && pageConfig.extra) || {}
        const packageName = subpackagesMap[entryName]
        const pageRoute = `${packageName ? packageName + '/' : ''}pages/${entryName}/index`
        const configPathPrefix = packageName && !needEmitConfigToSubpackage ? '../' : ''
        const assetPathPrefix = packageName ? '../' : ''

        // Page js
        let pageJsContent = pageJsTmpl
          .replace('/* CONFIG_PATH */', `${configPathPrefix}../../config`)
          .replace(
            '/* INIT_FUNCTION */',
            `function init(window, document) {${assets.js.map(js => "require('" + getAssetPath(assetPathPrefix, js, assetsSubpackageMap) + "')(window, document)").join(';')}}`
          )
        let pageScrollFunction = ''
        let reachBottomFunction = ''
        let pullDownRefreshFunction = ''
        if (addPageScroll) {
          pageScrollFunction =
            "onPageScroll({ scrollTop }) {if (this.window) {this.window.document.documentElement.$$scrollTop = scrollTop || 0;this.window.$$trigger('scroll');}},"
        }
        if (reachBottom) {
          reachBottomFunction = "onReachBottom() {if (this.window) {this.window.$$trigger('reachbottom');}},"
        }
        if (pullDownRefresh) {
          pullDownRefreshFunction =
            "onPullDownRefresh() {if (this.window) {this.window.$$trigger('pulldownrefresh');}},"
        }
        pageJsContent = pageJsContent
          .replace('/* PAGE_SCROLL_FUNCTION */', pageScrollFunction)
          .replace('/* REACH_BOTTOM_FUNCTION */', reachBottomFunction)
          .replace('/* PULL_DOWN_REFRESH_FUNCTION */', pullDownRefreshFunction)
        emit(`../${pageRoute}.js`, pageJsContent)

        // Page wxml
        let pageWxmlContent = `<element wx:if="{{pageId}}" class="{{bodyClass}}" style="{{bodyStyle}}" data-private-node-id="e-body" data-private-page-id="{{pageId}}" ${wxCustomComponentRoot ? 'generic:custom-component="custom-component"' : ''}></element>`
        if (loadingView)
          pageWxmlContent =
            `<loading-view wx:if="{{loading}}" class="miniprogram-loading-view" page-name="${entryName}"></loading-view>` +
            pageWxmlContent
        if (rem || pageStyle)
          pageWxmlContent =
            `<page-meta ${rem ? 'root-font-size="{{rootFontSize}}"' : ''} ${pageStyle ? 'page-style="{{pageStyle}}"' : ''}></page-meta>` +
            pageWxmlContent
        emit(`../${pageRoute}.wxml`, pageWxmlContent)

        // Page wxss
        let pageWxssContent = assets.css
          .map(css => `@import "${getAssetPath(assetPathPrefix, css, assetsSubpackageMap)}";`)
          .join('\n')
        if (loadingView)
          pageWxssContent =
            '.miniprogram-loading-view{position:fixed;top:0;left:0;bottom:0;right:0;z-index:0;}.miniprogram-root{display:block;position:relative;z-index:1;background:#fff;}' +
            pageWxssContent
        if (pageBackgroundColor) pageWxssContent = `page{background-color:${pageBackgroundColor};}\n` + pageWxssContent
        emit(`../${pageRoute}.wxss`, adjustCss(pageWxssContent))

        // Page json
        const pageJson = {
          ...pageExtraConfig,
          enablePullDownRefresh: !!pullDownRefresh,
          usingComponents: {
            element: 'miniprogram-element'
          }
        }
        if (loadingView)
          pageJson.usingComponents['loading-view'] = `${assetPathPrefix}../../loading-view/${loadingViewName}`
        if (wxCustomComponentRoot)
          pageJson.usingComponents['custom-component'] = `${assetPathPrefix}../../custom-component/index`
        if (reachBottom && typeof reachBottomDistance === 'number') pageJson.onReachBottomDistance = reachBottomDistance
        emit(`../${pageRoute}.json`, JSON.stringify(pageJson, null, '\t'))

        // Page shared base.js
        emit(`../${packageName ? packageName + '/' : ''}pages/base.js`, pageBaseJsTmpl)

        // Record page route
        if (!packageName) pages.push(pageRoute)

        // Copy loading view directory
        if (loadingView) {
          _.copyDir(loadingView, path.resolve(outputPath, '../loading-view'))
        }
      }

      // Append webview page
      if (
        options.redirect &&
        (options.redirect.notFound === 'webview' || options.redirect.accessDenied === 'webview')
      ) {
        emit(
          '../pages/webview/index.js',
          "Page({data:{url:''},onLoad: function(query){this.setData({url:decodeURIComponent(query.url)})}})"
        )
        emit('../pages/webview/index.wxml', '<web-view src="{{url}}"></web-view>')
        emit('../pages/webview/index.wxss', '')
        emit('../pages/webview/index.json', '{"usingComponents":{}}')
        pages.push('pages/webview/index')
      }

      const appConfig = generateConfig.app || 'default'
      const isEmitApp = appConfig !== 'noemit'
      const isEmitProjectConfig = appConfig !== 'noconfig'
      let workersDir = 'common/workers'

      // TabBar
      let tabBar
      if (tabBarConfig.list && tabBarConfig.list.length) {
        tabBar = Object.assign({}, tabBarConfig)
        tabBar.list = tabBarConfig.list.map(item => {
          const iconPathName = item.iconPath ? _.md5File(item.iconPath) + path.extname(item.iconPath) : ''
          if (iconPathName) _.copyFile(item.iconPath, path.resolve(outputPath, `../images/${iconPathName}`))
          const selectedIconPathName = item.selectedIconPath
            ? _.md5File(item.selectedIconPath) + path.extname(item.selectedIconPath)
            : ''
          if (selectedIconPathName)
            _.copyFile(item.selectedIconPath, path.resolve(outputPath, `../images/${selectedIconPathName}`))
          tabBarMap[`/pages/${item.pageName}/index`] = true

          const tabBarItem = {
            pagePath: `pages/${item.pageName}/index`,
            text: item.text
          }
          if (iconPathName) tabBarItem.iconPath = `./images/${iconPathName}`
          if (selectedIconPathName) tabBarItem.selectedIconPath = `./images/${selectedIconPathName}`

          return tabBarItem
        })

        if (tabBar.custom) {
          const customTabBarDir = tabBar.custom
          tabBar.custom = true
          _.copyDir(customTabBarDir, path.resolve(outputPath, '../custom-tab-bar'))
        }
      }

      // Worker
      if (generateConfig.worker) {
        workersDir = typeof generateConfig.worker === 'string' ? generateConfig.worker : workersDir
      }

      if (isEmitApp) {
        // app js
        const appAssets = assetsMap[appJsEntryName] || { js: [], css: [] }
        const appJsInject = generateConfig.appEntryInject || ''
        const appJsContent = appJsTmpl.replace(
          '/* INIT_FUNCTION */',
          `var fakeWindow = {};var fakeDocument = {};(function(window, document) {${appJsInject}})(fakeWindow, fakeDocument);${appAssets.js.map(js => "require('" + getAssetPath('', js, assetsSubpackageMap, '') + "')(fakeWindow, fakeDocument);").join('')}var appConfig = fakeWindow.appOptions || {};`
        )
        emit('../app.js', appJsContent)

        // app wxss
        const appWxssConfig = generateConfig.appWxss || 'default'
        let appWxssContent =
          appWxssConfig === 'none' ? '' : appWxssConfig === 'display' ? appDisplayWxssTmpl : appWxssTmpl
        if (appAssets.css.length) {
          appWxssContent += `\n${appAssets.css.map(css => `@import "${getAssetPath('', css, assetsSubpackageMap, '')}";`).join('\n')}`
        }
        appWxssContent = adjustCss(appWxssContent)
        if (appWxssConfig !== 'none' && appWxssConfig !== 'display') {
          appWxssContent += '\n' + appExtraWxssTmpl
        }
        emit('../app.wxss', appWxssContent)

        // app json
        const subpackages = []
        const preloadRule = {}
        Object.keys(subpackagesConfig).forEach(packageName => {
          let pkgPages = subpackagesConfig[packageName] || []
          let extraOptions = {}
          if (!Array.isArray(pkgPages)) {
            extraOptions = Object.assign(extraOptions, pkgPages)
            pkgPages = pkgPages.pages
            delete extraOptions.pages
          }

          subpackages.push({
            name: packageName,
            root: packageName,
            pages: pkgPages.map(entryName => `pages/${entryName}/index`),
            ...extraOptions
          })
        })
        Object.keys(preloadRuleConfig).forEach(entryName => {
          const packageName = subpackagesMap[entryName]
          const pageRoute = `${packageName ? packageName + '/' : ''}pages/${entryName}/index`
          preloadRule[pageRoute] = preloadRuleConfig[entryName]
        })
        const userAppJson = options.appExtraConfig || {}
        const appJson = {
          pages,
          window: options.app || {},
          subpackages,
          preloadRule,
          ...userAppJson
        }

        if (tabBar) appJson.tabBar = tabBar
        if (generateConfig.worker) appJson.workers = workersDir

        emit('../app.json', JSON.stringify(appJson, null, '\t'))

        if (isEmitProjectConfig) {
          const userProjectConfigJson = options.projectConfig || {}
          const projectConfigJson = JSON.parse(JSON.stringify(projectConfigJsonTmpl))
          const projectConfigJsonContent = JSON.stringify(_.merge(projectConfigJson, userProjectConfigJson), null, '\t')
          const projectConfigPath = generateConfig.projectConfig
            ? path.join(path.relative(outputPath, generateConfig.projectConfig), './project.config.json')
            : '../project.config.json'
          emit(projectConfigPath, projectConfigJsonContent)
        }

        // sitemap.json
        const userSitemapConfigJson = options.sitemapConfig
        if (userSitemapConfigJson) {
          emit('../sitemap.json', JSON.stringify(userSitemapConfigJson, null, '\t'))
        }
      }

      // config js
      const router = {}
      if (options.router) {
        Object.keys(options.router).forEach(key => {
          const pathObjList = []
          let pathList = options.router[key]
          pathList = Array.isArray(pathList) ? pathList : [pathList]

          for (const pathItem of pathList) {
            if (!pathItem || typeof pathItem !== 'string') continue

            const keys = []
            const regexp = pathToRegexp(pathItem, keys)
            const pattern = regexp.valueOf()

            pathObjList.push({
              regexp: pattern.source,
              options: `${pattern.global ? 'g' : ''}${pattern.ignoreCase ? 'i' : ''}${pattern.multiline ? 'm' : ''}`
            })
          }
          router[key] = pathObjList
        })
      }
      const configJsContent =
        'module.exports = ' +
        JSON.stringify(
          {
            origin: options.origin || 'https://miniprogram.default',
            entry: options.entry || '/',
            router,
            generate: { worker: workersDir },
            runtime: Object.assign(
              {
                subpackagesMap,
                tabBarMap,
                usingComponents: wxCustomComponents
              },
              options.runtime || {}
            ),
            pages: pageConfigMap,
            redirect: options.redirect || {},
            optimization: options.optimization || {}
          },
          null,
          '\t'
        )
      if (needEmitConfigToSubpackage) {
        Object.keys(subpackagesConfig).forEach(packageName => {
          emit(`../${packageName}/config.js`, configJsContent)
        })
      } else {
        emit('../config.js', configJsContent)
      }

      // package.json
      if (typeof options.packageConfigOverride === 'object') {
        const userPackageConfigJson = options.packageConfigOverride || {}
        emit('../package.json', JSON.stringify(userPackageConfigJson, null, '\t'))
      } else {
        const userPackageConfigJson = options.packageConfig || {}
        const packageConfigJson = Object.assign({}, packageConfigJsonTmpl)
        packageConfigJson.dependencies = Object.assign({}, packageConfigJson.dependencies)
        if (generateConfig.renderVersion)
          packageConfigJson.dependencies['miniprogram-render'] = generateConfig.renderVersion
        if (generateConfig.elementVersion)
          packageConfigJson.dependencies['miniprogram-element'] = generateConfig.elementVersion
        emit(
          '../package.json',
          JSON.stringify(_.merge(packageConfigJson, userPackageConfigJson), null, '\t')
        )
      }

      // node_modules
      emit('../node_modules/.miniprogram', '')

      // Custom components
      if (wxCustomComponentRoot) {
        const realUsingComponents = {}
        const names = Object.keys(wxCustomComponents)

        if (wxCustomComponentRoot) {
          _.copyDir(wxCustomComponentRoot, path.resolve(outputPath, '../custom-component/components'))
        }

        emit('../custom-component/index.js', customComponentJsTmpl)

        emit(
          '../custom-component/index.wxml',
          names
            .map((key, index) => {
              const { props = [], events = [] } = wxCustomComponents[key]
              return `<${key} wx:${index === 0 ? 'if' : 'elif'}="{{kboneCustomComponentName === '${key}'}}" id="{{id}}" class="{{className}}" style="{{style}}" ${props.map(name => name + '="{{' + name.replace(/-([a-zA-Z])/g, (all, $1) => $1.toUpperCase()) + '}}"').join(' ')} ${events.map(name => 'bind:' + name + '="on' + name + '"').join(' ')}><block wx:if="{{hasSlots}}"><element wx:for="{{slots}}" wx:key="nodeId" id="{{item.id}}" class="{{item.className}}" style="{{item.style}}" slot="{{item.slot}}" data-private-node-id="{{item.nodeId}}" data-private-page-id="{{item.pageId}}" generic:custom-component="custom-component"></element></block><slot/></${key}>`
            })
            .join('\n')
        )

        emit(
          '../custom-component/index.wxss',
          names
            .map(key => {
              const { externalWxss } = wxCustomComponents[key]
              if (externalWxss && typeof externalWxss === 'string') {
                return externalWxss
              } else if (Array.isArray(externalWxss) && externalWxss.length) {
                return externalWxss
                  .map(entryName => {
                    const assets = assetsMap[entryName]
                    return assets.css
                      .map(css => `@import "${getAssetPath('', css, assetsSubpackageMap, '../')}";`)
                      .join('\n')
                  })
                  .join('\n\n')
              } else {
                return ''
              }
            })
            .join('\n')
        )

        realUsingComponents['custom-component'] = './index'
        realUsingComponents.element = 'miniprogram-element'
        emit(
          '../custom-component/index.json',
          JSON.stringify(
            {
              component: true,
              usingComponents: realUsingComponents
            },
            null,
            '\t'
          )
        )
      }
    },

    /**
     * Post-build: auto-install miniprogram npm dependencies.
     * Replaces webpack's done hook.
     */
    async closeBundle() {
      const autoBuildNpm = generateConfig.autoBuildNpm || false
      const distDir = path.dirname(outputPath)

      const hasBuiltNpm =
        _.isFileExisted(path.resolve(distDir, './node_modules/miniprogram-element/package.json')) &&
        _.isFileExisted(path.resolve(distDir, './node_modules/miniprogram-render/package.json'))

      if (hasBuiltNpm || !autoBuildNpm) {
        if (hasBuiltNpm) console.log(colors.bold('\ndependencies has been built\n'))
        return
      }

      const build = () => {
        const elementDist = path.resolve(distDir, './node_modules/miniprogram-element/dist')
        if (_.isFileExisted(elementDist)) {
          _.copyDir(elementDist, path.resolve(distDir, './miniprogram_npm/miniprogram-element'))
        } else {
          _.copyDir(
            path.resolve(distDir, './node_modules/miniprogram-element/src'),
            path.resolve(distDir, './miniprogram_npm/miniprogram-element')
          )
        }

        const renderDist = path.resolve(distDir, './node_modules/miniprogram-render/dist')
        if (_.isFileExisted(renderDist)) {
          _.copyDir(renderDist, path.resolve(distDir, './miniprogram_npm/miniprogram-render'))
        } else {
          _.copyDir(
            path.resolve(distDir, './node_modules/miniprogram-render/src'),
            path.resolve(distDir, './miniprogram_npm/miniprogram-render')
          )
        }
      }

      console.log(colors.bold('\nstart building dependencies...\n'))

      const command = autoBuildNpm === 'yarn' ? 'yarn install --production' : 'npm install --production'
      try {
        const { exitCode } = await execaCommand(command, { cwd: distDir })
        if (!exitCode) {
          console.log(colors.bold(`\nbuilt dependencies ${colors.green('successfully')}\n`))
          build()
        } else {
          console.log(
            colors.bold(
              `\nbuilt dependencies ${colors.red('failed')}, please enter "${colors.yellow(distDir)}" and run install manually\n`
            )
          )
        }
      } catch {
        console.log(
          colors.bold(
            `\nbuilt dependencies ${colors.red('failed')}, please enter "${colors.yellow(distDir)}" and run install manually\n`
          )
        )
      }
    }
  }
}
