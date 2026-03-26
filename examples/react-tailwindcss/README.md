## 命令

```
npm run build:web    // 开发小程序
npm run build:mp     // 构建小程序
npm run dev:web      // 开发 web
npm run dev:build    // 构建 web
```

## 目录

```
├─ dist
│  ├─ mp                      // 微信开发者工具指向的目录 用于生产环境
│  ├─ web                     // web 编译出的文件 用于生产环境
├─ src
│  └─ pages                   // 存放所有页面
│     └─ index.tsx            // 入口文件
├─ index.html                 // web 入口 html 文件
├─ miniprogram.config.json    // vite-plugin-kbone 配置
```

## 说明
- `miniprogram.config.json` 中 配置 `"global.rem": true` 后 `vite-plugin-vite` 会自动配置 小程序页面 `<page-meta root-font-size="16px">` 默认是 `16px`
  通过 `document.documentElement.style.fontSize` 来改变这个值