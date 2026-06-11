/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Rails API. Defaults to same-origin (""). */
  readonly VITE_API_BASE: string | undefined;
  readonly VITE_IS_PREVIEW: string;
  readonly VITE_TEST_USER_EMAIL: string | undefined;
  readonly VITE_TEST_USER_PASSWORD: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
