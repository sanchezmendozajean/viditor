import '@fontsource/source-sans-3/400.css'
import '@fontsource/source-sans-3/600.css'
import '@fontsource/jetbrains-mono/400.css'
import './assets/base.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './app/App.vue'

createApp(App).use(createPinia()).mount('#app')
