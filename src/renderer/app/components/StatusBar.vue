<script setup lang="ts">
import { computed } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useUiStore } from '@/stores/ui'

const project = useProjectStore()
const ui = useUiStore()
const s = computed(() => project.project?.settings)
const fps = computed(() => (s.value ? +(s.value.fps.num / s.value.fps.den).toFixed(3) : 0))
const active = computed(() => ui.tasks.find((t) => !t.done) ?? ui.tasks.at(-1))
const time = (ts: number): string => new Date(ts).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <footer class="status" data-testid="statusbar">
    <span v-if="s" class="mono">{{ s.width }}×{{ s.height }} · {{ fps }} fps · {{ +(s.sampleRate / 1000).toFixed(1) }} kHz</span>
    <span v-else class="dim">Sin proyecto</span>
    <span class="sep" />
    <span v-if="active" class="task" :class="{ err: active.error }">
      Tareas: {{ active.label }}{{ active.error ? ` — error: ${active.error}` : active.done ? ' ✓' : '…' }}
    </span>
    <span class="grow" />
    <span v-if="project.isOpen" class="dim">
      {{ project.dirty ? 'Cambios sin guardar' : project.savedAt ? `Guardado ${time(project.savedAt)}` : '' }}
      <template v-if="project.autosavedAt"> · Autoguardado {{ time(project.autosavedAt) }}</template>
    </span>
  </footer>
</template>

<style scoped>
.status { display: flex; gap: 12px; align-items: center; height: 22px; flex: none; padding: 0 10px; background: var(--bg-panel-header); border-top: 1px solid var(--border); font-size: 10px; }
.grow { flex: 1; }
.task.err { color: var(--danger); }
</style>
