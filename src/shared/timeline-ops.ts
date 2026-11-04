/**
 * Operaciones puras sobre la línea de tiempo (specs/04). Mutan el `Project` recibido; la capa de
 * comandos del renderer toma una instantánea antes/después para deshacer/rehacer.
 * Tiempos en segundos; siempre se cuantizan al frame del proyecto cuando proviene del usuario.
 */
import type { Clip, MediaItem, Project, Track } from './project-schema'

export const EPS = 1e-6

/** Copia profunda segura con proxies reactivos de Vue (structuredClone los rechaza). */
export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
export type IdGen = (prefix: string) => string
export type PlaceMode = 'overwrite' | 'insert'

export const clipDuration = (c: Clip): number => (c.out - c.in) / (c.speed || 1)
export const clipEnd = (c: Clip): number => c.start + clipDuration(c)

export function frameDuration(p: Project): number {
  return p.settings.fps.den / p.settings.fps.num
}
export function quantize(p: Project, t: number): number {
  const fd = frameDuration(p)
  return Math.round(t / fd) * fd
}

export function trackClips(p: Project, trackId: string): Clip[] {
  return p.clips.filter((c) => c.trackId === trackId).sort((a, b) => a.start - b.start)
}

export function sequenceDuration(p: Project): number {
  return p.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0)
}

export function trackById(p: Project, id: string): Track | undefined {
  return p.tracks.find((t) => t.id === id)
}

/** Duración máxima utilizable de un medio (imágenes: ilimitada). */
export function mediaLimit(m: MediaItem | undefined): number {
  if (!m) return Infinity
  return m.kind === 'image' ? Infinity : (m.probe?.duration ?? Infinity)
}

/** ¿Puede un medio colocarse en una pista de este tipo? Video e imágenes → video; audio → audio. */
export function mediaFitsTrack(m: MediaItem, t: Track): boolean {
  return m.kind === 'audio' ? t.kind === 'audio' : t.kind === 'video'
}

export function makeClip(p: Project, m: MediaItem, trackId: string, start: number, id: string): Clip {
  const dur = m.kind === 'image' ? 5 : Math.max(m.probe?.duration ?? 0, frameDuration(p))
  return {
    id,
    mediaId: m.id,
    trackId,
    start,
    in: 0,
    out: dur,
    speed: 1,
    name: m.path.split('/').pop() ?? m.path,
    color: null,
    enabled: true,
    transform: {
      fit: 'fit', x: 0, y: 0, scaleX: 1, scaleY: 1, lockAspect: true, rotation: 0,
      flipH: false, flipV: false, anchorX: 0.5, anchorY: 0.5, opacity: 1,
      crop: { left: 0, top: 0, right: 0, bottom: 0 }
    },
    audio: { volume: 1, muted: false, fadeIn: 0, fadeOut: 0 },
    keyframes: {}
  }
}

function removeTransitionsOf(p: Project, clipIds: Set<string>): void {
  p.transitions = p.transitions.filter((x) => !clipIds.has(x.leaveClipId) && !clipIds.has(x.enterClipId))
}

/**
 * Libera el rango [s, e) en la pista (sobrescribir): recorta, divide o elimina los clips que lo ocupan.
 * `ignore` son clips que no cuentan (los que se están moviendo).
 */
export function clearRange(p: Project, trackId: string, s: number, e: number, newId: IdGen, ignore: Set<string> = new Set()): void {
  const removed = new Set<string>()
  const added: Clip[] = []
  for (const c of trackClips(p, trackId)) {
    if (ignore.has(c.id)) continue
    const cs = c.start
    const ce = clipEnd(c)
    if (ce <= s + EPS || cs >= e - EPS) continue
    if (cs >= s - EPS && ce <= e + EPS) {
      removed.add(c.id)
    } else if (cs < s - EPS && ce > e + EPS) {
      // El nuevo rango cae dentro del clip: se divide en dos.
      const right: Clip = clone(c)
      right.id = newId('c_')
      right.start = e
      right.in = c.in + (e - cs)
      c.out = c.in + (s - cs)
      added.push(right)
    } else if (cs < s - EPS) {
      c.out = c.in + (s - cs)
    } else {
      c.in += e - cs
      c.start = e
    }
  }
  if (removed.size) {
    p.clips = p.clips.filter((c) => !removed.has(c.id))
    removeTransitionsOf(p, removed)
  }
  p.clips.push(...added)
}

/** Corta el clip que contiene `t` (estrictamente) para poder insertar en ese punto. */
function splitAt(p: Project, trackId: string, t: number, newId: IdGen): void {
  const c = trackClips(p, trackId).find((x) => x.start < t - EPS && clipEnd(x) > t + EPS)
  if (c) splitClip(p, c.id, t, newId)
}

/** Coloca clips ya construidos en sus pistas. En modo insertar desplaza lo posterior. */
export function placeClips(p: Project, clips: Clip[], mode: PlaceMode, newId: IdGen): void {
  for (const clip of clips) {
    const dur = clipDuration(clip)
    if (mode === 'insert') {
      splitAt(p, clip.trackId, clip.start, newId)
      for (const c of p.clips) if (c.trackId === clip.trackId && c.start >= clip.start - EPS) c.start += dur
    } else {
      clearRange(p, clip.trackId, clip.start, clip.start + dur, newId)
    }
    p.clips.push(clip)
  }
}

export interface Move { id: string; start: number; trackId: string }

/** Mueve clips (grupo) a nuevas posiciones/pistas; los destinos se sobrescriben o desplazan. */
export function moveClips(p: Project, moves: Move[], mode: PlaceMode, newId: IdGen): void {
  const moving = moves
    .map((m) => ({ m, clip: p.clips.find((c) => c.id === m.id) }))
    .filter((x): x is { m: Move; clip: Clip } => Boolean(x.clip))
  const ids = new Set(moving.map((x) => x.clip.id))
  p.clips = p.clips.filter((c) => !ids.has(c.id))
  removeTransitionsOf(p, ids)
  const placed = moving.map(({ m, clip }) => ({ ...clip, start: Math.max(0, m.start), trackId: m.trackId }))
  // En overwrite todos los destinos se liberan antes de insertar para que el grupo no se pise a sí mismo.
  if (mode === 'overwrite') {
    for (const c of placed) clearRange(p, c.trackId, c.start, c.start + clipDuration(c), newId)
    p.clips.push(...placed)
  } else {
    placeClips(p, placed, 'insert', newId)
  }
}

/** Divide el clip en `t`. Devuelve el id del clip derecho o null si `t` está en un borde. */
export function splitClip(p: Project, clipId: string, t: number, newId: IdGen): string | null {
  const c = p.clips.find((x) => x.id === clipId)
  if (!c) return null
  const fd = frameDuration(p)
  if (t <= c.start + fd / 2 || t >= clipEnd(c) - fd / 2) return null
  const right: Clip = clone(c)
  right.id = newId('c_')
  right.start = t
  right.in = c.in + (t - c.start)
  c.out = right.in
  right.audio.fadeIn = 0
  c.audio.fadeOut = 0
  p.clips.push(right)
  // Una transición que salía de `c` ahora sale del fragmento derecho.
  for (const x of p.transitions) if (x.leaveClipId === c.id) x.leaveClipId = right.id
  return right.id
}

/** Recorta un borde, limitado por vecinos, duración del medio y 1 frame mínimo. Devuelve el tiempo aplicado. */
export function trimClip(p: Project, clipId: string, edge: 'start' | 'end', time: number): number | null {
  const c = p.clips.find((x) => x.id === clipId)
  if (!c) return null
  const fd = frameDuration(p)
  const m = p.media.find((x) => x.id === c.mediaId)
  const limit = mediaLimit(m)
  const siblings = trackClips(p, c.trackId).filter((x) => x.id !== c.id)
  const prevEnd = siblings.filter((x) => clipEnd(x) <= c.start + EPS).reduce((a, x) => Math.max(a, clipEnd(x)), 0)
  const nextStart = siblings.filter((x) => x.start >= clipEnd(c) - EPS).reduce((a, x) => Math.min(a, x.start), Infinity)
  if (edge === 'start') {
    const min = Math.max(prevEnd, c.start - c.in)
    const max = clipEnd(c) - fd
    const s = Math.min(max, Math.max(min, time))
    c.in += s - c.start
    c.start = s
    return s
  }
  const max = Math.min(nextStart, c.start + (limit - c.in))
  const e = Math.max(c.start + fd, Math.min(max, time))
  c.out = c.in + (e - c.start)
  return e
}

/** Elimina clips; con `ripple` cierra los huecos en cada pista. */
export function deleteClips(p: Project, ids: string[], ripple: boolean): void {
  const set = new Set(ids)
  const doomed = p.clips.filter((c) => set.has(c.id))
  if (doomed.length === 0) return
  if (ripple) {
    const byTrack = new Map<string, Clip[]>()
    for (const c of doomed) byTrack.set(c.trackId, [...(byTrack.get(c.trackId) ?? []), c])
    for (const [trackId, list] of byTrack) {
      // De derecha a izquierda para que los desplazamientos no invaliden posiciones.
      for (const d of list.sort((a, b) => b.start - a.start)) {
        const dur = clipDuration(d)
        for (const c of p.clips) if (c.trackId === trackId && !set.has(c.id) && c.start >= d.start + EPS) c.start -= dur
      }
    }
  }
  p.clips = p.clips.filter((c) => !set.has(c.id))
  removeTransitionsOf(p, set)
}

/** Hueco de pista que contiene `t`, o null. */
export function gapAt(p: Project, trackId: string, t: number): { start: number; end: number } | null {
  const list = trackClips(p, trackId)
  let prevEnd = 0
  for (const c of list) {
    if (t >= prevEnd - EPS && t < c.start - EPS) return { start: prevEnd, end: c.start }
    prevEnd = Math.max(prevEnd, clipEnd(c))
  }
  return null
}

export function removeGap(p: Project, trackId: string, t: number): boolean {
  const gap = gapAt(p, trackId, t)
  if (!gap) return false
  const len = gap.end - gap.start
  for (const c of p.clips) if (c.trackId === trackId && c.start >= gap.end - EPS) c.start -= len
  return true
}

/** Q / W: recorta con ripple el inicio o el final de los clips que cruzan el cabezal. */
export function trimToPlayhead(p: Project, ids: string[], edge: 'start' | 'end', t: number): number {
  let n = 0
  for (const id of ids) {
    const c = p.clips.find((x) => x.id === id)
    if (!c || t <= c.start + EPS || t >= clipEnd(c) - EPS) continue
    const end = clipEnd(c)
    if (edge === 'start') {
      const cut = t - c.start
      c.in += cut
      for (const o of p.clips) if (o.trackId === c.trackId && o.id !== c.id && o.start >= end - EPS) o.start -= cut
    } else {
      c.out = c.in + (t - c.start)
      const cut = end - t
      for (const o of p.clips) if (o.trackId === c.trackId && o.id !== c.id && o.start >= end - EPS) o.start -= cut
    }
    n++
  }
  return n
}

export function setEnabled(p: Project, ids: string[], enabled: boolean): void {
  for (const c of p.clips) if (ids.includes(c.id)) c.enabled = enabled
}

// ───────── Imán ─────────

export function snapPoints(p: Project, exclude: Set<string>, playhead: number): number[] {
  const pts = new Set<number>([0, playhead])
  for (const m of p.markers) pts.add(m.time)
  for (const c of p.clips) {
    if (exclude.has(c.id)) continue
    pts.add(c.start)
    pts.add(clipEnd(c))
  }
  return [...pts]
}

export function snapTime(t: number, points: number[], threshold: number): { time: number; snapped: boolean } {
  let best = t
  let bestD = threshold
  for (const pt of points) {
    const d = Math.abs(pt - t)
    if (d <= bestD) {
      best = pt
      bestD = d
    }
  }
  return { time: best, snapped: bestD < threshold || best !== t }
}

// ───────── Pistas ─────────

function nextTrackName(p: Project, kind: Track['kind']): string {
  const prefix = kind === 'video' ? 'V' : 'A'
  let max = 0
  for (const t of p.tracks) {
    const m = new RegExp(`^${prefix}(\\d+)$`).exec(t.name)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `${prefix}${max + 1}`
}

/** Mantiene el orden: todas las de video arriba, todas las de audio abajo. */
function normalizeOrder(p: Project): void {
  p.tracks = [...p.tracks.filter((t) => t.kind === 'video'), ...p.tracks.filter((t) => t.kind === 'audio')]
}

export function addTrack(p: Project, kind: Track['kind'], refTrackId: string | null, where: 'above' | 'below', newId: IdGen): Track {
  const track: Track = {
    id: newId('t_'),
    kind,
    name: nextTrackName(p, kind),
    hidden: false,
    locked: false,
    height: kind === 'video' ? 64 : 48,
    volume: 1,
    muted: false,
    solo: false
  }
  const ref = refTrackId ? p.tracks.findIndex((t) => t.id === refTrackId) : -1
  const idx = ref < 0 ? p.tracks.length : where === 'above' ? ref : ref + 1
  p.tracks.splice(idx, 0, track)
  normalizeOrder(p)
  return track
}

export function deleteTrack(p: Project, trackId: string): void {
  const ids = new Set(p.clips.filter((c) => c.trackId === trackId).map((c) => c.id))
  p.clips = p.clips.filter((c) => !ids.has(c.id))
  removeTransitionsOf(p, ids)
  p.tracks = p.tracks.filter((t) => t.id !== trackId)
}

export function duplicateTrack(p: Project, trackId: string, newId: IdGen): Track | null {
  const src = trackById(p, trackId)
  if (!src) return null
  const copy = addTrack(p, src.kind, trackId, 'above', newId)
  Object.assign(copy, { volume: src.volume, height: src.height, color: src.color })
  for (const c of trackClips(p, trackId)) {
    const cc: Clip = clone(c)
    cc.id = newId('c_')
    cc.trackId = copy.id
    p.clips.push(cc)
  }
  return copy
}

/** Reordena dentro del grupo del mismo tipo. `index` es la posición final entre las pistas de ese tipo. */
export function moveTrack(p: Project, trackId: string, index: number): void {
  const t = trackById(p, trackId)
  if (!t) return
  const group = p.tracks.filter((x) => x.kind === t.kind && x.id !== trackId)
  group.splice(Math.max(0, Math.min(group.length, index)), 0, t)
  const other = p.tracks.filter((x) => x.kind !== t.kind)
  p.tracks = t.kind === 'video' ? [...group, ...other] : [...other, ...group]
}

/** Pista de audio libre (sin clips en [s,e)) para «Separar audio»; crea una si no hay. */
export function firstFreeAudioTrack(p: Project, s: number, e: number, newId: IdGen): Track {
  const free = p.tracks.find(
    (t) => t.kind === 'audio' && !t.locked && !p.clips.some((c) => c.trackId === t.id && c.start < e - EPS && clipEnd(c) > s + EPS)
  )
  if (free) return free
  const last = [...p.tracks].reverse().find((t) => t.kind === 'audio')
  return addTrack(p, 'audio', last?.id ?? null, 'below', newId)
}
