/// <reference types="vite/client" />

declare module '*.css' {
  const content: string;
  export default content;
}

interface Window {
  __LITECLAW_HASH_ROUTER__?: boolean;
}
