import '@fontsource/source-sans-3/400.css'
import '@fontsource/source-sans-3/600.css'
import '@fontsource/jetbrains-mono/400.css'
import './assets/base.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './app/App.vue'

// La ventana oculta de exportación (#export=<id>) usa el mismo motor pero no monta la interfaz.
const exportJob = /^#export=([\w-]+)$/.exec(location.hash)?.[1]
if (exportJob) {
  void import('./export/runner').then((m) => m.runExport(exportJob))
} else {
  createApp(App).use(createPinia()).mount('#app')
}
