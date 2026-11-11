<script setup lang="ts">
import { computed } from 'vue'
import type { Clip, MediaItem, Track } from '@shared/project-schema'
import { keyTimes, timelineTimeOf } from '@shared/keyframes'
import { clipDuration } from '@shared/timeline-ops'
import { isGeneratedKind } from '@shared/generated'
import { useUiStore } from '@/stores/ui'
import { useWaveStore } from '@/stores/waves'
import ClipWave from './ClipWave.vue'

const props = defineProps<{
  clip: Clip
  media: MediaItem | undefined
  track: Track
  zoom: number
  height: number
  selected: boolean
  dragging: boolean
  missing: boolean
  /** Posición provisional durante un arrastre */
  start?: number
}>()
const emit = defineEmits<{ down: [e: PointerEvent, zone: 'left' | 'body' | 'right']; menu: [e: MouseEvent] }>()

const ui = useUiStore()
const waves = useWaveStore()

const left = computed(() => (props.start ?? props.clip.start) * props.zoom)
const width = computed(() => Math.max(2, clipDuration(props.clip) * props.zoom))
const kindClass = computed(() => {
  if (props.track.kind === 'audio') return 'audio'
  const k = props.media?.kind
  return k === 'image' || k === 'text' || k === 'shape' ? k : 'video'
})
// Rombos de los fotogramas clave dentro del clip (posición relativa al inicio del clip)
const keyMarks = computed(() =>
  keyTimes(props.clip)
    .map((s) => (timelineTimeOf(props.clip, s) - props.clip.start) * props.zoom)
    .filter((x) => x >= 0 && x <= width.value)
)
// Desvanecimientos visuales: triángulo en el extremo donde se aplican (ancho = duración × zoom)
const fadeInW = computed(() => Math.min(width.value, (props.clip.fade?.in ?? 0) * props.zoom))
const fadeOutW = computed(() => Math.min(width.value, (props.clip.fade?.out ?? 0) * props.zoom))
const wave = computed(() => (props.media ? waves.get(props.media.id) : null))
const thumb = computed(() => {
  if (props.track.kind !== 'video' || !props.media || props.media.kind === 'audio' || isGeneratedKind(props.media.kind)) return undefined
  return `url(${window.viditor.media.thumbnailUrl(props.media.id)}?v=${ui.thumbVersion[props.media.id] ?? 0})`
})
const thumbH = computed(() => Math.max(10, props.height - 14))
const waveColor = computed(() => (props.track.kind === 'audio' ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.6)'))

function zoneOf(e: PointerEvent): 'left' | 'body' | 'right' {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const edge = Math.min(8, r.width / 3)
  if (e.clientX - r.left <= edge) return 'left'
  if (r.right - e.clientX <= edge) return 'right'
  return 'body'
}
function onDown(e: PointerEvent): void {
  emit('down', e, zoneOf(e))
}
function onMove(e: PointerEvent): void {
  const z = zoneOf(e)
  ;(e.currentTarget as HTMLElement).style.cursor = z === 'body' ? '' : 'ew-resize'
}
</script>

<template>
  <div
    class="clip"
    :class="[kindClass, { selected, disabled: !clip.enabled, dragging, missing }]"
    :style="{ left: left + 'px', width: width + 'px', height: height + 'px' }"
    :data-clip-id="clip.id"
    data-testid="clip"
    :title="clip.name"
    @pointerdown="onDown"
    @pointermove="onMove"
    @contextmenu.stop="emit('menu', $event)"
  >
    <div v-if="thumb" class="thumbs" :style="{ backgroundImage: thumb, backgroundSize: `auto ${thumbH}px` }" />
    <div v-if="wave" class="wavebox" :class="{ small: track.kind === 'video' }">
      <ClipWave :wave="wave" :in-point="clip.in" :out-point="clip.out" :width="width" :height="track.kind === 'video' ? 22 : height - 14" :color="waveColor" />
    </div>
    <svg v-if="fadeInW > 0" class="fade in" :style="{ width: fadeInW + 'px' }" viewBox="0 0 10 10" preserveAspectRatio="none" data-testid="clip-fade-in">
      <polygon points="0,0 10,0 0,10" /><line x1="0" y1="10" x2="10" y2="0" />
    </svg>
    <svg v-if="fadeOutW > 0" class="fade out" :style="{ width: fadeOutW + 'px' }" viewBox="0 0 10 10" preserveAspectRatio="none" data-testid="clip-fade-out">
      <polygon points="0,0 10,0 10,10" /><line x1="0" y1="0" x2="10" y2="10" />
    </svg>
    <i v-for="(x, i) in keyMarks" :key="i" class="kf" :style="{ left: x + 'px' }" data-testid="clip-key" />
    <span class="name">{{ clip.name }}</span>
    <span v-if="clip.audio.muted && track.kind === 'video'" class="muted" title="Audio separado">♪̸</span>
  </div>
</template>

<style scoped>
.clip { position: absolute; top: 2px; border-radius: 2px; overflow: hidden; background: var(--clip-video); border: 1px solid rgba(0, 0, 0, 0.45); cursor: default; }
.clip.audio { background: var(--clip-audio); }
.clip.image { background: var(--clip-image); }
.clip.text { background: var(--clip-text); }
.clip.shape { background: var(--clip-shape); }
.clip.selected { border-color: #fff; filter: brightness(1.12); z-index: 3; }
.clip.disabled { opacity: 0.4; background-image: repeating-linear-gradient(45deg, transparent 0 4px, rgba(0, 0, 0, 0.35) 4px 8px); }
.clip.dragging { opacity: 0.75; z-index: 4; outline: 1px dashed #fff; }
.clip.missing { outline: 1px solid var(--danger); }
.thumbs { position: absolute; left: 0; right: 0; top: 13px; bottom: 0; background-repeat: repeat-x; background-position: left center; opacity: 0.9; }
.name { position: absolute; left: 4px; top: 0; right: 4px; height: 13px; line-height: 13px; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #fff; text-shadow: 0 0 2px #000; pointer-events: none; }
.wavebox { position: absolute; left: 0; right: 0; top: 13px; bottom: 0; }
.wavebox.small { top: auto; height: 22px; bottom: 0; background: rgba(0, 0, 0, 0.3); }
.fade { position: absolute; top: 0; bottom: 0; height: 100%; pointer-events: none; overflow: visible; }
.fade.in { left: 0; }
.fade.out { right: 0; }
.fade polygon { fill: rgba(0, 0, 0, 0.5); }
.fade line { stroke: #fff; stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.muted { position: absolute; right: 4px; bottom: 2px; font-size: 10px; color: #fff; opacity: 0.8; }
.kf { position: absolute; bottom: 2px; width: 7px; height: 7px; margin-left: -3.5px; transform: rotate(45deg); background: var(--marker); border: 1px solid rgba(0, 0, 0, 0.6); pointer-events: none; }
</style>
