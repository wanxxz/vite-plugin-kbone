import viteReact from '@vitejs/plugin-react'
import { type BuildEnvironmentOptions, defineConfig, type PluginOption } from 'vite'
import { kbonePlugin } from 'vite-plugin-kbone'
import { UnifiedViteWeappTailwindcssPlugin } from 'weapp-tailwindcss/vite'
import kboneConfig from './miniprogram.config.json'

export default defineConfig(config => {
  let plugins: PluginOption[] = [viteReact()]

  let build: BuildEnvironmentOptions = {}

  if (config.mode === 'web') {
    build.outDir = './dist/web'
  }

  if (config.mode === 'mp') {
    plugins = [
      ...plugins,
      kbonePlugin(kboneConfig),
      UnifiedViteWeappTailwindcssPlugin({
        rem2rpx: true,
        cssEntries: ['./app.css']
      })
    ]

    build = {
      outDir: './dist/mp/common',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          'miniprogram-app': './src/app.ts',
          index: './src/pages/index.tsx'
        },
        output: {
          entryFileNames: 'common/[name].js',
          format: 'cjs',
          exports: 'auto',
          assetFileNames: assetInfo => {
            // 输出 wxss 文件
            if (assetInfo?.names?.[0]?.endsWith?.('.css')) return 'common/[name].wxss'
            return 'common/[name].[ext]'
          }
        }
      },
      // 拆分 css 文件
      cssCodeSplit: true
    }
  }

  return {
    plugins: plugins,
    build: build
  }
})
