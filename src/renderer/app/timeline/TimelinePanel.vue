<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import type { Clip, MediaItem, Track } from '@shared/project-schema'
import { clipDuration, clipEnd, gapAt, mediaFitsTrack, quantize, snapPoints, snapTime, trackClips, trimClip, type Move } from '@shared/timeline-ops'
import { formatTimecode } from '@shared/timecode'
import { useProjectStore } from '@/stores/project'
import { useTimelineStore, type Tool } from '@/stores/timeline'
import { useUiStore, type MenuEntry } from '@/stores/ui'
import { useWaveStore } from '@/stores/waves'
import { useTransitionsStore } from '@/stores/transitions'
import { transitionRange } from '@shared/transition-model'
import type { Transition } from '@shared/project-schema'
import Panel from '../components/Panel.vue'
import Icon from '../components/Icon.vue'
import ClipView from './ClipView.vue'
import TrackHeader from './TrackHeader.vue'
import TimelineRuler from './TimelineRuler.vue'

const HEADER_W = 170
const RULER_H = 24
const COLLAPSED_H = 22

const project = useProjectStore()
const tl = useTimelineStore()
const ui = useUiStore()
const waves = useWaveStore()
const trs = useTransitionsStore()
const dropTarget = ref<{ trackId: string; time: number; leaveId: string | null; enterId: string | null } | null>(null)

const scroller = ref<HTMLElement | null>(null)
const collapsed = reactive(new Set<string>())
const preview = ref<Record<string, { start: number; trackId: string }> | null>(null)
const marquee = ref<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
const reorder = ref<{ trackId: string; lineY: number } | null>(null)
const dropPreview = ref<{ trackId: string; start: number; dur: number } | null>(null)
let resizeObs: ResizeObserver | null = null

const p = computed(() => project.project)
const zoom = computed(() => tl.zoom)
const tracks = computed(() => p.value?.tracks ?? [])
const fps = computed(() => p.value?.settings.fps ?? { num: 30, den: 1 })
const rowH = (t: Track): number => (collapsed.has(t.id) ? COLLAPSED_H : t.height)
const viewW = ref(800)
const contentW = computed(() => Math.max(viewW.value - HEADER_W, (tl.duration + 30) * zoom.value))
const rowTops = computed(() => {
  let y = RULER_H
  return tracks.value.map((t) => {
    const top = y
    y += rowH(t)
    return top
  })
})
const totalH = computed(() => RULER_H + tracks.value.reduce((a, t) => a + rowH(t), 0))
const firstAudio = computed(() => tracks.value.findIndex((t) => t.kind === 'audio'))
const mediaMap = computed(() => new Map((p.value?.media ?? []).map((m) => [m.id, m])))
const playheadX = computed(() => HEADER_W + tl.playhead * zoom.value)
const tc = (t: number): string => formatTimecode(t, fps.value.num, fps.value.den)

// ───────── Utilidades de coordenadas ─────────

function contentPoint(e: { clientX: number; clientY: number }): { x: number; y: number } {
  const el = scroller.value
  if (!el) return { x: 0, y: 0 }
  const r = el.getBoundingClientRect()
  return { x: e.clientX - r.left + el.scrollLeft, y: e.clientY - r.top + el.scrollTop }
}
function timeAt(e: { clientX: number; clientY: number }): number {
  return Math.max(0, (contentPoint(e).x - HEADER_W) / zoom.value)
}
function trackIndexAt(y: number): number {
  for (let i = 0; i < tracks.value.length; i++) {
    const top = rowTops.value[i] ?? 0
    if (y >= top && y < top + rowH(tracks.value[i] as Track)) return i
  }
  return -1
}
const snapThreshold = (): number => 8 / zoom.value

function snapped(t: number, exclude: Set<string>): number {
  if (!tl.snap || !p.value) return t
  const r = snapTime(t, snapPoints(p.value, exclude, tl.playhead), snapThreshold())
  tl.snapGuide = r.snapped ? r.time : null
  return r.time
}

// ───────── Cabezal / regla ─────────

function onScrub(e: PointerEvent): void {
  const set = (ev: PointerEvent): void => tl.setPlayhead(snapped(timeAt(ev), new Set()))
  set(e)
  const move = (ev: PointerEvent): void => set(ev)
  const up = (): void => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    tl.snapGuide = null
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

// ───────── Gestos sobre clips ─────────

type Zone = 'left' | 'body' | 'right'

function onClipDown(e: PointerEvent, clip: Clip, zone: Zone): void {
  if (e.button === 2) {
    if (!tl.selection.includes(clip.id)) tl.select([clip.id])
    return
  }
  if (e.button !== 0) return
  e.stopPropagation()
  tl.selectedTrackId = clip.trackId

  if (tl.tool === 'razor') {
    if (!tl.isLocked(clip.trackId)) tl.splitAt(clip.id, snapped(timeAt(e), new Set()))
    tl.snapGuide = null
    return
  }
  if (tl.tool === 'hand') return startPan(e)

  if (e.ctrlKey || e.metaKey) return tl.toggleSelect(clip.id)
  if (e.shiftKey) return tl.select([clip.id], true)
  if (!tl.selection.includes(clip.id)) tl.select([clip.id])
  if (tl.isLocked(clip.trackId)) return

  if (zone === 'body') startMove(e, clip)
  else startTrim(e, clip, zone === 'left' ? 'start' : 'end')
}

function startTrim(e: PointerEvent, clip: Clip, edge: 'start' | 'end'): void {
  const before = tl.snapshot()
  const move = (ev: PointerEvent): void => {
    const t = snapped(quantize(p.value as never, timeAt(ev)), new Set([clip.id]))
    project.mutate((proj) => trimClipLive(proj, clip.id, edge, t))
  }
  const up = (): void => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    tl.snapGuide = null
    tl.commit('Recortar clip', before)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  void e
}

function startMove(e: PointerEvent, anchor: Clip): void {
  const proj = p.value
  if (!proj) return
  const ids = tl.editableSelection()
  const items = proj.clips.filter((c) => ids.includes(c.id))
  const orig = new Map(items.map((c) => [c.id, { start: c.start, trackId: c.trackId, dur: clipDuration(c) }]))
  const minStart = Math.min(...items.map((c) => c.start))
  const maxEnd = Math.max(...items.map((c) => clipEnd(c)))
  const x0 = e.clientX
  const y0 = e.clientY
  const alt = e.altKey
  const anchorIdx = tracks.value.findIndex((t) => t.id === anchor.trackId)
  let moved = false
  let last: Record<string, { start: number; trackId: string }> | null = null
  const exclude = new Set(ids)

  const compute = (ev: PointerEvent): Record<string, { start: number; trackId: string }> => {
    let delta = (ev.clientX - x0) / zoom.value
    // Imán: se prueba el borde inicial y el final del grupo
    if (tl.snap) {
      const pts = snapPoints(proj, exclude, tl.playhead)
      const a = snapTime(minStart + delta, pts, snapThreshold())
      const b = snapTime(maxEnd + delta, pts, snapThreshold())
      const da = a.snapped ? Math.abs(a.time - (minStart + delta)) : Infinity
      const db = b.snapped ? Math.abs(b.time - (maxEnd + delta)) : Infinity
      if (da <= db && a.snapped) {
        delta = a.time - minStart
        tl.snapGuide = a.time
      } else if (b.snapped) {
        delta = b.time - maxEnd
        tl.snapGuide = b.time
      } else tl.snapGuide = null
    } else {
      delta = quantize(proj, minStart + delta) - minStart
    }
    delta = Math.max(delta, -minStart)
    // Cambio de pista: mismo desplazamiento de índice para todos, solo entre pistas del mismo tipo y desbloqueadas
    const under = trackIndexAt(contentPoint(ev).y)
    let shift = under < 0 ? 0 : under - anchorIdx
    const ok = (s: number): boolean =>
      items.every((c) => {
        const from = tracks.value.findIndex((t) => t.id === orig.get(c.id)?.trackId)
        const to = tracks.value[from + s]
        const src = tracks.value[from]
        return Boolean(to && src && to.kind === src.kind && !to.locked)
      })
    if (shift !== 0 && !ok(shift)) shift = 0
    const out: Record<string, { start: number; trackId: string }> = {}
    for (const c of items) {
      const o = orig.get(c.id)
      if (!o) continue
      const from = tracks.value.findIndex((t) => t.id === o.trackId)
      out[c.id] = { start: o.start + delta, trackId: (tracks.value[from + shift] as Track).id }
    }
    return out
  }

  const move = (ev: PointerEvent): void => {
    if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 3) return
    moved = true
    last = compute(ev)
    preview.value = last
  }
  const up = (ev: PointerEvent): void => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    tl.snapGuide = null
    preview.value = null
    if (!moved || !last) return
    const moves: Move[] = Object.entries(last).map(([id, v]) => ({ id, start: v.start, trackId: v.trackId }))
    const mode = ev.ctrlKey || ev.metaKey ? 'insert' : 'overwrite'
    if (alt) tl.duplicateClips(moves, mode)
    else tl.moveClips(moves, mode)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function trimClipLive(proj: NonNullable<typeof p.value>, id: string, edge: 'start' | 'end', t: number): void {
  trimClip(proj, id, edge, t)
}

function startPan(e: PointerEvent): void {
  const el = scroller.value
  if (!el) return
  const x0 = e.clientX, y0 = e.clientY, sl = el.scrollLeft, st = el.scrollTop
  const move = (ev: PointerEvent): void => {
    el.scrollLeft = sl - (ev.clientX - x0)
    el.scrollTop = st - (ev.clientY - y0)
  }
  const up = (): void => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

// ───────── Fondo de pista: marquesina, mano, selección de pista ─────────

function onLaneDown(e: PointerEvent, track: Track): void {
  if (e.button !== 0) return
  tl.selectedTrackId = track.id
  if (tl.tool === 'hand') return startPan(e)
  const start = contentPoint(e)
  const additive = e.ctrlKey || e.metaKey || e.shiftKey
  const base = additive ? [...tl.selection] : []
  if (!additive) tl.select([])
  let moved = false
  const move = (ev: PointerEvent): void => {
    const c = contentPoint(ev)
    if (!moved && Math.hypot(c.x - start.x, c.y - start.y) < 3) return
    moved = true
    marquee.value = { x0: start.x, y0: start.y, x1: c.x, y1: c.y }
    const [xa, xb] = [Math.min(start.x, c.x), Math.max(start.x, c.x)]
    const [ya, yb] = [Math.min(start.y, c.y), Math.max(start.y, c.y)]
    const hit: string[] = []
    tracks.value.forEach((t, i) => {
      const top = rowTops.value[i] ?? 0
      if (top + rowH(t) < ya || top > yb) return
      for (const cl of trackClips(p.value as never, t.id)) {
        const l = HEADER_W + cl.start * zoom.value
        const r = HEADER_W + clipEnd(cl) * zoom.value
        if (r >= xa && l <= xb) hit.push(cl.id)
      }
    })
    tl.select([...new Set([...base, ...hit])])
  }
  const up = (): void => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    marquee.value = null
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

// ───────── Reordenar pistas ─────────

function startReorder(e: PointerEvent, track: Track): void {
  const group = (): Track[] => tracks.value.filter((t) => t.kind === track.kind && t.id !== track.id)
  const target = (ev: PointerEvent): { index: number; lineY: number } => {
    const y = contentPoint(ev).y
    const g = group()
    let index = 0
    for (const t of g) {
      const i = tracks.value.findIndex((x) => x.id === t.id)
      if ((rowTops.value[i] ?? 0) + rowH(t) / 2 < y) index++
    }
    const ref = g[index]
    const lineY = ref
      ? (rowTops.value[tracks.value.findIndex((x) => x.id === ref.id)] ?? 0)
      : (() => {
          const lastT = g.at(-1)
          if (!lastT) return rowTops.value[tracks.value.findIndex((x) => x.id === track.id)] ?? RULER_H
          const li = tracks.value.findIndex((x) => x.id === lastT.id)
          return (rowTops.value[li] ?? 0) + rowH(lastT)
        })()
    return { index, lineY }
  }
  const move = (ev: PointerEvent): void => {
    reorder.value = { trackId: track.id, lineY: target(ev).lineY }
  }
  const up = (ev: PointerEvent): void => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    const { index } = target(ev)
    reorder.value = null
    const current = tracks.value.filter((t) => t.kind === track.kind).findIndex((t) => t.id === track.id)
    if (index !== current) tl.moveTrack(track.id, index)
  }
  reorder.value = { trackId: track.id, lineY: target(e).lineY }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

// ───────── Soltar medios (panel Proyecto o explorador) ─────────

function dropTrack(e: DragEvent): { track: Track; media: MediaItem | undefined } | null {
  const i = trackIndexAt(contentPoint(e).y)
  const track = tracks.value[i]
  if (!track) return null
  return { track, media: ui.dragMediaId ? mediaMap.value.get(ui.dragMediaId) : undefined }
}
function onDragOver(e: DragEvent): void {
  if (ui.dragTransitionRef) {
    const target = transitionDropTarget(e)
    dropTarget.value = target
    if (target) e.preventDefault()
    return
  }
  const hit = dropTrack(e)
  const external = e.dataTransfer?.types.includes('Files')
  if (!hit || hit.track.locked) return void (dropPreview.value = null)
  if (hit.media && !mediaFitsTrack(hit.media, hit.track)) return void (dropPreview.value = null)
  if (!hit.media && !external) return void (dropPreview.value = null)
  e.preventDefault()
  const start = snapped(quantize(p.value as never, timeAt(e)), new Set())
  dropPreview.value = { trackId: hit.track.id, start, dur: hit.media?.kind === 'image' ? 5 : (hit.media?.probe?.duration ?? 3) }
}
async function onDrop(e: DragEvent): Promise<void> {
  if (ui.dragTransitionRef) {
    const target = dropTarget.value
    dropTarget.value = null
    const ref = ui.dragTransitionRef
    ui.dragTransitionRef = null
    if (target) {
      e.preventDefault()
      tl.applyTransition(target.leaveId, target.enterId, ref)
    }
    return
  }
  const prev = dropPreview.value
  dropPreview.value = null
  tl.snapGuide = null
  const hit = dropTrack(e)
  if (!hit || !prev) return
  e.preventDefault()
  const mode = e.ctrlKey || e.metaKey ? 'insert' : 'overwrite'
  if (hit.media) {
    tl.addMedia(hit.media.id, { trackId: hit.track.id, start: prev.start, mode })
    return
  }
  const files = Array.from(e.dataTransfer?.files ?? [])
  const paths = files.map((f) => window.viditor.media.pathForFile(f)).filter(Boolean)
  const imported = await project.importPaths(paths)
  let t = prev.start
  for (const m of imported) {
    const track = mediaFitsTrack(m, hit.track) ? hit.track : tl.defaultTrackFor(m.kind === 'audio' ? 'audio' : 'video')
    if (!track) continue
    const id = tl.addMedia(m.id, { trackId: track.id, start: t, mode })
    const c = p.value?.clips.find((x) => x.id === id)
    if (c) t = clipEnd(c)
  }
}

// ───────── Transiciones ─────────

const transitionsOf = (t: Track): { tr: Transition; start: number; end: number }[] => {
  const proj = p.value
  if (!proj) return []
  const out: { tr: Transition; start: number; end: number }[] = []
  for (const tr of proj.transitions) {
    if (tr.trackId !== t.id) continue
    const r = transitionRange(proj, tr)
    if (r) out.push({ tr, start: r.start, end: r.end })
  }
  return out
}
const transitionBroken = (ref: string): boolean => !trs.exists(ref) || Boolean(trs.errorOf(ref))

/** Unión o extremo de clip más cercano al puntero para soltar una transición. */
function transitionDropTarget(e: DragEvent): { trackId: string; time: number; leaveId: string | null; enterId: string | null } | null {
  const proj = p.value
  const track = tracks.value[trackIndexAt(contentPoint(e).y)]
  if (!proj || !track || track.kind !== 'video' || track.locked) return null
  const t = timeAt(e)
  const thr = 16 / zoom.value
  const fd = 1 / (proj.settings.fps.num / proj.settings.fps.den)
  const list = trackClips(proj, track.id)
  let best: { trackId: string; time: number; leaveId: string | null; enterId: string | null; d: number } | null = null
  for (const c of list) {
    const end = clipEnd(c)
    const dEnd = Math.abs(t - end)
    if (dEnd <= thr && (!best || dEnd < best.d)) {
      const next = list.find((x) => x.id !== c.id && Math.abs(x.start - end) < fd / 2)
      best = { trackId: track.id, time: end, leaveId: c.id, enterId: next?.id ?? null, d: dEnd }
    }
    const dStart = Math.abs(t - c.start)
    const hasPrev = list.some((x) => x.id !== c.id && Math.abs(clipEnd(x) - c.start) < fd / 2)
    if (!hasPrev && dStart <= thr && (!best || dStart < best.d)) best = { trackId: track.id, time: c.start, leaveId: null, enterId: c.id, d: dStart }
  }
  return best
}

function onTransitionDown(e: PointerEvent, tr: Transition): void {
  if (e.button === 2) return tl.selectTransition(tr.id)
  if (e.button !== 0) return
  tl.selectTransition(tr.id)
}

/** Arrastrar el borde de un bloque cambia la duración: el izquierdo en las que llevan clip saliente, el derecho si solo hay entrante. */
function startTransitionResize(e: PointerEvent, tr: Transition, side: 'left' | 'right'): void {
  e.preventDefault()
  e.stopPropagation()
  tl.selectTransition(tr.id)
  const before = tl.snapshot()
  const r0 = tl.rangeOf(tr.id)
  if (!r0) return
  const move = (ev: PointerEvent): void => {
    const x = quantize(p.value as never, timeAt(ev))
    const d = side === 'left' ? r0.end - x : x - r0.start
    tl.liveTransitionDuration(tr.id, d)
    // Con clip saliente y entrante el borde derecho queda fijo: el rango se recalcula tras mover B
    r0.start = tl.rangeOf(tr.id)?.start ?? r0.start
  }
  const up = (): void => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    tl.commit('Cambiar duración de la transición', before)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function transitionMenu(e: MouseEvent, tr: Transition): void {
  tl.selectTransition(tr.id)
  ui.openMenu(e, [
    { label: 'Eliminar transición', shortcut: 'Supr', action: () => tl.removeTransition(tr.id) },
    {
      label: 'Editar código',
      disabled: !trs.exists(tr.transitionRef),
      action: () => {
        trs.editing = tr.transitionRef
        ui.workspace = 'transitions'
      }
    }
  ])
}

// ───────── Menús contextuales ─────────

function clipMenu(e: MouseEvent, clip: Clip): void {
  const t = snapped(timeAt(e), new Set())
  tl.snapGuide = null
  const m = mediaMap.value.get(clip.mediaId)
  const locked = tl.isLocked(clip.trackId)
  const canSplit = t > clip.start && t < clipEnd(clip)
  const items: MenuEntry[] = [
    { label: 'Dividir', shortcut: 'Ctrl+K', disabled: locked || !canSplit, action: () => tl.splitAt(clip.id, t) },
    { label: 'Eliminar', shortcut: 'Supr', disabled: locked, action: () => tl.deleteSelection(false) },
    { label: 'Eliminar y cerrar hueco', shortcut: 'Mayús+Supr', disabled: locked, action: () => tl.deleteSelection(true) },
    { separator: true, label: '' },
    {
      label: 'Separar audio',
      disabled: locked || clip.audio.muted || !m?.probe?.hasAudio || m.kind !== 'video' || tl.selectedClips.length !== 1,
      action: () => tl.separateAudio(clip.id)
    },
    { label: 'Agregar transición al inicio', disabled: locked || m?.kind === 'audio', action: () => tl.applyTransition(null, clip.id) },
    { label: 'Agregar transición al final', disabled: locked || m?.kind === 'audio', action: () => tl.applyTransition(clip.id, null) },
    { separator: true, label: '' },
    { label: clip.enabled ? 'Deshabilitar' : 'Habilitar', shortcut: 'Mayús+E', disabled: locked, action: () => tl.toggleEnabled() },
    { separator: true, label: '' },
    { label: 'Restablecer transformación', disabled: true },
    { label: 'Mostrar en el explorador', disabled: !m, action: () => m && window.viditor.media.reveal(m.path) },
    { label: 'Propiedades', disabled: true }
  ]
  ui.openMenu(e, items)
}
function laneMenu(e: MouseEvent, track: Track): void {
  const t = timeAt(e)
  const gap = gapAt(p.value as never, track.id, t)
  ui.openMenu(e, [
    { label: 'Eliminar hueco', disabled: !gap || track.locked, action: () => tl.removeGap(track.id, t) },
    { label: 'Agregar marcador aquí', action: () => { tl.setPlayhead(t); tl.addMarker() } }
  ])
}
function trackMenu(e: MouseEvent, track: Track): void {
  const hasClips = (p.value?.clips ?? []).some((c) => c.trackId === track.id)
  ui.openMenu(e, [
    { label: 'Agregar pista arriba', action: () => tl.addTrack(track.kind, track.id, 'above') },
    { label: 'Agregar pista abajo', action: () => tl.addTrack(track.kind, track.id, 'below') },
    { label: 'Duplicar pista', action: () => tl.duplicateTrack(track.id) },
    {
      label: 'Eliminar pista',
      disabled: tracks.value.filter((t) => t.kind === track.kind).length <= 1,
      action: () => {
        if (!hasClips || window.confirm(`La pista ${track.name} contiene clips. ¿Eliminarla de todos modos?`)) tl.deleteTrack(track.id)
      }
    },
    { separator: true, label: '' },
    { label: collapsed.has(track.id) ? 'Expandir' : 'Contraer', action: () => (collapsed.has(track.id) ? collapsed.delete(track.id) : collapsed.add(track.id)) }
  ])
}

// ───────── Zoom, rueda, scroll ─────────

function onWheel(e: WheelEvent): void {
  if (!e.altKey && !e.ctrlKey) return
  e.preventDefault()
  const el = scroller.value
  if (!el) return
  const anchorT = timeAt(e)
  const px = e.clientX - el.getBoundingClientRect().left
  tl.setZoom(zoom.value * (e.deltaY < 0 ? 1.15 : 1 / 1.15))
  el.scrollLeft = HEADER_W + anchorT * zoom.value - px
}

watch(
  () => tl.playhead,
  () => {
    const el = scroller.value
    if (!el) return
    const x = playheadX.value
    const left = el.scrollLeft + HEADER_W
    const right = el.scrollLeft + el.clientWidth
    if (x < left) el.scrollLeft = Math.max(0, x - HEADER_W - 40)
    else if (x > right - 20) el.scrollLeft = x - el.clientWidth + 120
  }
)

// Formas de onda: se piden las de los medios con clips en la línea de tiempo
watch(
  () => p.value?.clips.map((c) => c.mediaId).join(','),
  () => {
    for (const id of new Set(p.value?.clips.map((c) => c.mediaId))) {
      const m = mediaMap.value.get(id)
      if (m) void waves.ensure(m)
    }
  },
  { immediate: true }
)

onMounted(() => {
  const el = scroller.value
  if (!el) return
  resizeObs = new ResizeObserver(() => {
    viewW.value = el.clientWidth
    tl.viewWidth = el.clientWidth
  })
  resizeObs.observe(el)
  viewW.value = el.clientWidth
  tl.viewWidth = el.clientWidth
  el.scrollLeft = p.value?.view.scroll ?? 0
})
onUnmounted(() => {
  if (p.value && scroller.value) p.value.view.scroll = scroller.value.scrollLeft
  resizeObs?.disconnect()
})

const tools: { id: Tool; icon: 'pointer' | 'razor' | 'hand'; label: string; key: string }[] = [
  { id: 'select', icon: 'pointer', label: 'Selección', key: 'V' },
  { id: 'razor', icon: 'razor', label: 'Cuchilla', key: 'C' },
  { id: 'hand', icon: 'hand', label: 'Mano', key: 'H' }
]
const previewStart = (c: Clip): number | undefined => preview.value?.[c.id]?.start
function clipsOf(t: Track): Clip[] {
  const list = p.value?.clips.filter((c) => (preview.value?.[c.id]?.trackId ?? c.trackId) === t.id) ?? []
  return [...list].sort((a, b) => a.start - b.start)
}
</script>

<template>
  <Panel title="Línea de tiempo: Secuencia 1" help="timeline">
    <template #actions>
      <div class="tools" data-testid="timeline-tools">
        <button v-for="t in tools" :key="t.id" class="icon-btn" :class="{ on: tl.tool === t.id }" :title="`${t.label} (${t.key})`" :data-testid="`tool-${t.id}`" @click="tl.tool = t.id">
          <Icon :name="t.icon" :size="14" />
        </button>
        <span class="sep" />
        <button class="icon-btn" :class="{ on: tl.snap }" title="Imán (S)" data-testid="tool-snap" @click="tl.snap = !tl.snap"><Icon name="magnet" :size="14" /></button>
        <button class="icon-btn" title="Agregar pista de video" data-testid="add-video-track" @click="tl.addTrack('video', tl.selectedTrackId && tracks.find((t) => t.id === tl.selectedTrackId)?.kind === 'video' ? tl.selectedTrackId : (tracks.find((t) => t.kind === 'video')?.id ?? null), 'above')">
          <Icon name="video" :size="14" /><span class="plus">+</span>
        </button>
        <button class="icon-btn" title="Agregar pista de audio" data-testid="add-audio-track" @click="tl.addTrack('audio', tracks.filter((t) => t.kind === 'audio').at(-1)?.id ?? null, 'below')">
          <Icon name="music" :size="14" /><span class="plus">+</span>
        </button>
        <span class="sep" />
        <input class="zoom" type="range" min="0" max="100" :value="Math.round((Math.log(zoom / 4) / Math.log(1200 / 4)) * 100)" title="Zoom" @input="tl.setZoom(4 * Math.pow(1200 / 4, Number(($event.target as HTMLInputElement).value) / 100))" />
      </div>
    </template>

    <div v-if="p" class="tl" data-testid="timeline">
      <div ref="scroller" class="scroller" :class="`tool-${tl.tool}`" @wheel="onWheel" @dragover="onDragOver" @dragleave="dropPreview = null; dropTarget = null" @drop="onDrop">
        <div class="content" :style="{ width: HEADER_W + contentW + 'px', height: Math.max(totalH, 1) + 'px' }">
          <div class="ruler-row">
            <div class="corner mono" data-testid="timecode">{{ tc(tl.playhead) }}</div>
            <TimelineRuler :zoom="zoom" :width="contentW" :fps-num="fps.num" :fps-den="fps.den" :markers="p.markers" @scrub="onScrub" @marker="tl.setPlayhead($event)" />
            <div class="ph-cap" :style="{ left: playheadX + 'px' }" />
          </div>

          <div
            v-for="(t, i) in tracks"
            :key="t.id"
            class="row"
            :class="{ 'group-start': i === firstAudio && i > 0, hidden: t.hidden, locked: t.locked, dragged: reorder?.trackId === t.id }"
            :style="{ height: rowH(t) + 'px' }"
            :data-track-id="t.id"
            :data-testid="`row-${t.name}`"
          >
            <div class="head-cell"><TrackHeader :track="t" :height="rowH(t)" :selected="tl.selectedTrackId === t.id" :collapsed="collapsed.has(t.id)" @reorder="startReorder($event, t)" @menu="trackMenu($event, t)" /></div>
            <div class="lane" :style="{ width: contentW + 'px' }" data-testid="lane" @pointerdown="onLaneDown($event, t)" @contextmenu="laneMenu($event, t)">
              <ClipView
                v-for="c in clipsOf(t)"
                :key="c.id"
                :clip="c"
                :media="mediaMap.get(c.mediaId)"
                :track="t"
                :zoom="zoom"
                :height="rowH(t) - 5"
                :selected="tl.selection.includes(c.id)"
                :dragging="Boolean(preview?.[c.id])"
                :missing="project.missing.includes(c.mediaId)"
                :start="previewStart(c)"
                @down="(ev: PointerEvent, z: Zone) => onClipDown(ev, c, z)"
                @menu="clipMenu($event, c)"
              />
              <div
                v-for="x in transitionsOf(t)"
                :key="x.tr.id"
                class="tblock"
                :class="{ selected: tl.selectedTransition === x.tr.id, broken: transitionBroken(x.tr.transitionRef) }"
                :style="{ left: x.start * zoom + 'px', width: Math.max(8, (x.end - x.start) * zoom) + 'px' }"
                :title="trs.errorOf(x.tr.transitionRef) ?? trs.nameOf(x.tr.transitionRef)"
                data-testid="transition-block"
                @pointerdown="onTransitionDown($event, x.tr)"
                @contextmenu.stop="transitionMenu($event, x.tr)"
              >
                <span class="tname">{{ trs.exists(x.tr.transitionRef) ? trs.nameOf(x.tr.transitionRef) : 'Falta: ' + x.tr.transitionRef }}</span>
                <div v-if="x.tr.leaveClipId" class="tedge left" @pointerdown="startTransitionResize($event, x.tr, 'left')" />
                <div v-else class="tedge right" @pointerdown="startTransitionResize($event, x.tr, 'right')" />
              </div>
              <div v-if="dropTarget?.trackId === t.id" class="drop-junction" :style="{ left: dropTarget.time * zoom + 'px' }" data-testid="drop-junction" />
              <div v-if="dropPreview?.trackId === t.id" class="drop-ghost" :style="{ left: dropPreview.start * zoom + 'px', width: Math.max(4, dropPreview.dur * zoom) + 'px' }" />
            </div>
          </div>

          <div class="playhead" :style="{ left: playheadX + 'px' }" data-testid="playhead" />
          <div v-if="tl.snapGuide !== null" class="snap-guide" :style="{ left: HEADER_W + tl.snapGuide * zoom + 'px' }" />
          <div v-if="marquee" class="marquee" :style="{ left: Math.min(marquee.x0, marquee.x1) + 'px', top: Math.min(marquee.y0, marquee.y1) + 'px', width: Math.abs(marquee.x1 - marquee.x0) + 'px', height: Math.abs(marquee.y1 - marquee.y0) + 'px' }" />
          <div v-if="reorder" class="insert-line" :style="{ top: reorder.lineY - 1 + 'px', width: HEADER_W + contentW + 'px' }" data-testid="insert-line" />
        </div>
      </div>
    </div>
  </Panel>
</template>

<style scoped>
.tools { display: flex; align-items: center; gap: 1px; }
.tools .icon-btn { position: relative; width: 24px; }
.tools .icon-btn.on { color: var(--accent); background: #2f3a47; }
.plus { position: absolute; right: 1px; top: 0; font-size: 9px; font-weight: 700; }
.sep { width: 1px; height: 14px; background: var(--border-subtle); margin: 0 4px; }
.zoom { width: 90px; accent-color: var(--accent); }
.tl { height: 100%; position: relative; }
.scroller { position: absolute; inset: 0; overflow: auto; background: var(--bg-panel); }
.scroller.tool-razor .lane { cursor: crosshair; }
.scroller.tool-hand .lane, .scroller.tool-hand :deep(.clip) { cursor: grab; }
.content { position: relative; min-width: 100%; }
.ruler-row { position: sticky; top: 0; z-index: 8; display: flex; height: 24px; }
.corner { position: sticky; left: 0; z-index: 9; flex: none; width: 170px; height: 24px; display: flex; align-items: center; padding-left: 10px; background: var(--bg-panel-header); border-bottom: 1px solid var(--border); border-right: 1px solid var(--border); color: var(--accent); font-size: 12px; }
.row { display: flex; position: relative; border-bottom: 1px solid var(--border); }
.row.group-start { border-top: 3px solid #0d0d0d; }
.row.dragged { opacity: 0.5; }
.row.hidden .lane { opacity: 0.45; }
.row.locked .lane { background-image: repeating-linear-gradient(135deg, transparent 0 6px, rgba(255, 255, 255, 0.03) 6px 12px); }
.head-cell { position: sticky; left: 0; z-index: 6; flex: none; width: 170px; }
.lane { position: relative; flex: none; background: #1f1f1f; }
.row:nth-child(odd) .lane { background: #202020; }
.tblock { position: absolute; top: 2px; bottom: 3px; z-index: 4; border-radius: 2px; overflow: hidden; cursor: default; background-color: rgba(201, 180, 88, 0.55); background-image: repeating-linear-gradient(135deg, rgba(0, 0, 0, 0.22) 0 5px, transparent 5px 10px); border: 1px solid var(--transition); }
.tblock.selected { border-color: #fff; background-color: rgba(201, 180, 88, 0.8); }
.tblock.broken { background-color: rgba(229, 72, 77, 0.55); border-color: var(--danger); }
.tname { position: absolute; inset: 0; display: grid; place-items: center; font-size: 10px; font-weight: 600; color: #fff; text-shadow: 0 0 2px #000; padding: 0 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
.tedge { position: absolute; top: 0; bottom: 0; width: 6px; cursor: ew-resize; }
.tedge.left { left: 0; }
.tedge.right { right: 0; }
.tedge:hover { background: rgba(255, 255, 255, 0.5); }
.drop-junction { position: absolute; top: 0; bottom: 0; width: 3px; margin-left: -1px; background: var(--accent); box-shadow: 0 0 8px var(--accent); z-index: 6; pointer-events: none; }
.drop-ghost { position: absolute; top: 2px; bottom: 3px; background: rgba(45, 140, 235, 0.35); border: 1px dashed var(--accent); border-radius: 2px; pointer-events: none; }
.playhead { position: absolute; top: 0; bottom: 0; width: 0; z-index: 5; pointer-events: none; border-left: 1px solid var(--accent); }
.ph-cap { position: absolute; top: 0; margin-left: -6px; z-index: 8; pointer-events: none; width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 9px solid var(--accent); }
.snap-guide { position: absolute; top: 24px; bottom: 0; width: 1px; background: #ffd24a; z-index: 5; pointer-events: none; }
.marquee { position: absolute; border: 1px solid var(--accent); background: rgba(45, 140, 235, 0.15); z-index: 7; pointer-events: none; }
.insert-line { position: absolute; left: 0; height: 2px; background: var(--accent); z-index: 10; pointer-events: none; }
</style>
