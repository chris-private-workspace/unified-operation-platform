/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Override API base when the NestJS API is on another origin; defaults to '/api'. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
