import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

const shared = resolve(__dirname, 'src/shared')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
    build: { rollupOptions: { external: ['ffmpeg-static', 'ffprobe-static'], output: { format: 'es' } } }
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['zod'] })],
    resolve: { alias: { '@shared': shared } },
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [vue()],
    resolve: { alias: { '@shared': shared, '@': resolve(__dirname, 'src/renderer') } },
    build: { rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') } }
  }
})
