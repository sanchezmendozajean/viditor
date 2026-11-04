<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import type { Waveform } from '@shared/ipc'

const props = defineProps<{ wave: Waveform; inPoint: number; outPoint: number; width: number; height: number; color: string }>()
const canvas = ref<HTMLCanvasElement | null>(null)
const MAX_W = 4096

function draw(): void {
  const c = canvas.value
  if (!c) return
  const w = Math.max(1, Math.min(MAX_W, Math.round(props.width)))
  const h = Math.max(1, Math.round(props.height))
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = props.color
  const { peaks, perSecond } = props.wave
  const span = props.outPoint - props.inPoint
  const mid = h / 2
  for (let x = 0; x < w; x++) {
    const t0 = props.inPoint + (x / w) * span
    const t1 = props.inPoint + ((x + 1) / w) * span
    const i0 = Math.floor(t0 * perSecond)
    const i1 = Math.max(i0 + 1, Math.ceil(t1 * perSecond))
    let peak = 0
    for (let i = i0; i < i1 && i < peaks.length; i++) peak = Math.max(peak, peaks[i] ?? 0)
    const amp = Math.max(1, (peak / 255) * mid)
    ctx.fillRect(x, mid - amp, 1, amp * 2)
  }
}

onMounted(draw)
watch(() => [props.wave, props.inPoint, props.outPoint, Math.round(props.width), props.height, props.color], draw)
</script>

<template><canvas ref="canvas" class="wave" /></template>

<style scoped>
.wave { width: 100%; height: 100%; display: block; pointer-events: none; }
</style>
