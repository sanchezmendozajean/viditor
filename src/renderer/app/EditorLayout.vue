<script setup lang="ts">
import { onUnmounted, reactive, watch } from 'vue'
import { engine } from '@/engine/engine'
import { useUiStore, WORKSPACES } from '@/stores/ui'
import { useProjectStore } from '@/stores/project'
import Splitter from './components/Splitter.vue'
import Icon from './components/Icon.vue'
import ProjectPanel from './panels/ProjectPanel.vue'
import MonitorPanel from './panels/MonitorPanel.vue'
import InspectorPanel from './panels/InspectorPanel.vue'
import PlaceholderPanel from './panels/PlaceholderPanel.vue'
import MetersPanel from './panels/MetersPanel.vue'
import MixerPanel from './panels/MixerPanel.vue'
import { useTimelineStore } from '@/stores/timeline'
import TimelinePanel from './timeline/TimelinePanel.vue'

const ui = useUiStore()
const tlStore = useTimelineStore()


const project = useProjectStore()

// El monitor se redibuja ante cualquier cambio visible del modelo (clips, pistas, medios, ajustes) o del cabezal.
watch(() => tlStore.playhead, () => engine.requestRender())
watch(
  () => [project.project?.clips, project.project?.tracks, project.project?.media, project.project?.settings.width, project.project?.settings.height, project.project?.settings.background],
  () => {
    engine.applySize()
    engine.requestRender()
  },
  { deep: true }
)
onUnmounted(() => engine.reset())

const size = reactive({ left: 300, right: 300, bottom: 260, meters: 120, tLeft: 220, tRight: 340, console: 160 })
const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

function setWorkspace(id: (typeof WORKSPACES)[number]['id']): void {
  ui.workspace = id
  project.mutate((p) => (p.view.workspace = id))
}
</script>

<template>
  <div class="editor">
    <div class="workspaces">
      <button
        v-for="w in WORKSPACES"
        :key="w.id"
        class="ws"
        :class="{ active: ui.workspace === w.id }"
        :data-testid="`ws-${w.id}`"
        @click="setWorkspace(w.id)"
      >
        {{ w.label }}
      </button>
      <div class="grow" />
      <div class="cmd"><Icon name="search" :size="13" /> Buscar comando <span class="dim">Ctrl+Shift+P</span></div>
    </div>

    <!-- Edición -->
    <div v-if="ui.workspace === 'edit'" class="cols">
      <div class="row top">
        <div class="pane" :style="{ width: size.left + 'px' }"><ProjectPanel /></div>
        <Splitter dir="row" @drag="size.left = clamp(size.left + $event, 180, 640)" />
        <div class="pane flex"><MonitorPanel /></div>
        <Splitter dir="row" @drag="size.right = clamp(size.right - $event, 200, 560)" />
        <div class="pane" :style="{ width: size.right + 'px' }"><InspectorPanel /></div>
      </div>
      <Splitter dir="column" @drag="size.bottom = clamp(size.bottom - $event, 120, 560)" />
      <div class="row" :style="{ height: size.bottom + 'px' }">
        <div class="pane flex"><TimelinePanel /></div>
        <Splitter dir="row" @drag="size.meters = clamp(size.meters - $event, 60, 300)" />
        <div class="pane" :style="{ width: size.meters + 'px' }"><MetersPanel /></div>
      </div>
    </div>

    <!-- Transiciones -->
    <div v-else-if="ui.workspace === 'transitions'" class="cols">
      <div class="row top">
        <div class="pane" :style="{ width: size.tLeft + 'px' }"><PlaceholderPanel title="Transiciones" hint="Lista de transiciones (fase 4)." help="transitions" /></div>
        <Splitter dir="row" @drag="size.tLeft = clamp(size.tLeft + $event, 160, 480)" />
        <div class="pane flex"><PlaceholderPanel title="Editor de código" hint="Monaco llega en la fase 4." /></div>
        <Splitter dir="row" @drag="size.tRight = clamp(size.tRight - $event, 220, 640)" />
        <div class="pane" :style="{ width: size.tRight + 'px' }"><PlaceholderPanel title="Vista previa y parámetros" hint="progress 0 → 1" /></div>
      </div>
      <Splitter dir="column" @drag="size.console = clamp(size.console - $event, 80, 400)" />
      <div class="row" :style="{ height: size.console + 'px' }"><div class="pane flex"><PlaceholderPanel title="Consola" hint="Sin mensajes." mono /></div></div>
    </div>

    <!-- Audio -->
    <div v-else-if="ui.workspace === 'audio'" class="cols">
      <div class="row top"><div class="pane flex"><MixerPanel /></div></div>
      <Splitter dir="column" @drag="size.bottom = clamp(size.bottom - $event, 120, 560)" />
      <div class="row" :style="{ height: size.bottom + 'px' }"><div class="pane flex"><TimelinePanel /></div></div>
    </div>

    <!-- Exportar -->
    <div v-else class="cols">
      <div class="row top">
        <div class="pane" :style="{ width: size.left + 'px' }"><PlaceholderPanel title="Exportar" hint="Formulario de exportación (fase 5)." /></div>
        <Splitter dir="row" @drag="size.left = clamp(size.left + $event, 220, 640)" />
        <div class="pane flex"><MonitorPanel /></div>
      </div>
      <Splitter dir="column" @drag="size.console = clamp(size.console - $event, 80, 400)" />
      <div class="row" :style="{ height: size.console + 'px' }"><div class="pane flex"><PlaceholderPanel title="Cola de exportación" hint="Sin exportaciones." /></div></div>
    </div>
  </div>
</template>

<style scoped>
.editor { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.workspaces { display: flex; align-items: center; height: 28px; flex: none; background: var(--bg-app); padding: 0 6px; gap: 2px; border-bottom: 1px solid var(--border); }
.ws { background: none; border: 0; padding: 0 12px; height: 100%; cursor: pointer; color: var(--text-dim); border-bottom: 2px solid transparent; }
.ws:hover { color: var(--text); }
.ws.active { color: var(--text); border-bottom-color: var(--accent); }
.grow { flex: 1; }
.cmd { display: flex; align-items: center; gap: 6px; background: var(--bg-input); border: 1px solid var(--border-subtle); border-radius: var(--radius); padding: 2px 10px; color: var(--text-dim); }
.cols { flex: 1; display: flex; flex-direction: column; min-height: 0; padding: 0 4px 4px; background: var(--bg-app); }
.row { display: flex; min-height: 0; flex: none; }
.row.top { flex: 1; }
.pane { display: flex; min-width: 0; min-height: 0; flex: none; }
.pane.flex { flex: 1; }
</style>
