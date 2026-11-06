<script setup lang="ts">
import { computed, ref } from 'vue'
import type { MediaItem } from '@shared/project-schema'
import { useProjectStore } from '@/stores/project'
import { useUiStore } from '@/stores/ui'
import { useTimelineStore } from '@/stores/timeline'
import Panel from '../components/Panel.vue'
import Icon from '../components/Icon.vue'

defineProps<{ tabs?: { id: string; label: string }[]; modelValue?: string }>()
defineEmits<{ 'update:modelValue': [id: string] }>()
const project = useProjectStore()
const ui = useUiStore()
const view = ref<'grid' | 'list'>('grid')
const query = ref('')
const dragOver = ref(false)
const currentBin = ref<string | null>(null)

const bins = computed(() => (project.project?.bins ?? []).filter((b) => b.parentId === currentBin.value))
const items = computed(() =>
  (project.project?.media ?? []).filter(
    (m) => m.binId === currentBin.value && fileName(m).toLowerCase().includes(query.value.toLowerCase())
  )
)
const breadcrumb = computed(() => {
  const out: { id: string | null; name: string }[] = []
  let id = currentBin.value
  while (id) {
    const b = project.project?.bins.find((x) => x.id === id)
    if (!b) break
    out.unshift({ id: b.id, name: b.name })
    id = b.parentId
  }
  return out
})

function fileName(m: MediaItem): string {
  return m.path.split('/').pop() ?? m.path
}
function duration(m: MediaItem): string {
  if (m.kind === 'image' || !m.probe) return ''
  const s = Math.round(m.probe.duration)
  const mm = Math.floor(s / 60)
  return `${mm}:${String(s % 60).padStart(2, '0')}`
}
function resolution(m: MediaItem): string {
  return m.probe?.width ? `${m.probe.width}×${m.probe.height}` : '—'
}
function fps(m: MediaItem): string {
  const f = m.probe?.fps
  return f ? String(Math.round((f.num / f.den) * 100) / 100) : '—'
}
function thumb(m: MediaItem): string {
  return `${window.viditor.media.thumbnailUrl(m.id)}?v=${ui.thumbVersion[m.id] ?? 0}`
}
function isMissing(m: MediaItem): boolean {
  return project.missing.includes(m.id)
}
function badge(m: MediaItem): { icon: 'folder' | 'link' | 'alert'; title: string } {
  if (isMissing(m)) return { icon: 'alert', title: 'Archivo faltante' }
  return m.storage === 'project' ? { icon: 'folder', title: 'Dentro del proyecto' } : { icon: 'link', title: 'Referencia externa' }
}
function showLoaded(e: Event): void {
  ;(e.target as HTMLElement).style.visibility = ''
}
function hideBroken(e: Event): void {
  ;(e.target as HTMLElement).style.visibility = 'hidden'
}

function onDragStart(e: DragEvent, m: MediaItem): void {
  ui.dragMediaId = m.id
  e.dataTransfer?.setData('application/x-viditor-media', m.id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy'
}
function append(m: MediaItem): void {
  if (isMissing(m)) void project.relink(m.id)
  else useTimelineStore().addMedia(m.id)
}

function onDrop(e: DragEvent): void {
  dragOver.value = false
  const files = Array.from(e.dataTransfer?.files ?? [])
  const paths = files.map((f) => window.viditor.media.pathForFile(f)).filter(Boolean)
  void project.importPaths(paths)
}
</script>

<template>
  <Panel title="Proyecto" help="import" :tabs="tabs" :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
    <div class="wrap" data-testid="project-panel" :class="{ over: dragOver }" @dragover.prevent="dragOver = true" @dragleave="dragOver = false" @drop.prevent="onDrop">
      <div class="bar">
        <div class="search"><Icon name="search" :size="13" /><input v-model="query" type="text" placeholder="Buscar" /></div>
        <button class="icon-btn" title="Cuadrícula" :class="{ on: view === 'grid' }" @click="view = 'grid'"><Icon name="grid" :size="14" /></button>
        <button class="icon-btn" title="Lista" :class="{ on: view === 'list' }" @click="view = 'list'"><Icon name="list" :size="14" /></button>
        <button class="icon-btn" title="Importar (Ctrl+I)" data-testid="import-btn" @click="project.importWithDialog()"><Icon name="download" :size="14" /></button>
      </div>
      <div v-if="breadcrumb.length" class="crumbs">
        <a @click="currentBin = null">Raíz</a>
        <template v-for="c in breadcrumb" :key="c.id ?? 'root'"> / <a @click="currentBin = c.id">{{ c.name }}</a></template>
      </div>

      <div v-if="project.missing.length" class="warn" data-testid="missing-banner">
        <Icon name="alert" :size="13" /> Faltan {{ project.missing.length }} archivo(s) de medios.
        <a @click="project.relink(project.missing[0] as string)">Revincular…</a>
      </div>

      <div v-if="bins.length === 0 && items.length === 0" class="empty" data-testid="media-empty">
        <Icon name="download" :size="28" />
        <p>Arrastra videos, audio o imágenes aquí<br /><span class="dim">o usa Archivo › Importar…</span></p>
      </div>

      <div v-else-if="view === 'grid'" class="grid">
        <div v-for="b in bins" :key="b.id" class="card bin" @dblclick="currentBin = b.id">
          <Icon name="folder" :size="36" /><span class="name">{{ b.name }}</span>
        </div>
        <div v-for="m in items" :key="m.id" class="card" data-testid="media-item" :title="`${m.path}\nDoble clic: agregar al final de la línea de tiempo`" draggable="true" @dragstart="onDragStart($event, m)" @dragend="ui.dragMediaId = null" @dblclick="append(m)">
          <div class="thumb">
            <img v-if="m.kind !== 'audio'" :src="thumb(m)" alt="" draggable="false" @error="hideBroken" @load="showLoaded" />
            <Icon v-else name="music" :size="28" />
            <span class="badge" :class="{ missing: isMissing(m) }" :title="badge(m).title"><Icon :name="badge(m).icon" :size="12" /></span>
            <button v-if="isMissing(m)" class="relink" data-testid="relink" title="Localizar el archivo" @click.stop="project.relink(m.id)" @dblclick.stop>Revincular…</button>
            <span class="dur mono">{{ duration(m) }}</span>
          </div>
          <span class="name">{{ fileName(m) }}</span>
        </div>
      </div>

      <table v-else class="list">
        <thead><tr><th>Nombre</th><th>Duración</th><th>Resolución</th><th>fps</th><th>Códec</th><th>Ubicación</th></tr></thead>
        <tbody>
          <tr v-for="b in bins" :key="b.id" @dblclick="currentBin = b.id"><td colspan="6"><Icon name="folder" :size="13" /> {{ b.name }}</td></tr>
          <tr v-for="m in items" :key="m.id" data-testid="media-row" draggable="true" @dragstart="onDragStart($event, m)" @dragend="ui.dragMediaId = null" @dblclick="append(m)">
            <td><Icon :name="badge(m).icon" :size="12" /> {{ fileName(m) }} <button v-if="isMissing(m)" class="relink inline" data-testid="relink" @click.stop="project.relink(m.id)">Revincular…</button></td>
            <td class="mono">{{ duration(m) }}</td><td>{{ resolution(m) }}</td><td>{{ fps(m) }}</td>
            <td>{{ m.probe?.videoCodec ?? m.probe?.audioCodec ?? '—' }}</td><td class="dim">{{ m.storage === 'project' ? 'Proyecto' : m.path }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </Panel>
</template>

<style scoped>
.wrap { min-height: 100%; display: flex; flex-direction: column; }
.wrap.over { outline: 2px dashed var(--accent); outline-offset: -4px; }
.bar { display: flex; gap: 2px; padding: 4px; align-items: center; }
.search { flex: 1; display: flex; align-items: center; gap: 4px; background: var(--bg-input); border: 1px solid var(--border-subtle); border-radius: var(--radius); padding-left: 6px; }
.search input { flex: 1; min-width: 0; background: none; border: 0; padding: 3px 4px; font-size: 11px; }
.icon-btn.on { color: var(--accent); }
.warn { margin: 0 6px 4px; padding: 4px 8px; border: 1px solid var(--danger); border-radius: var(--radius); color: var(--text); display: flex; gap: 6px; align-items: center; }
.warn a { margin-left: auto; color: var(--accent); cursor: pointer; }
.crumbs { padding: 0 8px 4px; color: var(--text-dim); }
.crumbs a { cursor: pointer; color: var(--accent); }
.empty { flex: 1; display: grid; place-content: center; justify-items: center; text-align: center; color: var(--text-dim); gap: 4px; padding: 24px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 8px; padding: 6px 8px; }
.card { display: flex; flex-direction: column; gap: 3px; padding: 3px; border-radius: var(--radius); }
.card:hover { background: var(--bg-hover); }
.card.bin { align-items: center; justify-content: center; min-height: 80px; color: var(--text-dim); cursor: pointer; }
.thumb { position: relative; aspect-ratio: 16 / 9; background: #111; display: grid; place-items: center; color: var(--clip-audio); overflow: hidden; }
.thumb img { width: 100%; height: 100%; object-fit: cover; position: absolute; inset: 0; }
.badge { position: absolute; left: 3px; top: 3px; color: #fff; background: #000a; border-radius: 2px; padding: 1px 2px; display: flex; }
.badge.missing { background: var(--danger); }
.relink { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); background: var(--danger); color: #fff; border: 0; border-radius: var(--radius); padding: 2px 8px; font-size: 10px; cursor: pointer; white-space: nowrap; }
.relink.inline { position: static; transform: none; margin-left: 6px; }
.dur { position: absolute; right: 3px; bottom: 3px; font-size: 10px; background: #000b; padding: 0 3px; border-radius: 2px; }
.name { font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.list { width: 100%; border-collapse: collapse; font-size: 10px; }
.list th { text-align: left; color: var(--text-dim); font-weight: 400; padding: 3px 8px; border-bottom: 1px solid var(--border); }
.list td { padding: 3px 8px; white-space: nowrap; max-width: 200px; overflow: hidden; text-overflow: ellipsis; }
.list tbody tr:hover { background: var(--bg-hover); }
</style>
