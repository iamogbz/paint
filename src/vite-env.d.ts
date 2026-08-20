/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __COMMIT_HASH__: string;

declare module '*.png' {
  const src: string;
}
