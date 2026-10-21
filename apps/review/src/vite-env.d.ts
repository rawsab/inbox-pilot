/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SCHEDULER_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
