<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { DrawOp, Frame, TransitionOp } from '@shared/render-model'
import { Compositor } from '@/engine/compositor'
import { transitionHost } from '@/engine/transition-host'
import { useTransitionsStore } from '@/stores/transitions'
import Icon from '../components/Icon.vue'
import { drawSample } from './samples'

/**
 * Vista previa de una transición con dos clips de muestra (A y B): reproducción en bucle, barra de `progress`
 * arrastrable, velocidad y rejilla. Usa el mismo compositor y el mismo worker que la línea de tiempo.
 */
const props = withDefaults(
  defineProps<{ transition: string | null; params?: Record<string, unknown>; duration?: number; width?: number; height?: number; compact?: boolean; autoplay?: boolean }>(),
  { params: () => ({}), width: 480, height: 270 }
)

const trs = useTransitionsStore()
const canvas = ref<HTMLCanvasElement | null>(null)
const progress = ref(0)
const playing = ref(props.autoplay ?? false)
const loop = ref(true)
const speed = ref(1)
const grid = ref(false)
let comp: Compositor | null = null
let raf = 0
let last = 0
let hold = 0
let busy = false
let pending = false
const uid = Math.random().toString(36).slice(2, 8)
const A = document.createElement('canvas')
const B = document.createElement('canvas')

const meta = computed(() => (props.transition ? trs.metaOf(props.transition) : undefined))
const dur = computed(() => props.duration ?? meta.value?.defaultDuration ?? 1)
const error = computed(() => (props.transition ? trs.errorOf(props.transition) : undefined))

const FPS = 30
async function draw(): Promise<void> {
  if (!comp || !props.transition) return
  if (busy) {
    pending = true
    return
  }
  busy = true
  try {
    const total = Math.max(2, Math.round(dur.value * FPS))
    const frame = Math.min(total - 1, Math.max(0, Math.round(progress.value * (total - 1))))
    const w = props.width
    const h = props.height
    const mk = (id: string): DrawOp => ({ clipId: id, mediaId: id, kind: 'image', sourceTime: 0, matrix: [w, 0, 0, h, 0, 0], uv: [0, 0, 1, 1], opacity: 1 })
    const op: TransitionOp = {
      kind: 'transition',
      transitionId: `preview:${uid}`,
      trackId: 'preview',
      ref: props.transition,
      params: JSON.parse(JSON.stringify(props.params)) as Record<string, unknown>,
      seed: 1,
      duration: dur.value,
      progress: total > 1 ? frame / (total - 1) : 0,
      frame,
      totalFrames: total,
      leave: mk('sampleA'),
      enter: mk('sampleB')
    }
    const env = { width: w, height: h, fps: FPS }
    const dl = await transitionHost.displayList(op, env)
    const f: Frame = { time: 0, width: w, height: h, background: '#000000', ops: [op] }
    comp.draw(f, (o) => (o.clipId === 'sampleA' ? A : B), () => dl)
  } finally {
    busy = false
    if (pending) {
      pending = false
      void draw()
    }
  }
}

function tick(now: number): void {
  if (playing.value) {
    const dt = last ? (now - last) / 1000 : 0
    if (hold > 0) hold -= dt
    else {
      progress.value += (dt * speed.value) / dur.value
      if (progress.value >= 1) {
        progress.value = 1
        if (loop.value) {
          hold = 0.35
          setTimeout(() => (progress.value = 0), 350)
        } else playing.value = false
      }
    }
    void draw()
  }
  last = now
  raf = requestAnimationFrame(tick)
}

onMounted(() => {
  drawSample(A, props.width, props.height, 'A')
  drawSample(B, props.width, props.height, 'B')
  if (canvas.value) {
    comp = new Compositor(canvas.value)
    comp.resize(props.width, props.height)
  }
  raf = requestAnimationFrame(tick)
  void draw()
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  comp?.gl.getExtension('WEBGL_lose_context')?.loseContext()
  comp = null
})

// Recarga en caliente y cambios de parámetros/duración/progreso redibujan
watch([() => props.transition, () => props.params, dur, progress, () => trs.version], () => void draw(), { deep: true })
defineExpose({ progress, playing })

function togglePlay(): void {
  if (progress.value >= 1) progress.value = 0
  playing.value = !playing.value
}
</script>

<template>
  <div class="preview" :class="{ compact }" data-testid="transition-preview">
    <div class="stage" :style="{ aspectRatio: `${width} / ${height}` }">
      <canvas ref="canvas" class="cv" :width="width" :height="height" data-testid="preview-canvas" />
      <div v-if="grid" class="grid" />
      <div v-if="error" class="err" data-testid="preview-error">{{ error }}</div>
    </div>
    <div v-if="!compact" class="bar">
      <button class="icon-btn" :title="playing ? 'Pausa' : 'Reproducir'" data-testid="preview-play" @click="togglePlay"><Icon :name="playing ? 'pause' : 'play'" :size="14" /></button>
      <button class="icon-btn" :class="{ on: loop }" title="Bucle" @click="loop = !loop"><Icon name="repeat" :size="14" /></button>
      <input v-model.number="progress" class="prog" type="range" min="0" max="1" step="0.001" title="progress" data-testid="preview-progress" @input="playing = false" />
      <span class="mono dim val">{{ progress.toFixed(2) }}</span>
      <select v-model.number="speed" title="Velocidad">
        <option :value="0.25">¼×</option>
        <option :value="0.5">½×</option>
        <option :value="1">1×</option>
        <option :value="2">2×</option>
      </select>
      <button class="icon-btn" :class="{ on: grid }" title="Rejilla" @click="grid = !grid"><Icon name="grid" :size="14" /></button>
    </div>
  </div>
</template>

<style scoped>
.preview { display: flex; flex-direction: column; gap: 6px; }
.stage { position: relative; width: 100%; background: #000; border: 1px solid var(--border-subtle); }
.cv { width: 100%; height: 100%; display: block; }
.grid { position: absolute; inset: 0; pointer-events: none; background-image: linear-gradient(to right, rgba(255, 255, 255, 0.25) 1px, transparent 1px), linear-gradient(to bottom, rgba(255, 255, 255, 0.25) 1px, transparent 1px); background-size: 10% 10%; }
.err { position: absolute; left: 6px; right: 6px; bottom: 6px; padding: 4px 6px; background: rgba(229, 72, 77, 0.92); color: #fff; font-size: 10px; border-radius: 2px; }
.bar { display: flex; align-items: center; gap: 4px; }
.prog { flex: 1; min-width: 0; accent-color: var(--accent); }
.val { width: 34px; text-align: right; }
.bar select { padding: 1px 3px; font-size: 10px; }
.icon-btn.on { color: var(--accent); }
.compact .stage { border: 0; }
</style>
