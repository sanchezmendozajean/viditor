<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useProjectStore } from '@/stores/project'
import { useUiStore } from '@/stores/ui'
import { useTimelineStore } from '@/stores/timeline'
import { useTransitionsStore } from '@/stores/transitions'
import { COMMAND_BY_ID } from '@shared/commands-meta'
import { executeCommand, isAvailable, shortcutLabel } from '../commands'
import Icon from './Icon.vue'
import type { IconName } from './Icon.vue'

interface MenuItem { label: string; icon?: IconName; shortcut?: string; action?: () => void; disabled?: boolean; separator?: boolean }
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

/** Entrada de menú de un comando: etiqueta, atajo efectivo (con las personalizaciones) y disponibilidad vienen del registro. */
function cmd(id: string, icon?: IconName, label?: string): MenuItem {
  const meta = COMMAND_BY_ID.get(id)
  return { icon, label: label ?? meta?.label ?? id, shortcut: shortcutLabel(id), disabled: meta ? !isAvailable(meta) : true, action: () => void executeCommand(id) }
}
const sep: MenuItem = { separator: true, label: '' }

function menus(): Menu[] {
  const has = project.isOpen
  return [
    {
      label: 'Archivo',
      items: [cmd('file.new', 'filePlus'), cmd('file.open', 'folder-open'), sep, cmd('file.save', 'save'), cmd('file.import', 'download'), cmd('export.frame', 'image'), sep, cmd('file.openFolder', 'folder'), sep, cmd('file.close', 'x'), { label: 'Salir', icon: 'logOut', action: () => window.viditor.window.close() }]
    },
    {
      label: 'Editar',
      items: [
        cmd('edit.undo', 'undo', tl.undoLabel ? `Deshacer ${tl.undoLabel}` : 'Deshacer'),
        cmd('edit.redo', 'redo', tl.redoLabel ? `Rehacer ${tl.redoLabel}` : 'Rehacer'),
        sep,
        cmd('edit.copy', 'copy'), cmd('edit.paste', 'paste'), sep, cmd('edit.selectAll', 'boxSelect'),
        sep,
        cmd('app.preferences', 'settings')
      ]
    },
    {
      label: 'Clip',
      items: [cmd('clip.split', 'razor'), cmd('edit.delete', 'trash'), cmd('edit.deleteRipple'), sep, cmd('clip.trimStart', 'arrowStart'), cmd('clip.trimEnd', 'arrowEnd'), cmd('clip.toggleEnabled', 'eye'), cmd('clip.resetTransform', 'reset'), sep, cmd('key.toggleTransform'), cmd('key.toggleOpacity'), cmd('key.toggleVolume'), cmd('key.prev', 'left'), cmd('key.next', 'rightArrow')]
    },
    {
      label: 'Secuencia',
      items: [cmd('track.addVideo', 'video'), cmd('track.addAudio', 'music'), sep, cmd('marker.add', 'flag'), cmd('marker.prev', 'left'), cmd('marker.next', 'rightArrow'), sep, cmd('zoom.fit', 'maximize'), cmd('range.in'), cmd('range.out')]
    },
    {
      label: 'Transiciones',
      items: [
        cmd('transition.default', 'sparkles'),
        cmd('view.transitions', 'sparkles', 'Abrir el espacio de Transiciones'),
        { icon: 'folder-open', label: 'Abrir la carpeta de transiciones del usuario', disabled: !has, action: () => void useTransitionsStore().openFolder('user') }
      ]
    },
    { label: 'Ver', items: [cmd('view.edit', 'film'), cmd('view.transitions', 'sparkles'), cmd('view.audio', 'vol'), cmd('view.export', 'upload', 'Espacio de trabajo: Exportar'), sep, cmd('app.palette', 'search')] },
    { label: 'Ventana', items: [{ label: 'Minimizar', icon: 'minus', action: () => window.viditor.window.minimize() }] },
    { label: 'Ayuda', items: [cmd('help.docs', 'bookOpen'), cmd('help.shortcuts', 'keyboard')] }
  ]
}

const win = window.viditor.window

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
              <span class="lbl"><span class="ico"><Icon v-if="it.icon" :name="it.icon" :size="13" /></span>{{ it.label }}</span><span class="dim">{{ it.shortcut }}</span>
            </button>
          </template>
        </div>
      </div>
    </nav>
    <div class="title">
      <template v-if="project.isOpen">{{ project.projectName }}<span v-if="project.dirty" class="dirty" title="Cambios sin guardar" data-testid="dirty-dot"></span></template>
    </div>
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
.dropdown { position: absolute; top: 32px; left: 0; min-width: 230px; width: max-content; background: var(--bg-panel-header); border: 1px solid var(--border-subtle); box-shadow: 0 6px 18px #000a; padding: 3px 0; }
.item { white-space: nowrap; display: flex; justify-content: space-between; gap: 24px; width: 100%; text-align: left; background: none; border: 0; padding: 5px 14px; cursor: pointer; font-size: 11px; }
.item:hover:not(:disabled) { background: var(--accent); color: #fff; }
.item:hover:not(:disabled) .dim { color: #fff; }
.item:disabled { color: var(--text-dim); cursor: default; }
.lbl { display: flex; align-items: center; gap: 8px; }
.ico { width: 14px; display: inline-flex; justify-content: center; }
hr { border: 0; border-top: 1px solid var(--border-subtle); margin: 3px 0; }
.title { flex: 1; text-align: center; color: var(--text-dim); pointer-events: none; }
.dirty { display: inline-block; width: 10px; height: 10px; margin-left: 8px; border-radius: 50%; background: var(--accent); vertical-align: middle; }
.win { display: flex; height: 100%; }
.wbtn { width: 46px; height: 100%; background: none; border: 0; color: var(--text-dim); cursor: pointer; display: grid; place-items: center; }
.wbtn:hover { background: var(--bg-hover); color: var(--text); }
.wbtn.close:hover { background: var(--danger); color: #fff; }
</style>
