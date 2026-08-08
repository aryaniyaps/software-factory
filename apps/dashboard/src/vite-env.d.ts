/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FACTORY_API_TOKEN?: string;
  readonly VITE_TEMPORAL_UI_URL?: string;
  readonly VITE_TEMPORAL_NAMESPACE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
