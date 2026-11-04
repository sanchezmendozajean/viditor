/// <reference types="vite/client" />
import type { ViditorApi } from '@shared/ipc'

declare global {
  interface Window {
    viditor: ViditorApi
  }
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

declare module '*.svg?raw' {
  const content: string
  export default content
}
