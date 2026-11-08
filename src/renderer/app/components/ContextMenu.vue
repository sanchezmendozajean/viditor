<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useUiStore, type MenuEntry } from '@/stores/ui'
import Icon from './Icon.vue'

const ui = useUiStore()
const menu = computed(() => ui.contextMenu)
// Evita que el menú se salga de la ventana
const pos = computed(() => {
  const m = menu.value
  if (!m) return { left: '0px', top: '0px' }
  const h = m.items.length * 22 + 8
  return { left: Math.min(m.x, window.innerWidth - 240) + 'px', top: Math.min(m.y, window.innerHeight - h - 4) + 'px' }
})

function run(item: MenuEntry): void {
  if (item.disabled || item.separator) return
  ui.contextMenu = null
  item.action?.()
}
function close(e: Event): void {
  if (menu.value && !(e.target as HTMLElement).closest?.('.ctx')) ui.contextMenu = null
}
function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') ui.contextMenu = null
}
onMounted(() => {
  window.addEventListener('pointerdown', close, true)
  window.addEventListener('keydown', onKey)
  window.addEventListener('blur', () => (ui.contextMenu = null))
})
onUnmounted(() => {
  window.removeEventListener('pointerdown', close, true)
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div v-if="menu" class="ctx" :style="pos" data-testid="context-menu" @contextmenu.prevent>
    <template v-for="(it, i) in menu.items" :key="i">
      <hr v-if="it.separator" />
      <button v-else class="item" :disabled="it.disabled" @click="run(it)">
        <span class="lbl"><span class="ico"><Icon v-if="it.icon" :name="it.icon" :size="13" /></span>{{ it.label }}</span><span class="dim">{{ it.shortcut }}</span>
      </button>
    </template>
  </div>
</template>

<style scoped>
.ctx { position: fixed; z-index: 300; min-width: 220px; background: var(--bg-panel-header); border: 1px solid var(--border-subtle); box-shadow: 0 6px 18px #000a; padding: 3px 0; }
.item { display: flex; justify-content: space-between; gap: 24px; width: 100%; text-align: left; background: none; border: 0; padding: 4px 12px; cursor: pointer; }
.item:hover:not(:disabled) { background: var(--accent); color: #fff; }
.item:hover:not(:disabled) .dim { color: #fff; }
.item:disabled { color: var(--text-dim); cursor: default; }
.lbl { display: flex; align-items: center; gap: 8px; }
.ico { width: 14px; display: inline-flex; justify-content: center; }
hr { border: 0; border-top: 1px solid var(--border-subtle); margin: 3px 0; }
</style>
