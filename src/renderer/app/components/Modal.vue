<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import Icon from './Icon.vue'

defineProps<{ title: string; closable?: boolean }>()
const emit = defineEmits<{ close: [] }>()

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="backdrop" @pointerdown.self="!closable && emit('close')">
    <div class="dialog" role="dialog" aria-modal="true" :aria-label="title">
      <button v-if="closable" class="x" title="Cerrar" aria-label="Cerrar" data-testid="modal-close" @click="emit('close')"><Icon name="x" :size="14" /></button>
      <h2>{{ title }}</h2>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; background: #000a; display: grid; place-items: center; z-index: 100; }
.dialog { background: var(--bg-panel); border: 1px solid var(--border-subtle); border-radius: 4px; padding: 18px 22px 16px; box-shadow: 0 12px 40px #000c; max-width: 90vw; }
.dialog { position: relative; }
.x { position: absolute; top: 10px; right: 10px; display: grid; place-items: center; width: 24px; height: 24px; padding: 0; background: none; border: 0; border-radius: 3px; cursor: pointer; color: var(--text-dim); }
.x:hover { background: var(--bg-hover); color: var(--text); }
h2 { margin: 0 0 14px; font-size: 13px; font-weight: 600; }
</style>
