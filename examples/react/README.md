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
