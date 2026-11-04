<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

defineProps<{ title: string }>()
const emit = defineEmits<{ close: [] }>()

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="backdrop" @pointerdown.self="emit('close')">
    <div class="dialog" role="dialog" aria-modal="true" :aria-label="title">
      <h2>{{ title }}</h2>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; background: #000a; display: grid; place-items: center; z-index: 100; }
.dialog { background: var(--bg-panel); border: 1px solid var(--border-subtle); border-radius: 4px; padding: 18px 22px 16px; box-shadow: 0 12px 40px #000c; max-width: 90vw; }
h2 { margin: 0 0 14px; font-size: 13px; font-weight: 600; }
</style>
