<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { clipGeometry, clipMatrix, solvePosition, applyMatrix, worldCenter, activeClipsAt } from '@shared/render-model'
import { formatTimecode, parseTimecode } from '@shared/timecode'
import { engine } from '@/engine/engine'
import { useProjectStore } from '@/stores/project'
import { useTimelineStore } from '@/stores/timeline'
import { useTimelinePlayback, type Quality } from '@/stores/playback'
import Panel from '../components/Panel.vue'
import Icon from '../components/Icon.vue'

const project = useProjectStore()
const tl = useTimelineStore()
const pb = useTimelinePlayback()

const canvas = ref<HTMLCanvasElement | null>(null)
const stage = ref<SVGSVGElement | null>(null)
const editingTc = ref(false)
const tcText = ref('')
const tcInput = ref<HTMLInputElement | null>(null)

const settings = computed(() => project.project?.settings)
const W = computed(() => settings.value?.width ?? 1920)
const H = computed(() => settings.value?.height ?? 1080)
const ratio = computed(() => W.value / H.value)
const fmt = (t: number): string => {
  const f = settings.value?.fps ?? { num: 30, den: 1 }
  return formatTimecode(t, f.num, f.den)
}

onMounted(() => {
  if (canvas.value) engine.attach(canvas.value)
})
onUnmounted(() => engine.detach())

// ───────── Transporte ─────────

function frameStep(n: number): void {
  engine.step(n)
}
const qualities: { v: Quality; label: string }[] = [
  { v: 'full', label: 'Completa' },
  { v: 'half', label: '½' },
  { v: 'quarter', label: '¼' }
]
async function startEditTc(): Promise<void> {
  editingTc.value = true
  tcText.value = fmt(tl.playhead)
  await nextTick()
  tcInput.value?.select()
}
function commitTc(): void {
  if (!editingTc.value) return
  editingTc.value = false
  const f = settings.value?.fps
  const t = f ? parseTimecode(tcText.value, f.num, f.den) : null
  if (t !== null) tl.setPlayhead(t)
}
function onMaster(e: Event): void {
  project.mutate((p) => (p.settings.masterVolume = Number((e.target as HTMLInputElement).value) / 100))
}

// ───────── Caja de transformación ─────────

const target = computed(() => {
  const p = project.project
  if (!p || tl.selectedClips.length !== 1) return null
  const clip = tl.selectedClips[0]
  if (!clip) return null
  const track = p.tracks.find((t) => t.id === clip.trackId)
  const media = p.media.find((m) => m.id === clip.mediaId)
  if (!track || track.kind !== 'video' || !media || media.kind === 'audio' || tl.isLocked(clip.trackId)) return null
  if (!activeClipsAt(p, tl.playhead).some((a) => a.clip.id === clip.id)) return null
  const g = clipGeometry(p.settings, clip, media)
  return { clip, g, m: clipMatrix(p.settings, clip, g) }
})

const corners = computed(() => {
  const t = target.value
  if (!t) return null
  const P = (u: number, v: number): [number, number] => applyMatrix(t.m, u, v)
  return { tl: P(0, 0), tr: P(1, 0), br: P(1, 1), bl: P(0, 1) }
})
const poly = computed(() => (corners.value ? [corners.value.tl, corners.value.tr, corners.value.br, corners.value.bl].map((p) => p.join(',')).join(' ') : ''))
const k = computed(() => 1 / Math.max(0.1, (stage.value?.getBoundingClientRect().width ?? W.value) / W.value)) // unidades de proyecto por píxel de pantalla
const hs = computed(() => 5 * k.value)

const handles = computed(() => {
  const t = target.value
  if (!t) return []
  const list: { id: string; hu: number; hv: number; pos: [number, number] }[] = []
  for (const hv of [0, 0.5, 1]) {
    for (const hu of [0, 0.5, 1]) {
      if (hu === 0.5 && hv === 0.5) continue
      list.push({ id: `${hu}-${hv}`, hu: (hu - 0.5) * 2, hv: (hv - 0.5) * 2, pos: applyMatrix(t.m, hu, hv) })
    }
  }
  return list
})
const rotHandle = computed(() => {
  const t = target.value
  if (!t) return null
  const top = applyMatrix(t.m, 0.5, 0)
  const c = worldCenter(t.m)
  const dx = top[0] - c[0]
  const dy = top[1] - c[1]
  const len = Math.hypot(dx, dy) || 1
  const off = 26 * k.value
  return { from: top, pos: [top[0] + (dx / len) * off, top[1] + (dy / len) * off] as [number, number] }
})
const anchorPos = computed(() => (target.value ? applyMatrix(target.value.m, target.value.clip.transform.anchorX, target.value.clip.transform.anchorY) : null))
const guides = ref<{ v: boolean; h: boolean }>({ v: false, h: false })

function toProject(e: { clientX: number; clientY: number }): [number, number] {
  const r = stage.value?.getBoundingClientRect()
  if (!r) return [0, 0]
  return [((e.clientX - r.left) / r.width) * W.value, ((e.clientY - r.top) / r.height) * H.value]
}

/** Registra el gesto: mutaciones en vivo + un solo comando al soltar. */
function gesture(e: PointerEvent, label: string, onMove: (p: [number, number], ev: PointerEvent) => void): void {
  e.preventDefault()
  e.stopPropagation()
  const before = tl.snapshot()
  const move = (ev: PointerEvent): void => onMove(toProject(ev), ev)
  const up = (): void => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    guides.value = { v: false, h: false }
    tl.commit(label, before)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function startMove(e: PointerEvent): void {
  const t = target.value
  if (!t) return
  const p0 = toProject(e)
  const x0 = t.clip.transform.x
  const y0 = t.clip.transform.y
  const c0 = worldCenter(t.m)
  gesture(e, 'Mover clip', (p, ev) => {
    let dx = p[0] - p0[0]
    let dy = p[1] - p0[1]
    // Guías de centrado con imán
    const snap = 6 * k.value
    const gv = !ev.altKey && Math.abs(c0[0] + dx - W.value / 2) < snap
    const gh = !ev.altKey && Math.abs(c0[1] + dy - H.value / 2) < snap
    if (gv) dx = W.value / 2 - c0[0]
    if (gh) dy = H.value / 2 - c0[1]
    guides.value = { v: gv, h: gh }
    tl.liveSelected((c) => {
      c.transform.x = Math.round((x0 + dx) * 10) / 10
      c.transform.y = Math.round((y0 + dy) * 10) / 10
    })
  })
}

function startScale(e: PointerEvent, hu: number, hv: number): void {
  const t = target.value
  const s = settings.value
  if (!t || !s) return
  const { clip, g, m } = t
  const tr = clip.transform
  const th = (tr.rotation * Math.PI) / 180
  const ux: [number, number] = [Math.cos(th), Math.sin(th)]
  const vx: [number, number] = [-Math.sin(th), Math.cos(th)]
  const C = worldCenter(m)
  const sx0 = tr.scaleX
  const sy0 = tr.scaleY
  const corner = hu !== 0 && hv !== 0
  gesture(e, 'Escalar clip', (p, ev) => {
    const rel: [number, number] = [p[0] - C[0], p[1] - C[1]]
    const lx = rel[0] * ux[0] + rel[1] * ux[1]
    const ly = rel[0] * vx[0] + rel[1] * vx[1]
    let fx = 1
    let fy = 1
    if (corner) {
      const h: [number, number] = [hu * (g.bw / 2), hv * (g.bh / 2)]
      const f = (lx * h[0] + ly * h[1]) / (h[0] * h[0] + h[1] * h[1])
      fx = fy = f
      if (ev.shiftKey || !tr.lockAspect) {
        fx = Math.abs(lx) / (g.bw / 2)
        fy = Math.abs(ly) / (g.bh / 2)
      }
    } else if (hu !== 0) {
      fx = Math.abs(lx) / (g.bw / 2)
      if (tr.lockAspect && !ev.shiftKey) fy = fx
    } else {
      fy = Math.abs(ly) / (g.bh / 2)
      if (tr.lockAspect && !ev.shiftKey) fx = fy
    }
    fx = Math.max(0.01, fx)
    fy = Math.max(0.01, fy)
    const bw = g.bw * fx
    const bh = g.bh * fy
    const pos = solvePosition(s, C, { bw, bh }, tr.rotation, { x: tr.anchorX, y: tr.anchorY })
    tl.liveSelected((c) => {
      c.transform.scaleX = sx0 * fx
      c.transform.scaleY = sy0 * fy
      c.transform.x = pos.x
      c.transform.y = pos.y
    })
  })
}

function startRotate(e: PointerEvent): void {
  const t = target.value
  const pivot = anchorPos.value
  if (!t || !pivot) return
  const r0 = t.clip.transform.rotation
  const a0 = Math.atan2(toProject(e)[1] - pivot[1], toProject(e)[0] - pivot[0])
  gesture(e, 'Rotar clip', (p, ev) => {
    const a = Math.atan2(p[1] - pivot[1], p[0] - pivot[0])
    let r = r0 + ((a - a0) * 180) / Math.PI
    if (ev.shiftKey) r = Math.round(r / 15) * 15
    tl.liveSelected((c) => (c.transform.rotation = Math.round(r * 10) / 10))
  })
}

function startAnchor(e: PointerEvent): void {
  const t = target.value
  const s = settings.value
  if (!t || !s) return
  const C = worldCenter(t.m)
  const { clip, g } = t
  const [a, b, c, d, ex, fy] = t.m
  const det = a * d - b * c
  gesture(e, 'Mover anclaje', (p) => {
    // Inversa de la matriz: coordenadas (u,v) del cuadro bajo el puntero
    const dx = p[0] - ex
    const dy = p[1] - fy
    const u = (d * dx - c * dy) / det
    const v = (-b * dx + a * dy) / det
    const ax = Math.max(-1, Math.min(2, u))
    const ay = Math.max(-1, Math.min(2, v))
    const pos = solvePosition(s, C, g, clip.transform.rotation, { x: ax, y: ay })
    tl.liveSelected((cl) => {
      cl.transform.anchorX = Math.round(ax * 1000) / 1000
      cl.transform.anchorY = Math.round(ay * 1000) / 1000
      cl.transform.x = pos.x
      cl.transform.y = pos.y
    })
  })
}

const cursorFor = (hu: number, hv: number): string => (hu !== 0 && hv !== 0 ? (hu * hv > 0 ? 'nwse-resize' : 'nesw-resize') : hu !== 0 ? 'ew-resize' : 'ns-resize')
</script>

<template>
  <Panel title="Monitor del programa">
    <div class="monitor">
      <div class="stage">
        <div class="frame" :style="{ '--ratio': ratio }" data-testid="monitor-frame">
          <canvas ref="canvas" class="gl" data-testid="monitor-canvas" />
          <svg ref="stage" class="overlay" :viewBox="`0 0 ${W} ${H}`" preserveAspectRatio="none" @pointerdown.self="tl.select([])">
            <template v-if="target && corners">
              <line v-if="guides.v" :x1="W / 2" y1="0" :x2="W / 2" :y2="H" class="guide" />
              <line v-if="guides.h" x1="0" :y1="H / 2" :x2="W" :y2="H / 2" class="guide" />
              <polygon :points="poly" class="box" data-testid="transform-box" @pointerdown="startMove" />
              <template v-if="rotHandle">
                <line :x1="rotHandle.from[0]" :y1="rotHandle.from[1]" :x2="rotHandle.pos[0]" :y2="rotHandle.pos[1]" class="rot-line" />
                <circle :cx="rotHandle.pos[0]" :cy="rotHandle.pos[1]" :r="hs * 0.9" class="handle round" style="cursor: crosshair" data-testid="handle-rotate" @pointerdown="startRotate" />
              </template>
              <rect
                v-for="h in handles"
                :key="h.id"
                :x="h.pos[0] - hs"
                :y="h.pos[1] - hs"
                :width="hs * 2"
                :height="hs * 2"
                class="handle"
                :style="{ cursor: cursorFor(h.hu, h.hv) }"
                :data-testid="`handle-${h.id}`"
                @pointerdown="startScale($event, h.hu, h.hv)"
              />
              <g v-if="anchorPos" class="anchor" data-testid="anchor-point" @pointerdown="startAnchor">
                <circle :cx="anchorPos[0]" :cy="anchorPos[1]" :r="hs * 1.1" />
                <line :x1="anchorPos[0] - hs * 1.8" :y1="anchorPos[1]" :x2="anchorPos[0] + hs * 1.8" :y2="anchorPos[1]" />
                <line :x1="anchorPos[0]" :y1="anchorPos[1] - hs * 1.8" :x2="anchorPos[0]" :y2="anchorPos[1] + hs * 1.8" />
              </g>
            </template>
          </svg>
        </div>
      </div>

      <div class="bar">
        <div class="tc-wrap">
          <input v-if="editingTc" ref="tcInput" v-model="tcText" class="tc-edit mono" type="text" @blur="commitTc" @keydown.enter="($event.target as HTMLInputElement).blur()" @keydown.esc="editingTc = false" />
          <span v-else class="tc mono accent" data-testid="monitor-tc" title="Clic para escribir un timecode" @click="startEditTc">{{ fmt(tl.playhead) }}</span>
        </div>
        <div class="transport">
          <button class="icon-btn" title="Ir al inicio (Home)" data-testid="go-start" @click="tl.setPlayhead(0)"><Icon name="skipBack" :size="14" /></button>
          <button class="icon-btn" title="Frame anterior (←)" data-testid="frame-back" @click="frameStep(-1)"><Icon name="left" :size="14" /></button>
          <button class="icon-btn play" :title="pb.playing ? 'Pausa (Espacio)' : 'Reproducir (Espacio)'" data-testid="play" @click="engine.toggle()">
            <Icon :name="pb.playing ? 'pause' : 'play'" :size="15" />
          </button>
          <button class="icon-btn" title="Frame siguiente (→)" data-testid="frame-fwd" @click="frameStep(1)"><Icon name="rightArrow" :size="14" /></button>
          <button class="icon-btn" title="Ir al final (End)" @click="tl.setPlayhead(tl.duration)"><Icon name="skipFwd" :size="14" /></button>
          <button class="icon-btn" :class="{ on: pb.loop }" title="Bucle" data-testid="loop" @click="pb.loop = !pb.loop"><Icon name="repeat" :size="14" /></button>
        </div>
        <div class="right">
          <select :value="pb.quality" title="Calidad de la vista previa" data-testid="quality" @change="engine.setQuality(($event.target as HTMLSelectElement).value as Quality)">
            <option v-for="q in qualities" :key="q.v" :value="q.v">{{ q.label }}</option>
          </select>
          <Icon name="vol" :size="13" />
          <input class="master" type="range" min="0" max="200" :value="Math.round((settings?.masterVolume ?? 1) * 100)" title="Volumen general (Master)" data-testid="master-volume" @input="onMaster" />
          <span class="mono dim dur" data-testid="monitor-dur">{{ fmt(tl.duration) }}</span>
        </div>
      </div>
    </div>
  </Panel>
</template>

<style scoped>
.monitor { height: 100%; background: var(--monitor-bg); display: flex; flex-direction: column; }
.stage { flex: 1; min-height: 0; container-type: size; display: grid; place-items: center; }
.frame { position: relative; width: min(94cqw, calc(94cqh * var(--ratio))); aspect-ratio: var(--ratio); outline: 1px solid var(--border-subtle); background: #000; }
.gl { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.overlay { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.box { fill: transparent; stroke: var(--accent); stroke-width: 1.5; vector-effect: non-scaling-stroke; cursor: move; }
.handle { fill: #fff; stroke: var(--accent); stroke-width: 1; vector-effect: non-scaling-stroke; }
.handle.round { fill: var(--accent); stroke: #fff; }
.rot-line { stroke: var(--accent); stroke-width: 1; vector-effect: non-scaling-stroke; }
.anchor { cursor: move; }
.anchor circle { fill: none; stroke: #fff; stroke-width: 1.2; vector-effect: non-scaling-stroke; }
.anchor line { stroke: #fff; stroke-width: 1.2; vector-effect: non-scaling-stroke; }
.guide { stroke: #ff4d8d; stroke-width: 1; vector-effect: non-scaling-stroke; }
.bar { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: 4px 10px; flex: none; gap: 8px; }
.tc { cursor: text; font-size: 12px; }
.tc-edit { width: 96px; font-size: 12px; padding: 1px 4px; }
.accent { color: var(--accent); }
.transport { display: flex; align-items: center; gap: 2px; }
.transport .play { width: 30px; color: var(--text); }
.icon-btn.on { color: var(--accent); }
.right { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
.right select { padding: 1px 4px; font-size: 10.5px; }
.master { width: 70px; accent-color: var(--accent); }
.dur { min-width: 72px; text-align: right; }
</style>
