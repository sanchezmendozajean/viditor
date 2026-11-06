<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import type { Marker } from '@shared/project-schema'
import { formatTimecode } from '@shared/timecode'

const props = defineProps<{ zoom: number; width: number; fpsNum: number; fpsDen: number; markers: Marker[] }>()
const emit = defineEmits<{ scrub: [e: PointerEvent]; marker: [time: number]; rename: [time: number, label: string]; menu: [e: MouseEvent, marker: Marker] }>()

// Edición del nombre del marcador en la propia regla
const editing = ref<number | null>(null)
const draft = ref('')
const input = ref<HTMLInputElement[] | HTMLInputElement | null>(null)
async function edit(m: Marker): Promise<void> {
  editing.value = m.time
  draft.value = m.label
  await nextTick()
  const el = Array.isArray(input.value) ? input.value[0] : input.value
  el?.focus()
  el?.select()
}
function commit(m: Marker): void {
  if (editing.value === null) return
  editing.value = null
  if (draft.value.trim() !== m.label) emit('rename', m.time, draft.value)
}
defineExpose({ edit })

const STEPS = [1 / 30, 1 / 10, 1 / 2, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600]

const ticks = computed(() => {
  const major = STEPS.find((s) => s * props.zoom >= 90) ?? 3600
  const minorDiv = major >= 10 ? 5 : major >= 1 ? 4 : 2
  const minor = major / minorDiv
  const out: { x: number; major: boolean; label?: string }[] = []
  const total = props.width / props.zoom
  const n = Math.ceil(total / minor)
  for (let i = 0; i <= n; i++) {
    const t = i * minor
    const isMajor = i % minorDiv === 0
    out.push({ x: t * props.zoom, major: isMajor, label: isMajor ? formatTimecode(t, props.fpsNum, props.fpsDen) : undefined })
  }
  return out
})
</script>

<template>
  <div class="ruler" :style="{ width: width + 'px' }" data-testid="ruler" @pointerdown.left="emit('scrub', $event)">
    <div v-for="(t, i) in ticks" :key="i" class="tick" :class="{ major: t.major }" :style="{ left: t.x + 'px' }">
      <span v-if="t.label" class="mono">{{ t.label }}</span>
    </div>
    <div v-for="m in markers" :key="m.time" class="mk" :style="{ left: m.time * zoom + 'px', color: m.color ?? 'var(--marker)' }" data-testid="marker" :title="m.label || 'Marcador'" @pointerdown.stop="emit('marker', m.time)" @dblclick.stop="edit(m)" @contextmenu.prevent.stop="emit('menu', $event, m)">
      <i class="marker" />
      <input v-if="editing === m.time" ref="input" v-model="draft" class="mk-input" data-testid="marker-input" @pointerdown.stop @dblclick.stop @keydown.enter.prevent="commit(m)" @keydown.esc.prevent="editing = null" @keydown.stop @blur="commit(m)" />
      <span v-else-if="m.label" class="mk-label">{{ m.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.ruler { position: relative; height: 24px; background: var(--bg-panel-header); border-bottom: 1px solid var(--border); cursor: pointer; overflow: hidden; }
.tick { position: absolute; bottom: 0; width: 1px; height: 5px; background: #666; }
.tick.major { height: 12px; background: #999; }
.tick span { position: absolute; left: 3px; top: -12px; font-size: 9px; color: var(--text-dim); white-space: nowrap; }
.mk { position: absolute; top: 0; height: 100%; width: 10px; margin-left: -5px; }
.mk-label { position: absolute; left: 12px; top: 2px; font-size: 9px; color: var(--text); white-space: nowrap; background: var(--bg-panel-header); padding: 0 2px; }
.mk-input { position: absolute; left: 12px; top: 1px; width: 110px; font-size: 10px; padding: 0 3px; z-index: 5; }
.marker { position: absolute; top: 0; width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 9px solid currentColor; left: 0; }
</style>
