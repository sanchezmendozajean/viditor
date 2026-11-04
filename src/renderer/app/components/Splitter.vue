<script setup lang="ts">
// Separador arrastrable. `dir` indica el eje del contenedor: 'row' → separador vertical.
const props = defineProps<{ dir: 'row' | 'column' }>()
const emit = defineEmits<{ drag: [delta: number] }>()

function start(e: PointerEvent): void {
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)
  let last = props.dir === 'row' ? e.clientX : e.clientY
  const move = (ev: PointerEvent): void => {
    const cur = props.dir === 'row' ? ev.clientX : ev.clientY
    emit('drag', cur - last)
    last = cur
  }
  const up = (ev: PointerEvent): void => {
    el.releasePointerCapture(ev.pointerId)
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
  }
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
}
</script>

<template>
  <div class="splitter" :class="dir" role="separator" @pointerdown.prevent="start" />
</template>

<style scoped>
.splitter { flex: none; background: var(--bg-app); position: relative; z-index: 2; }
.splitter.row { width: 4px; cursor: col-resize; }
.splitter.column { height: 4px; cursor: row-resize; }
.splitter:hover, .splitter:active { background: var(--accent); }
</style>
