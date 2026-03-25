// Copyright (c) 2020 Tencent, a Tencent company
// SPDX-License-Identifier: BSD-3-Clause
//
// Modifications Copyright (c) 2026 Yiwan Zhou
// SPDX-License-Identifier: MIT

import postcss from 'postcss'
import colors from 'colors/safe.js'
import { tagList } from './tag-list.js'

const replaceRegexp = new RegExp(`(\\W|\\b)(${['html', ...tagList].join('|')})(\\W|\\b)`, 'ig')
const prefixRegexp = /[a-zA-Z0-9:.#_-]/
const suffixRegexp = /[a-zA-Z0-9_-]/

let options = {}

/**
 * Replace tag name postcss plugin
 */
const replaceTagNamePlugin = () => ({
  postcssPlugin: 'replaceTagName',
  Once(root) {
    const optimization = options.optimization || {}
    const wxssUniversalSelector = optimization.wxssUniversalSelector || 'taglist'

    root.walk(child => {
      if (child.type === 'atrule') {
        if (child.name === '-moz-keyframes') {
          child.remove()
        }
      } else if (child.type === 'rule') {
        const selectors = []

        child.selectors.forEach(selector => {
          selector = selector.replace(/>:/g, '>*:')

          const wavyLineIndex = selector.indexOf('~')
          if (wavyLineIndex !== -1 && selector[wavyLineIndex + 1] !== '=') {
            console.warn(
              colors.bold(`\nselector ${colors.yellow(selector)} is not supported in wxss, so it will be deleted\n`)
            )
            return
          }

          if (selector === ':root') {
            selector = 'page'
          }
          selector = selector.replace(replaceRegexp, (all, $1, tagName, $2, offset, string) => {
            let start = $1
            let end = $2
            if (!start) start = string[offset - 1] || ''
            if (!end) end = string[offset + all.length] || ''

            if (prefixRegexp.test(start) || suffixRegexp.test(end)) {
              return all
            }

            tagName = tagName.toLowerCase()

            if (tagName === 'html') {
              return `${$1}page${$2}`
            } else if (tagName) {
              return `${$1}.h5-${tagName}${$2}`
            } else {
              return all
            }
          })

          if (wxssUniversalSelector === 'classprefix') {
            const splitRes = selector.split('*')
            let count = 0
            if (splitRes.length > 2) {
              for (let i = 1, len = splitRes.length; i < len; i++) {
                if (splitRes[i][0] !== '=') count++
              }
            }
            if (count >= 2) {
              console.warn(
                colors.bold(`\nselector ${colors.yellow(selector)} is not supported in wxss, so it will be deleted\n`)
              )
              return
            } else {
              selector = selector.replace(/(.*)\*(?!=)(.*)/g, (all, $1, $2) => {
                selectors.push(`${$1}page${$2}`)
                return `${$1}[class^="h5-"]${$2}`
              })
            }
          } else {
            selector = selector.replace(/(.*)\*(.*)/g, (all, $1, $2) => {
              if ($2[0] === '=') return all

              tagList.forEach(tagName => selectors.push(`${$1}.h5-${tagName}${$2}`))

              selectors.push(`${$1}page${$2}`)
              return ''
            })
          }

          if (selector.trim()) selectors.push(selector)
        })

        if (!selectors.length) {
          child.remove()
        } else {
          child.selectors = selectors
        }
      }
    })
  }
})

replaceTagNamePlugin.postcss = true

export function setAdjustCssOptions(userOptions) {
  if (userOptions) options = userOptions
}

export function adjustCss(code) {
  code = postcss([replaceTagNamePlugin]).process(code, {
    from: undefined,
    map: null
  })

  return code.css
}
