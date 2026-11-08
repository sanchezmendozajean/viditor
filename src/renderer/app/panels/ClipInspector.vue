<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { Clip, Project } from '@shared/project-schema'
import * as ops from '@shared/timeline-ops'
import { transitionsOfClip } from '@shared/transition-model'
import { KEY_PROPS, clearKeys, resolveClip, sourceTimeAt, keyAt } from '@shared/keyframes'
import { clipGeometry, gainToDb } from '@shared/render-model'
import { clipDuration, clipEnd } from '@shared/timeline-ops'
import { useProjectStore } from '@/stores/project'
import { useTimelineStore } from '@/stores/timeline'
import ScrubNumber from '../components/ScrubNumber.vue'
import Icon from '../components/Icon.vue'
import KeyToggle from '../components/KeyToggle.vue'

const project = useProjectStore()
const tl = useTimelineStore()
const open = reactive({ motion: true, opacity: true, timeline: true, audio: true })

const selected = computed<Clip | undefined>(() => tl.selectedClips[0])
// Valores vistos en el cabezal: con fotogramas clave el inspector muestra el valor animado de ese instante
const clip = computed<Clip | undefined>(() => (selected.value ? resolveClip(selected.value, tl.playhead) : undefined))
const easeHere = computed(() => {
  const c = selected.value
  if (!c) return null
  const s = sourceTimeAt(c, tl.playhead)
  for (const p of KEY_PROPS) {
    const k = keyAt(c, p, s)
    if (k) return k.ease
  }
  return null
})
const media = computed(() => project.project?.media.find((m) => m.id === clip.value?.mediaId))
const geo = computed(() => (clip.value && project.project ? clipGeometry(project.project.settings, clip.value, media.value) : null))
const t = computed(() => clip.value?.transform)
const hasAudio = computed(() => Boolean(media.value?.probe?.hasAudio))
const fixedDur = computed(() => (clip.value ? clipDuration(clip.value) : 0))
const db = computed(() => {
  const d = gainToDb(clip.value?.audio.volume ?? 1)
  return Number.isFinite(d) ? `${d.toFixed(1)} dB` : '−∞ dB'
})

// Gestos: un arrastre = un solo comando en el historial
let before = ''
function start(): void {
  before = tl.snapshot()
}
function end(label: string): void {
  tl.commit(label, before)
}
const live = (fn: (c: Clip) => void): void => tl.liveSelected((c) => fn(c))
const liveTiming = (fn: (p: Project, id: string) => void): void => tl.liveTiming(fn)

// ───── Línea de tiempo ─────
/** Un fotograma por píxel de arrastre. */
const timeStep = computed(() => (project.project ? ops.frameDuration(project.project) : 1 / 30))
/** Con transiciones en el clip, su posición/duración se cambian desde la transición; en pistas bloqueadas no se edita. */
const timingLocked = computed(() => {
  const c = selected.value
  const p = project.project
  if (!c || !p) return true
  return tl.isLocked(c.trackId) || transitionsOfClip(p, c.id).length > 0
})
function resetFades(): void {
  tl.editSelected('Quitar desvanecimientos', (c) => (c.fade = { in: 0, out: 0 }))
}

// ───── Movimiento ─────
const fits = [
  { v: 'fit', label: 'Ajustar' },
  { v: 'fill', label: 'Rellenar' },
  { v: 'stretch', label: 'Estirar' },
  { v: 'none', label: 'Tamaño original' }
]
const anchors = [0, 0.5, 1]

function setWidth(w: number): void {
  const g = geo.value
  if (!g) return
  live((c) => {
    const base = g.cw * g.fx
    const nx = Math.max(0.001, w / base)
    if (c.transform.lockAspect) c.transform.scaleY = c.transform.scaleY * (nx / (c.transform.scaleX || 1))
    c.transform.scaleX = nx
  })
}
function setHeight(h: number): void {
  const g = geo.value
  if (!g) return
  live((c) => {
    const base = g.ch * g.fy
    const ny = Math.max(0.001, h / base)
    if (c.transform.lockAspect) c.transform.scaleX = c.transform.scaleX * (ny / (c.transform.scaleY || 1))
    c.transform.scaleY = ny
  })
}
function setScale(pct: number): void {
  live((c) => {
    c.transform.scaleX = c.transform.scaleY = Math.max(0.001, pct / 100)
  })
}
function setAnchor(ax: number, ay: number): void {
  // Mover el anclaje no debe mover la imagen: se recalcula la posición (mismo centro, otro pivote).
  tl.editSelected('Mover anclaje', (c, p) => {
    const m = p.media.find((x) => x.id === c.mediaId)
    const g = clipGeometry(p.settings, c, m)
    const th = (c.transform.rotation * Math.PI) / 180
    const cos = Math.cos(th)
    const sin = Math.sin(th)
    const center = (a: number, b: number): [number, number] => {
      const px = p.settings.width / 2 + c.transform.x + (a - 0.5) * g.bw
      const py = p.settings.height / 2 + c.transform.y + (b - 0.5) * g.bh
      const ox = (0.5 - a) * g.bw
      const oy = (0.5 - b) * g.bh
      return [px + cos * ox - sin * oy, py + sin * ox + cos * oy]
    }
    const [cx, cy] = center(c.transform.anchorX, c.transform.anchorY)
    c.transform.anchorX = ax
    c.transform.anchorY = ay
    const [nx, ny] = center(ax, ay)
    c.transform.x += cx - nx
    c.transform.y += cy - ny
  })
}
function resetMotion(): void {
  tl.editSelected('Restablecer movimiento', (c) => {
    clearKeys(c, ['x', 'y', 'scaleX', 'scaleY', 'rotation'], 0)
    Object.assign(c.transform, { fit: 'fit', x: 0, y: 0, scaleX: 1, scaleY: 1, lockAspect: true, rotation: 0, flipH: false, flipV: false, anchorX: 0.5, anchorY: 0.5 })
    c.transform.crop = { left: 0, top: 0, right: 0, bottom: 0 }
  })
}
function resetOpacity(): void {
  tl.editSelected('Restablecer opacidad', (c) => {
    clearKeys(c, ['opacity'], 0)
    c.transform.opacity = 1
  })
}
function resetAudio(): void {
  tl.editSelected('Restablecer audio', (c) => {
    clearKeys(c, ['volume'], 0)
    c.audio = { volume: 1, muted: false, fadeIn: 0, fadeOut: 0 }
  })
}
const cropKeys = [
  ['left', 'Izq.'],
  ['top', 'Sup.'],
  ['right', 'Der.'],
  ['bottom', 'Inf.']
] as const
</script>

<template>
  <div v-if="clip && t && geo" class="insp" data-testid="inspector-clip">
    <h3>{{ tl.selection.length > 1 ? `${tl.selection.length} clips` : clip.name }}</h3>

    <div class="ease" data-testid="key-ease">
      <span class="dim">Interpolación desde este fotograma</span>
      <select :value="easeHere ?? 'linear'" :disabled="!easeHere" title="Requiere un fotograma clave en el cabezal" @change="tl.setKeyEase([...KEY_PROPS], ($event.target as HTMLSelectElement).value as 'linear' | 'smooth' | 'hold')">
        <option value="linear">Lineal</option>
        <option value="smooth">Suave</option>
        <option value="hold">Mantener</option>
      </select>
    </div>

    <!-- Movimiento -->
    <section>
      <header @click="open.motion = !open.motion">
        <Icon :name="open.motion ? 'down' : 'right'" :size="12" /><span class="fx">fx</span><span class="title">Movimiento</span>
        <button class="icon-btn reset" title="Restablecer movimiento" data-testid="reset-motion" @click.stop="resetMotion">↺</button>
      </header>
      <div v-if="open.motion" class="grid" data-testid="group-motion">
        <label>Ajuste</label>
        <select :value="t.fit" data-testid="fit" @change="tl.editSelected('Cambiar ajuste', (c) => (c.transform.fit = ($event.target as HTMLSelectElement).value as Clip['transform']['fit']))">
          <option v-for="f in fits" :key="f.v" :value="f.v">{{ f.label }}</option>
        </select>

        <label><KeyToggle :keys="['x', 'y']" />Posición</label>
        <div class="pair">
          <ScrubNumber :model-value="t.x" :decimals="1" data-testid="pos-x" @start="start" @update:model-value="live((c) => (c.transform.x = $event))" @end="end('Cambiar posición')" />
          <ScrubNumber :model-value="t.y" :decimals="1" data-testid="pos-y" @start="start" @update:model-value="live((c) => (c.transform.y = $event))" @end="end('Cambiar posición')" />
        </div>

        <label><KeyToggle :keys="['scaleX', 'scaleY']" />Ancho / Alto</label>
        <div class="pair">
          <ScrubNumber :model-value="geo.bw" :decimals="1" :min="1" data-testid="width" @start="start" @update:model-value="setWidth" @end="end('Cambiar tamaño')" />
          <button class="icon-btn lock" :class="{ on: t.lockAspect }" :title="t.lockAspect ? 'Proporción bloqueada' : 'Proporción libre'" data-testid="lock-aspect" @click="tl.editSelected('Bloquear proporción', (c) => (c.transform.lockAspect = !c.transform.lockAspect))">
            <Icon :name="t.lockAspect ? 'lock' : 'unlock'" :size="12" />
          </button>
          <ScrubNumber :model-value="geo.bh" :decimals="1" :min="1" data-testid="height" @start="start" @update:model-value="setHeight" @end="end('Cambiar tamaño')" />
        </div>

        <template v-if="t.lockAspect">
          <label><KeyToggle :keys="['scaleX', 'scaleY']" />Escala</label>
          <ScrubNumber :model-value="t.scaleX * 100" :decimals="1" :min="0.1" :max="1000" suffix=" %" data-testid="scale" @start="start" @update:model-value="setScale" @end="end('Cambiar escala')" />
        </template>

        <label><KeyToggle :keys="['rotation']" />Rotación</label>
        <ScrubNumber :model-value="t.rotation" :decimals="1" suffix="°" data-testid="rotation" @start="start" @update:model-value="live((c) => (c.transform.rotation = $event))" @end="end('Cambiar rotación')" />

        <label>Voltear</label>
        <div class="pair">
          <button class="btn mini" :class="{ on: t.flipH }" data-testid="flip-h" @click="tl.editSelected('Voltear horizontal', (c) => (c.transform.flipH = !c.transform.flipH))">Horizontal</button>
          <button class="btn mini" :class="{ on: t.flipV }" data-testid="flip-v" @click="tl.editSelected('Voltear vertical', (c) => (c.transform.flipV = !c.transform.flipV))">Vertical</button>
        </div>

        <label>Anclaje</label>
        <div class="anchor-row">
          <div class="anchor9" data-testid="anchor9">
            <template v-for="ay in anchors" :key="ay">
              <button v-for="ax in anchors" :key="ax" :class="{ on: t.anchorX === ax && t.anchorY === ay }" :title="`${ax * 100}%, ${ay * 100}%`" @click="setAnchor(ax, ay)" />
            </template>
          </div>
          <div class="col">
            <ScrubNumber :model-value="t.anchorX * 100" :decimals="0" :step="0.5" suffix=" %" @start="start" @update:model-value="live((c) => (c.transform.anchorX = $event / 100))" @end="end('Mover anclaje')" />
            <ScrubNumber :model-value="t.anchorY * 100" :decimals="0" :step="0.5" suffix=" %" @start="start" @update:model-value="live((c) => (c.transform.anchorY = $event / 100))" @end="end('Mover anclaje')" />
          </div>
        </div>

        <label>Recorte</label>
        <div class="crop">
          <div v-for="[k, l] in cropKeys" :key="k" class="crop-item">
            <span class="dim">{{ l }}</span>
            <ScrubNumber :model-value="t.crop[k]" :min="0" :decimals="0" @start="start" @update:model-value="live((c) => (c.transform.crop[k] = $event))" @end="end('Cambiar recorte')" />
          </div>
        </div>
      </div>
    </section>

    <!-- Opacidad -->
    <section>
      <header @click="open.opacity = !open.opacity">
        <Icon :name="open.opacity ? 'down' : 'right'" :size="12" /><span class="fx">fx</span><span class="title">Opacidad</span>
        <button class="icon-btn reset" title="Restablecer opacidad" @click.stop="resetOpacity">↺</button>
      </header>
      <div v-if="open.opacity" class="grid" data-testid="group-opacity">
        <label><KeyToggle :keys="['opacity']" />Opacidad</label>
        <div class="pair">
          <input class="range" type="range" min="0" max="100" :value="Math.round(t.opacity * 100)" data-testid="opacity-range" @pointerdown="start" @input="live((c) => (c.transform.opacity = Number(($event.target as HTMLInputElement).value) / 100))" @change="end('Cambiar opacidad')" />
          <ScrubNumber :model-value="t.opacity * 100" :decimals="0" :min="0" :max="100" suffix=" %" data-testid="opacity" @start="start" @update:model-value="live((c) => (c.transform.opacity = $event / 100))" @end="end('Cambiar opacidad')" />
        </div>
      </div>
    </section>

    <!-- Línea de tiempo -->
    <section v-if="selected">
      <header @click="open.timeline = !open.timeline">
        <Icon :name="open.timeline ? 'down' : 'right'" :size="12" /><span class="title">Línea de tiempo</span>
        <button class="icon-btn reset" title="Quitar desvanecimientos" data-testid="reset-timeline" @click.stop="resetFades">↺</button>
      </header>
      <div v-if="open.timeline" class="grid" data-testid="group-timeline">
        <label>Ingresa en</label>
        <ScrubNumber :model-value="selected.start" :decimals="2" :step="timeStep" :min="0" suffix=" s" :disabled="timingLocked" data-testid="tl-start" title="No puede ser menor que el final del clip anterior de la pista" @start="start" @update:model-value="liveTiming((p, id) => ops.setClipStart(p, id, $event))" @end="end('Cambiar ingreso')" />

        <label>Sale en</label>
        <ScrubNumber :model-value="clipEnd(selected)" :decimals="2" :step="timeStep" :min="0" suffix=" s" :disabled="timingLocked" data-testid="tl-end" @start="start" @update:model-value="liveTiming((p, id) => ops.setClipEnd(p, id, $event))" @end="end('Cambiar salida')" />

        <label>Duración</label>
        <ScrubNumber :model-value="fixedDur" :decimals="2" :step="timeStep" :min="timeStep" suffix=" s" :disabled="timingLocked" data-testid="tl-duration" @start="start" @update:model-value="liveTiming((p, id) => ops.setClipDuration(p, id, $event))" @end="end('Cambiar duración')" />

        <label>D. Ingreso</label>
        <ScrubNumber :model-value="selected.fade?.in ?? 0" :decimals="2" :step="timeStep" :min="0" :max="fixedDur" suffix=" s" data-testid="tl-fade-in" :class="{ 'fade-on': (selected.fade?.in ?? 0) > 0 }" title="Desvanecimiento de ingreso: el alfa pasa de 0 a 1. No modifica la opacidad" @start="start" @update:model-value="liveTiming((p, id) => ops.setClipFade(p, id, 'in', $event))" @end="end('Desvanecimiento de ingreso')" />

        <label>D. Salida</label>
        <ScrubNumber :model-value="selected.fade?.out ?? 0" :decimals="2" :step="timeStep" :min="0" :max="fixedDur" suffix=" s" data-testid="tl-fade-out" :class="{ 'fade-on': (selected.fade?.out ?? 0) > 0 }" title="Desvanecimiento de salida: el alfa pasa de 1 a 0. No modifica la opacidad" @start="start" @update:model-value="liveTiming((p, id) => ops.setClipFade(p, id, 'out', $event))" @end="end('Desvanecimiento de salida')" />
      </div>
    </section>

    <!-- Audio -->
    <section>
      <header @click="open.audio = !open.audio">
        <Icon :name="open.audio ? 'down' : 'right'" :size="12" /><span class="fx">fx</span><span class="title">Audio</span>
        <button class="icon-btn reset" title="Restablecer audio" @click.stop="resetAudio">↺</button>
      </header>
      <div v-if="open.audio" class="grid" data-testid="group-audio">
        <template v-if="hasAudio">
          <label><KeyToggle :keys="['volume']" />Volumen</label>
          <div class="pair">
            <ScrubNumber :model-value="clip.audio.volume * 100" :decimals="0" :min="0" :max="200" suffix=" %" data-testid="volume" :class="{ 'fade-on': Math.abs(clip.audio.volume - 1) > 0.0005 }" @start="start" @update:model-value="live((c) => (c.audio.volume = $event / 100))" @end="end('Cambiar volumen del clip')" />
            <span class="dim db mono" data-testid="volume-db">{{ db }}</span>
          </div>
          <label>Silenciar</label>
          <input type="checkbox" :checked="clip.audio.muted" data-testid="mute" @change="tl.editSelected('Silenciar clip', (c) => (c.audio.muted = ($event.target as HTMLInputElement).checked))" />
          <label>Fundido entrada</label>
          <ScrubNumber :model-value="clip.audio.fadeIn" :decimals="2" :step="0.02" :min="0" :max="fixedDur" suffix=" s" data-testid="fade-in" @start="start" @update:model-value="live((c) => (c.audio.fadeIn = $event))" @end="end('Fundido de entrada')" />
          <label>Fundido salida</label>
          <ScrubNumber :model-value="clip.audio.fadeOut" :decimals="2" :step="0.02" :min="0" :max="fixedDur" suffix=" s" data-testid="fade-out" @start="start" @update:model-value="live((c) => (c.audio.fadeOut = $event))" @end="end('Fundido de salida')" />
        </template>
        <p v-else class="dim span">Este medio no tiene audio.</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.insp { padding: 5px; }
h3 { margin: 0 0 5px; font-size: 11px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
section { border-top: 1px solid var(--border); }
header { display: flex; align-items: center; gap: 4px; height: 24px; padding: 0 6px 0 8px; cursor: pointer; background: var(--bg-panel-header); }
.fx { font-style: italic; color: var(--accent); font-weight: 600; width: 14px; }
.title { flex: 1; font-weight: 600; }
.reset { font-size: 13px; width: 20px; }
.ease { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 5px 0; }
.ease select { width: 90px; }
.grid { display: grid; grid-template-columns: 96px 1fr; gap: 5px 8px; padding: 5px 0; align-items: center; }
label { color: var(--text-dim); }
.pair { display: flex; align-items: center; gap: 4px; }
.pair > * { flex: 1; min-width: 0; }
.pair .lock { flex: none; }
.lock.on { color: var(--accent); }
select { width: 100%; font-size: 11px; }
.btn.mini { padding: 2px 4px; font-size: 10.5px; }
.btn.mini.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.anchor-row { display: flex; gap: 8px; align-items: center; }
.anchor9 { display: grid; grid-template-columns: repeat(3, 12px); gap: 3px; }
.anchor9 button { width: 12px; height: 12px; padding: 0; background: var(--bg-input); border: 1px solid var(--border-subtle); border-radius: 2px; cursor: pointer; }
.anchor9 button.on { background: var(--accent); border-color: var(--accent); }
.col { display: flex; flex-direction: column; }
.crop { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 8px; }
.crop-item { display: flex; align-items: center; justify-content: space-between; }
.range { accent-color: var(--accent); }
.db { flex: none; min-width: 52px; text-align: right; }
.fade-on :deep(.val) { color: #ff3dd8; }
.fade-on :deep(.val:hover) { color: #ff7be8; }
.span { grid-column: 1 / -1; margin: 0; }
</style>
