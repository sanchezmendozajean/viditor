<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TransitionFile } from '@shared/ipc'
import { transitionHost } from '@/engine/transition-host'
import { useTimelineStore } from '@/stores/timeline'
import { useTransitionsStore } from '@/stores/transitions'
import { useUiStore } from '@/stores/ui'
import Icon from '../components/Icon.vue'
import TransitionPreview from './TransitionPreview.vue'

/**
 * Panel Transiciones: tarjetas agrupadas por categoría con miniatura animada al pasar el ratón, distintivo de origen,
 * ⚠ si hay un error y acciones (nueva, abrir carpeta, recargar, editar, duplicar, predeterminada, copiar al proyecto).
 */
const trs = useTransitionsStore()
const tl = useTimelineStore()
const ui = useUiStore()
const hover = ref<string | null>(null)
const query = ref('')

const groups = computed(() =>
  trs.categories
    .map((g) => ({ ...g, items: g.items.filter((f) => trs.nameOf(f.ref).toLowerCase().includes(query.value.toLowerCase()) || f.id.includes(query.value.toLowerCase())) }))
    .filter((g) => g.items.length > 0)
)
const originLabel: Record<string, string> = { builtin: 'Integrada', user: 'Usuario', project: 'Proyecto' }

function edit(f: TransitionFile): void {
  trs.editing = f.ref
  ui.workspace = 'transitions'
}
function activate(f: TransitionFile): void {
  if (ui.workspace === 'transitions') return void (trs.editing = f.ref)
  // En el espacio Edición un doble clic la aplica a la unión elegida (como Ctrl+D)
  const j = tl.junctionTarget()
  if (j) tl.applyTransition(j.leaveId, j.enterId, f.ref)
  else ui.showInfo('Selecciona dos clips contiguos (o un clip) y vuelve a intentarlo, o arrastra la transición a una unión.')
}
function onDragStart(e: DragEvent, f: TransitionFile): void {
  ui.dragTransitionRef = f.ref
  e.dataTransfer?.setData('application/x-viditor-transition', f.ref)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy'
}
function menu(e: MouseEvent, f: TransitionFile): void {
  ui.openMenu(e, [
    { label: 'Editar código', action: () => edit(f) },
    { label: 'Duplicar para editar', action: () => void trs.duplicate(f.ref).then((r) => r && (ui.workspace = 'transitions')) },
    { label: 'Establecer como predeterminada', disabled: trs.defaultRef === f.ref, action: () => (trs.defaultRef = f.ref) },
    { label: 'Copiar al proyecto', disabled: f.origin === 'project', action: () => void trs.copyToProject(f.ref) }
  ])
}
async function reload(): Promise<void> {
  for (const f of trs.files) transitionHost.unload(f.ref)
  trs.files = []
  trs.infos = {}
  await trs.sync(await window.viditor.transitions.list())
}
async function create(): Promise<void> {
  if (await trs.create()) ui.workspace = 'transitions'
}
</script>

<template>
  <div class="tlist" data-testid="transitions-list">
    <div class="bar">
      <button class="btn mini" data-testid="tr-new" @click="create"><Icon name="plus" :size="12" /> Nueva</button>
      <button class="btn mini" title="Abrir la carpeta de transiciones del usuario" @click="trs.openFolder('user')"><Icon name="folder-open" :size="12" /> Carpeta</button>
      <button class="btn mini" title="Volver a evaluar todas las transiciones" data-testid="tr-reload" @click="reload">Recargar</button>
      <div class="search"><Icon name="search" :size="12" /><input v-model="query" type="text" placeholder="Buscar" /></div>
    </div>
    <div class="scroll">
      <section v-for="g in groups" :key="g.name">
        <h4>{{ g.name }}</h4>
        <div class="cards">
          <div
            v-for="f in g.items"
            :key="f.ref"
            class="card"
            :class="{ active: trs.editing === f.ref, def: trs.defaultRef === f.ref }"
            :data-testid="`tcard-${f.ref}`"
            draggable="true"
            :title="trs.errorOf(f.ref) ?? trs.metaOf(f.ref)?.description ?? ''"
            @mouseenter="hover = f.ref"
            @mouseleave="hover = null"
            @dragstart="onDragStart($event, f)"
            @dragend="ui.dragTransitionRef = null"
            @click="ui.workspace === 'transitions' && (trs.editing = f.ref)"
            @dblclick="activate(f)"
            @contextmenu="menu($event, f)"
          >
            <div class="thumb">
              <TransitionPreview v-if="hover === f.ref && !trs.errorOf(f.ref)" :transition="f.ref" :width="192" :height="108" compact autoplay />
              <Icon v-else name="film" :size="22" />
              <span v-if="trs.errorOf(f.ref)" class="warn" :title="trs.errorOf(f.ref)">⚠</span>
            </div>
            <div class="info">
              <span class="name">{{ trs.nameOf(f.ref) }}</span>
              <span class="badge" :class="f.origin">{{ originLabel[f.origin] }}</span>
            </div>
          </div>
        </div>
      </section>
      <p v-if="groups.length === 0" class="dim empty">No hay transiciones que coincidan.</p>
    </div>
  </div>
</template>

<style scoped>
.tlist { display: flex; flex-direction: column; height: 100%; }
.bar { display: flex; flex-wrap: wrap; gap: 4px; padding: 5px 6px; align-items: center; }
.btn.mini { padding: 2px 8px; font-size: 10.5px; display: inline-flex; align-items: center; gap: 4px; }
.search { flex: 1 1 100px; display: flex; align-items: center; gap: 4px; background: var(--bg-input); border: 1px solid var(--border-subtle); border-radius: var(--radius); padding-left: 6px; }
.search input { flex: 1; min-width: 0; background: none; border: 0; padding: 2px 4px; font-size: 11px; }
.scroll { flex: 1; overflow: auto; padding: 0 6px 8px; }
h4 { margin: 8px 0 4px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dim); font-weight: 600; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 6px; }
.card { background: var(--bg-panel-header); border: 1px solid transparent; border-radius: var(--radius); padding: 3px; cursor: grab; }
.card:hover { background: var(--bg-hover); }
.card.active { border-color: var(--accent); }
.card.def .name::after { content: ' ★'; color: var(--marker); }
.thumb { position: relative; aspect-ratio: 16 / 9; background: #151515; display: grid; place-items: center; color: #555; overflow: hidden; }
.thumb :deep(.preview) { position: absolute; inset: 0; }
.thumb :deep(.stage) { height: 100%; aspect-ratio: auto !important; }
.warn { position: absolute; right: 3px; top: 1px; color: var(--warn); font-size: 12px; }
.info { display: flex; flex-direction: column; gap: 2px; padding: 3px 2px 1px; }
.name { font-size: 10.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge { font-size: 8.5px; align-self: flex-start; padding: 0 5px; border-radius: 8px; background: #3a3a3a; color: var(--text-dim); }
.badge.user { background: #2f4a63; color: #9ccaf5; }
.badge.project { background: #4d4a2c; color: #e3d58d; }
.empty { padding: 12px 4px; }
</style>
