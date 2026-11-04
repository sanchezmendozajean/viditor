<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useUiStore } from '@/stores/ui'
import TitleBar from './components/TitleBar.vue'
import StatusBar from './components/StatusBar.vue'
import StartScreen from './StartScreen.vue'
import EditorLayout from './EditorLayout.vue'
import NewProjectDialog from './dialogs/NewProjectDialog.vue'
import ImportDialog from './dialogs/ImportDialog.vue'

const project = useProjectStore()
const ui = useUiStore()
let offTask: (() => void) | undefined
let toastTimer: ReturnType<typeof setTimeout> | undefined

function onKey(e: KeyboardEvent): void {
  const mod = e.ctrlKey || e.metaKey
  if (e.key === 'F1') {
    e.preventDefault()
    window.viditor.help.open('index')
  } else if (mod && e.key.toLowerCase() === 's' && project.isOpen) {
    e.preventDefault()
    void project.save()
  } else if (mod && e.key.toLowerCase() === 'n') {
    e.preventDefault()
    ui.newProjectOpen = true
  } else if (mod && e.key.toLowerCase() === 'o') {
    e.preventDefault()
    void project.openWithDialog()
  } else if (mod && e.key.toLowerCase() === 'i' && project.isOpen) {
    e.preventDefault()
    void project.importWithDialog()
  }
}
// Soltar archivos fuera de una zona de destino no debe navegar a ellos.
const stopDrop = (e: DragEvent): void => e.preventDefault()

onMounted(() => {
  offTask = window.viditor.media.onTask((t) => ui.onTask(t))
  window.addEventListener('keydown', onKey)
  window.addEventListener('dragover', stopDrop)
  window.addEventListener('drop', stopDrop)
})
onUnmounted(() => {
  offTask?.()
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('dragover', stopDrop)
  window.removeEventListener('drop', stopDrop)
})
watch(
  () => ui.toast,
  (t) => {
    clearTimeout(toastTimer)
    if (t) toastTimer = setTimeout(() => (ui.toast = null), 6000)
  }
)
</script>

<template>
  <div class="shell">
    <TitleBar />
    <EditorLayout v-if="project.isOpen" />
    <StartScreen v-else />
    <StatusBar />
    <NewProjectDialog v-if="ui.newProjectOpen" />
    <ImportDialog v-if="ui.importAsk" />
    <div v-if="ui.toast" class="toast" :class="ui.toast.kind" role="alert" data-testid="toast" @click="ui.toast = null">{{ ui.toast.text }}</div>
  </div>
</template>

<style scoped>
.shell { height: 100%; display: flex; flex-direction: column; }
.toast { position: fixed; right: 16px; bottom: 34px; max-width: 460px; padding: 10px 14px; border-radius: 4px; background: var(--bg-panel-header); border: 1px solid var(--border-subtle); border-left: 3px solid var(--accent); box-shadow: 0 6px 20px #000a; z-index: 200; cursor: pointer; font-size: 12px; user-select: text; }
.toast.error { border-left-color: var(--danger); }
</style>
