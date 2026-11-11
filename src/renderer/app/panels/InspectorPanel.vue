<script setup lang="ts">
import { computed, ref } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useTimelineStore } from '@/stores/timeline'
import Panel from '../components/Panel.vue'
import ClipInspector from './ClipInspector.vue'
import TransitionInspector from './TransitionInspector.vue'
import ProjectSettings from './ProjectSettings.vue'

const project = useProjectStore()
const tl = useTimelineStore()

const tab = ref('inspector')
const tabs = [
  { id: 'inspector', label: 'Inspector' },
  { id: 'settings', label: 'Proyecto' }
]

const track = computed(() => project.project?.tracks.find((t) => t.id === tl.selectedTrackId))
</script>

<template>
  <Panel title="Inspector" help="transforms" :tabs="tabs" :model-value="tab" @update:model-value="tab = $event">
    <ProjectSettings v-if="tab === 'settings'" />
    <TransitionInspector v-else-if="project.project && tl.selectedTransition" />
    <ClipInspector v-else-if="project.project && tl.selection.length > 0" />
    <div v-else-if="project.project && track" class="info" data-testid="inspector-track">
      <h3>Pista: {{ track.name }}</h3>
      <dl>
        <dt>Tipo</dt><dd>{{ track.kind === 'video' ? 'Video' : 'Audio' }}</dd>
        <dt>Volumen</dt><dd class="mono">{{ Math.round(track.volume * 100) }}%</dd>
        <dt>Bloqueada</dt><dd>{{ track.locked ? 'Sí' : 'No' }}</dd>
      </dl>
    </div>
    <div v-else-if="project.project" class="info" data-testid="inspector">
      <p class="dim">Selecciona un clip, una pista o una transición para ver sus propiedades.</p>
    </div>
  </Panel>
</template>

<style scoped>
.info { padding: 5px; }
h3 { margin: 0 0 8px; font-size: 11px; font-weight: 600; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; margin: 0; align-items: center; }
dt { color: var(--text-dim); }
dd { margin: 0; }
.hint { margin-top: 12px; }
select { width: 100%; font-size: 11px; }
.sw { display: inline-block; width: 12px; height: 12px; border: 1px solid var(--border-subtle); vertical-align: -2px; }
</style>
