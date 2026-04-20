/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_PIXILATE_DEPLOY_BASE: string
  readonly VITE_FRAME_CAP: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
