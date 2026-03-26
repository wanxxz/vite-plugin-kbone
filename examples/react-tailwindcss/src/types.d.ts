/// <reference types="vite/client" />
/// <reference types="miniprogram-api-typings" />

interface ViteTypeOptions {
  strictImportMetaEnv: unknown
}

interface ImportMetaEnv {
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
