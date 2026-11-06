<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'

/**
 * Número "scrubby" estilo Adobe: arrastra horizontalmente para cambiar el valor; un clic abre la edición.
 * Emite `start` antes del primer cambio y `end` al terminar, para agrupar el arrastre en un solo comando.
 */
const props = withDefaults(
  defineProps<{ modelValue: number; step?: number; min?: number; max?: number; decimals?: number; suffix?: string; disabled?: boolean }>(),
  { step: 1, decimals: 0, suffix: '' }
)
const emit = defineEmits<{ 'update:modelValue': [v: number]; start: []; end: [] }>()

const editing = ref(false)
const input = ref<HTMLInputElement | null>(null)
const text = ref('')
const shown = computed(() => `${props.modelValue.toFixed(props.decimals)}${props.suffix}`)

const clamp = (v: number): number => Math.min(props.max ?? Infinity, Math.max(props.min ?? -Infinity, v))
const round = (v: number): number => Number(v.toFixed(Math.max(props.decimals, 3)))

function down(e: PointerEvent): void {
  if (props.disabled || editing.value || e.button !== 0) return
  const el = e.currentTarget as HTMLElement
  el.setPointerCapture(e.pointerId)
  const x0 = e.clientX
  const v0 = props.modelValue
  let dragging = false
  const move = (ev: PointerEvent): void => {
    const dx = ev.clientX - x0
    if (!dragging && Math.abs(dx) < 3) return
    if (!dragging) {
      dragging = true
      emit('start')
    }
    const fine = ev.shiftKey ? 0.1 : ev.ctrlKey ? 10 : 1
    emit('update:modelValue', round(clamp(v0 + dx * props.step * fine)))
  }
  const up = async (ev: PointerEvent): Promise<void> => {
    el.releasePointerCapture(ev.pointerId)
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
    if (dragging) return emit('end')
    editing.value = true
    text.value = String(round(props.modelValue))
    await nextTick()
    input.value?.select()
  }
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
}

function commit(): void {
  if (!editing.value) return
  editing.value = false
  const v = Number(text.value.replace(',', '.'))
  if (Number.isFinite(v) && v !== props.modelValue) {
    emit('start')
    emit('update:modelValue', round(clamp(v)))
    emit('end')
  }
}
</script>

<template>
  <span class="scrub" :class="{ disabled }">
    <input
      v-if="editing"
      ref="input"
      v-model="text"
      class="edit"
      type="text"
      @blur="commit"
      @keydown.enter="($event.target as HTMLInputElement).blur()"
      @keydown.esc="editing = false"
    />
    <span v-else class="val mono" :title="'Arrastra para cambiar; clic para escribir'" @pointerdown="down">{{ shown }}</span>
  </span>
</template>

<style scoped>
.scrub { display: inline-block; min-width: 54px; }
.val { display: block; color: var(--accent); cursor: ew-resize; padding: 2px 4px; border-radius: 2px; text-align: right; font-size: 10.5px; }
.val:hover { background: var(--bg-hover); color: var(--accent-hover); }
.disabled .val { color: var(--text-dim); cursor: default; }
.edit { width: 100%; font-family: var(--font-mono); font-size: 10.5px; padding: 1px 4px; text-align: right; }
</style>
