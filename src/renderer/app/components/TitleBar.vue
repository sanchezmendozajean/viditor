<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useUiStore } from '@/stores/ui'
import { useTimelineStore } from '@/stores/timeline'
import Icon from './Icon.vue'

interface MenuItem { label: string; shortcut?: string; action?: () => void; disabled?: boolean; separator?: boolean }
interface Menu { label: string; items: MenuItem[] }

const project = useProjectStore()
const ui = useUiStore()
const tl = useTimelineStore()
const openMenu = ref<number | null>(null)
let offMax: (() => void) | undefined

onMounted(() => {
  offMax = window.viditor.window.onMaximizedChange((m) => (ui.maximized = m))
  window.addEventListener('pointerdown', closeOnOutside)
})
onUnmounted(() => {
  offMax?.()
  window.removeEventListener('pointerdown', closeOnOutside)
})
function closeOnOutside(e: PointerEvent): void {
  if (!(e.target as HTMLElement).closest('.menus')) openMenu.value = null
}

function menus(): Menu[] {
  const has = project.isOpen
  return [
    {
      label: 'Archivo',
      items: [
        { label: 'Nuevo proyecto…', shortcut: 'Ctrl+N', action: () => (ui.newProjectOpen = true) },
        { label: 'Abrir proyecto…', shortcut: 'Ctrl+O', action: () => void project.openWithDialog() },
        { separator: true, label: '' },
        { label: 'Guardar', shortcut: 'Ctrl+S', disabled: !has, action: () => void project.save() },
        { label: 'Importar medios…', shortcut: 'Ctrl+I', disabled: !has, action: () => void importDialog() },
        { separator: true, label: '' },
        { label: 'Cerrar proyecto', disabled: !has, action: () => void project.close() },
        { label: 'Salir', action: () => window.viditor.window.close() }
      ]
    },
    {
      label: 'Editar',
      items: [
        { label: tl.undoLabel ? `Deshacer ${tl.undoLabel}` : 'Deshacer', shortcut: 'Ctrl+Z', disabled: !tl.canUndo, action: () => tl.undo() },
        { label: tl.redoLabel ? `Rehacer ${tl.redoLabel}` : 'Rehacer', shortcut: 'Ctrl+Shift+Z', disabled: !tl.canRedo, action: () => tl.redo() },
        { separator: true, label: '' },
        { label: 'Seleccionar todo', shortcut: 'Ctrl+A', disabled: !has, action: () => tl.selectAll() }
      ]
    },
    {
      label: 'Clip',
      items: [
        { label: 'Dividir en el cabezal', shortcut: 'Ctrl+K', disabled: !has, action: () => tl.splitAtPlayhead() },
        { label: 'Eliminar', shortcut: 'Supr', disabled: !has || !tl.selection.length, action: () => tl.deleteSelection(false) },
        { label: 'Eliminar y cerrar hueco', shortcut: 'Mayús+Supr', disabled: !has || !tl.selection.length, action: () => tl.deleteSelection(true) },
        { separator: true, label: '' },
        { label: 'Recortar inicio al cabezal', shortcut: 'Q', disabled: !has, action: () => tl.trimToPlayhead('start') },
        { label: 'Recortar final al cabezal', shortcut: 'W', disabled: !has, action: () => tl.trimToPlayhead('end') },
        { label: 'Habilitar / deshabilitar', shortcut: 'Mayús+E', disabled: !has || !tl.selection.length, action: () => tl.toggleEnabled() }
      ]
    },
    {
      label: 'Secuencia',
      items: [
        { label: 'Agregar pista de video', disabled: !has, action: () => tl.addTrack('video', null, 'above') },
        { label: 'Agregar pista de audio', disabled: !has, action: () => tl.addTrack('audio', null, 'below') },
        { separator: true, label: '' },
        { label: 'Agregar marcador', shortcut: 'M', disabled: !has, action: () => tl.addMarker() },
        { label: 'Ajustar zoom a la secuencia', shortcut: '\\', disabled: !has, action: () => tl.fit(tl.viewWidth - 170) }
      ]
    },
    { label: 'Transiciones', items: [{ label: 'Disponible en la fase 4', disabled: true }] },
    { label: 'Ver', items: [{ label: 'Espacio de trabajo: Edición', disabled: !has, action: () => (ui.workspace = 'edit') }] },
    { label: 'Ventana', items: [{ label: 'Minimizar', action: () => window.viditor.window.minimize() }] },
    {
      label: 'Ayuda',
      items: [
        { label: 'Documentación', shortcut: 'F1', action: () => window.viditor.help.open('index') },
        { label: 'Atajos de teclado', action: () => window.viditor.help.open('shortcuts') }
      ]
    }
  ]
}

const win = window.viditor.window
const importDialog = (): Promise<void> => project.importWithDialog()

function run(item: MenuItem): void {
  openMenu.value = null
  if (!item.disabled) item.action?.()
}
</script>

<template>
  <div class="titlebar drag">
    <div class="logo no-drag" aria-label="Viditor">V</div>
    <nav class="menus no-drag">
      <div v-for="(m, i) in menus()" :key="m.label" class="menu">
        <button class="menu-btn" :class="{ open: openMenu === i }" @click="openMenu = openMenu === i ? null : i" @pointerenter="openMenu !== null && (openMenu = i)">
          {{ m.label }}
        </button>
        <div v-if="openMenu === i" class="dropdown">
          <template v-for="(it, j) in m.items" :key="j">
            <hr v-if="it.separator" />
            <button v-else class="item" :disabled="it.disabled" @click="run(it)">
              <span>{{ it.label }}</span><span class="dim">{{ it.shortcut }}</span>
            </button>
          </template>
        </div>
      </div>
    </nav>
    <div class="title">{{ project.isOpen ? `${project.projectName}${project.dirty ? ' •' : ''} — Viditor` : 'Viditor' }}</div>
    <div class="win no-drag">
      <button class="wbtn" title="Minimizar" @click="win.minimize()"><Icon name="minus" :size="14" /></button>
      <button class="wbtn" :title="ui.maximized ? 'Restaurar' : 'Maximizar'" @click="win.toggleMaximize()">
        <Icon :name="ui.maximized ? 'copy' : 'square'" :size="12" />
      </button>
      <button class="wbtn close" title="Cerrar" @click="win.close()"><Icon name="x" :size="14" /></button>
    </div>
  </div>
</template>

<style scoped>
.titlebar { display: flex; align-items: center; height: 32px; background: var(--bg-panel-header); border-bottom: 1px solid var(--border); flex: none; position: relative; z-index: 50; }
.logo { width: 32px; height: 32px; display: grid; place-items: center; font-weight: 700; color: #fff; background: var(--accent); }
.menus { display: flex; height: 100%; }
.menu { position: relative; }
.menu-btn { height: 32px; padding: 0 10px; background: none; border: 0; cursor: pointer; font-size: 11px; }
.menu-btn:hover, .menu-btn.open { background: var(--bg-hover); }
.dropdown { position: absolute; top: 32px; left: 0; min-width: 230px; background: var(--bg-panel-header); border: 1px solid var(--border-subtle); box-shadow: 0 6px 18px #000a; padding: 3px 0; }
.item { display: flex; justify-content: space-between; gap: 24px; width: 100%; text-align: left; background: none; border: 0; padding: 5px 14px; cursor: pointer; font-size: 11px; }
.item:hover:not(:disabled) { background: var(--accent); color: #fff; }
.item:hover:not(:disabled) .dim { color: #fff; }
.item:disabled { color: var(--text-dim); cursor: default; }
hr { border: 0; border-top: 1px solid var(--border-subtle); margin: 3px 0; }
.title { flex: 1; text-align: center; color: var(--text-dim); pointer-events: none; }
.win { display: flex; height: 100%; }
.wbtn { width: 46px; height: 100%; background: none; border: 0; color: var(--text-dim); cursor: pointer; display: grid; place-items: center; }
.wbtn:hover { background: var(--bg-hover); color: var(--text); }
.wbtn.close:hover { background: var(--danger); color: #fff; }
</style>
