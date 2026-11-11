/**
 * Modelo de render por frame (specs/02 §Modelo de render, specs/04 §Transformaciones).
 * Funciones puras: la vista previa (WebGL2) y la exportación usan EXACTAMENTE las mismas.
 * Orden de aplicación: crop → ajuste (fit) → escala → volteo → rotación (sobre el anclaje) → traslación → opacidad.
 */
import type { Clip, Generator, MediaItem, Project, ProjectSettings, Track } from './project-schema'
import { contentSize, effectPad } from './generated'
import { resolveClip, valueAt } from './keyframes'
import { clipEnd } from './timeline-ops'
import { transitionAt, transitionAudioFactor, transitionTiming, type AudioMode } from './transition-model'

/** Matriz afín: x = a·u + c·v + e ; y = b·u + d·v + f, con (u,v) ∈ [0,1]² sobre el cuadro del clip. */
export type Matrix = [a: number, b: number, c: number, d: number, e: number, f: number]

export interface DrawOp {
  clipId: string
  mediaId: string
  kind: 'video' | 'image'
  /** Tiempo dentro del medio fuente (s) */
  sourceTime: number
  matrix: Matrix
  /** Rectángulo de textura [u0, v0, u1, v1] con crop y volteo ya aplicados (u0 > u1 = volteo horizontal) */
  uv: [number, number, number, number]
  opacity: number
  /** Solo texto/forma: lo que hay que dibujar en el lienzo de la capa (no hay archivo fuente) */
  generator?: Generator
}

/**
 * Transición activa en una pista: sus dos capas (ya con su transformación base) y lo necesario para pedir
 * la display list al worker. Vista previa y exportación comparten exactamente esta descripción.
 */
export interface TransitionOp {
  kind: 'transition'
  transitionId: string
  trackId: string
  ref: string
  params: Record<string, unknown>
  seed: number
  duration: number
  progress: number
  frame: number
  totalFrames: number
  leave: DrawOp | null
  enter: DrawOp | null
}

export type FrameOp = DrawOp | TransitionOp

export interface Frame {
  time: number
  width: number
  height: number
  background: string
  /** De atrás hacia delante */
  ops: FrameOp[]
}

/** Solo las capas de clip sueltas (sin las transiciones). */
export const drawOps = (f: Frame): DrawOp[] => f.ops.filter((o): o is DrawOp => o.kind !== 'transition')

const RAD = Math.PI / 180

/** Tamaño del fuente tal como se ve (el metadato de rotación intercambia ancho y alto). */
export function sourceSize(m: MediaItem | undefined, s: ProjectSettings, clip?: Clip): [number, number] {
  // Texto/forma: la caja es el contenido; el margen de contorno y sombra se dibuja hacia fuera (ver `drawOpFor`)
  if (clip?.generator) return contentSize(clip.generator)
  const w = m?.probe?.width ?? s.width
  const h = m?.probe?.height ?? s.height
  const rot = Math.abs(m?.probe?.rotation ?? 0) % 180
  return rot === 90 ? [h, w] : [w, h]
}

export interface Geometry {
  sw: number
  sh: number
  /** Tamaño tras el recorte */
  cw: number
  ch: number
  /** Escala del ajuste (fit) por eje */
  fx: number
  fy: number
  /** Tamaño final en píxeles del cuadro del proyecto, antes de rotar */
  bw: number
  bh: number
}

export function clipGeometry(s: ProjectSettings, clip: Clip, m: MediaItem | undefined): Geometry {
  const t = clip.transform
  const [sw, sh] = sourceSize(m, s, clip)
  const crop = clip.generator ? { left: 0, top: 0, right: 0, bottom: 0 } : t.crop // el recorte no aplica a texto/forma
  const cw = Math.max(1, sw - crop.left - crop.right)
  const ch = Math.max(1, sh - crop.top - crop.bottom)
  let fx = 1
  let fy = 1
  switch (t.fit) {
    case 'fit':
      fx = fy = Math.min(s.width / cw, s.height / ch)
      break
    case 'fill':
      fx = fy = Math.max(s.width / cw, s.height / ch)
      break
    case 'stretch':
      fx = s.width / cw
      fy = s.height / ch
      break
    case 'none':
      break
  }
  return { sw, sh, cw, ch, fx, fy, bw: cw * fx * t.scaleX, bh: ch * fy * t.scaleY }
}

/**
 * Compensa x/y para que el punto de anclaje no se mueva en pantalla cuando el cuadro del clip cambia de tamaño
 * (`bw × bh` antes de rotar). La posición guardada es el centro del cuadro: sin esto, cambiar el tamaño siempre
 * crece desde el centro aunque el anclaje esté en otro sitio. La rotación no influye (gira sobre el anclaje).
 */
export function keepAnchorOnResize(t: Clip['transform'], from: { bw: number; bh: number }, to: { bw: number; bh: number }): void {
  t.x += (t.anchorX - 0.5) * (from.bw - to.bw)
  t.y += (t.anchorY - 0.5) * (from.bh - to.bh)
}

/** Posición de la esquina/centro (u,v) del cuadro del clip en píxeles del proyecto. */
export function applyMatrix(m: Matrix, u: number, v: number): [number, number] {
  return [m[0] * u + m[2] * v + m[4], m[1] * u + m[3] * v + m[5]]
}

export function clipMatrix(s: ProjectSettings, clip: Clip, g: Geometry): Matrix {
  const t = clip.transform
  const th = t.rotation * RAD
  const cos = Math.cos(th)
  const sin = Math.sin(th)
  // Centro del cuadro antes de rotar y pivote (anclaje) en coordenadas del proyecto.
  const cx = s.width / 2 + t.x
  const cy = s.height / 2 + t.y
  const px = cx + (t.anchorX - 0.5) * g.bw
  const py = cy + (t.anchorY - 0.5) * g.bh
  const a = cos * g.bw
  const b = sin * g.bw
  const c = -sin * g.bh
  const d = cos * g.bh
  return [a, b, c, d, px - a * t.anchorX - c * t.anchorY, py - b * t.anchorX - d * t.anchorY]
}

/** Centro actual del cuadro del clip, tras rotar alrededor del anclaje. */
export function worldCenter(m: Matrix): [number, number] {
  return applyMatrix(m, 0.5, 0.5)
}

/**
 * Devuelve la posición (x, y) que deja el centro del cuadro en `center` para un tamaño, ángulo y
 * anclaje dados. Se usa al escalar o mover el anclaje desde el monitor para que la imagen no salte.
 */
export function solvePosition(
  s: ProjectSettings,
  center: [number, number],
  size: { bw: number; bh: number },
  rotation: number,
  anchor: { x: number; y: number }
): { x: number; y: number } {
  const th = rotation * RAD
  const cos = Math.cos(th)
  const sin = Math.sin(th)
  const ox = (0.5 - anchor.x) * size.bw
  const oy = (0.5 - anchor.y) * size.bh
  const rx = cos * ox - sin * oy
  const ry = sin * ox + cos * oy
  // centroMundo = C + (anchor-0.5)·size + R·((0.5-anchor)·size)
  const cx = center[0] - (-ox) - rx
  const cy = center[1] - (-oy) - ry
  return { x: cx - s.width / 2, y: cy - s.height / 2 }
}

export function activeClipsAt(p: Project, t: number): { clip: Clip; track: Track }[] {
  const out: { clip: Clip; track: Track }[] = []
  for (const track of p.tracks) {
    for (const clip of p.clips) {
      if (clip.trackId === track.id && clip.enabled && t >= clip.start - 1e-9 && t < clipEnd(clip) - 1e-9) out.push({ clip, track })
    }
  }
  return out
}

function drawOpFor(p: Project, source: Clip, media: MediaItem, t: number): DrawOp {
  const clip = resolveClip(source, t)
  const g = clipGeometry(p.settings, clip, media)
  const c = clip.generator ? { left: 0, top: 0, right: 0, bottom: 0 } : clip.transform.crop
  const u0 = c.left / g.sw
  const v0 = c.top / g.sh
  const u1 = 1 - c.right / g.sw
  const v1 = 1 - c.bottom / g.sh
  let matrix = clipMatrix(p.settings, clip, g)
  if (clip.generator) {
    // El lienzo de un texto/forma lleva un margen para contorno y sombra: se dibuja ampliando el cuadro hacia fuera
    // (la caja de selección y las medidas siguen siendo las del contenido).
    const pad = effectPad(clip.generator)
    const ex = pad / g.cw
    const ey = pad / g.ch
    const [a, b, c2, d, e, f] = matrix
    matrix = [a * (1 + 2 * ex), b * (1 + 2 * ex), c2 * (1 + 2 * ey), d * (1 + 2 * ey), e - ex * a - ey * c2, f - ex * b - ey * d]
  }
  return {
    clipId: clip.id,
    mediaId: media.id,
    kind: media.kind === 'video' ? 'video' : 'image',
    sourceTime: clip.in + (t - clip.start) * clip.speed,
    generator: clip.generator,
    matrix,
    uv: [clip.transform.flipH ? u1 : u0, clip.transform.flipV ? v1 : v0, clip.transform.flipH ? u0 : u1, clip.transform.flipV ? v0 : v1],
    opacity: clip.transform.opacity * clipFadeAt(clip, t)
  }
}

/** Factor de alfa del desvanecimiento visual del clip en `t` (1 sin desvanecimiento). Independiente de la opacidad. */
export function clipFadeAt(clip: Clip, t: number): number {
  const fin = clip.fade?.in ?? 0
  const fout = clip.fade?.out ?? 0
  if (fin <= 0 && fout <= 0) return 1
  const local = t - clip.start
  const toEnd = clipEnd(clip) - t
  let f = 1
  if (fin > 0 && local < fin) f *= Math.min(1, Math.max(0, local / fin))
  if (fout > 0 && toEnd < fout) f *= Math.min(1, Math.max(0, toEnd / fout))
  return f
}

/** Frame de vídeo en el tiempo `t`: capas de abajo (fondo) hacia arriba (frente). */
export function buildFrame(p: Project, t: number): Frame {
  const ops: FrameOp[] = []
  const mediaById = new Map(p.media.map((m) => [m.id, m]))
  const visual = (clip: Clip | undefined): { clip: Clip; media: MediaItem } | null => {
    if (!clip || !clip.enabled) return null
    const media = mediaById.get(clip.mediaId)
    return media && media.kind !== 'audio' ? { clip, media } : null
  }
  // p.tracks va de arriba a abajo; el vídeo se compone del fondo al frente.
  for (const track of [...p.tracks].reverse()) {
    if (track.kind !== 'video' || track.hidden) continue
    const active = transitionAt(p, track.id, t)
    const inTransition = new Set<string>()
    if (active) {
      const { tr, range } = active
      const a = visual(p.clips.find((c) => c.id === tr.leaveClipId))
      const b = visual(p.clips.find((c) => c.id === tr.enterClipId))
      if (tr.leaveClipId) inTransition.add(tr.leaveClipId)
      if (tr.enterClipId) inTransition.add(tr.enterClipId)
      const timing = transitionTiming(p, range, t)
      ops.push({
        kind: 'transition',
        transitionId: tr.id,
        trackId: track.id,
        ref: tr.transitionRef,
        params: tr.params,
        seed: tr.seed,
        duration: tr.duration,
        progress: timing.progress,
        frame: timing.frame,
        totalFrames: timing.totalFrames,
        leave: a ? drawOpFor(p, a.clip, a.media, t) : null,
        enter: b ? drawOpFor(p, b.clip, b.media, t) : null
      })
    }
    for (const clip of p.clips) {
      if (clip.trackId !== track.id || inTransition.has(clip.id)) continue
      if (t < clip.start - 1e-9 || t >= clipEnd(clip) - 1e-9) continue
      const v = visual(clip)
      if (v) ops.push(drawOpFor(p, v.clip, v.media, t))
    }
  }
  return { time: t, width: p.settings.width, height: p.settings.height, background: p.settings.background, ops }
}

// ───────── Audio ─────────

export const dbToGain = (db: number): number => (db <= -100 ? 0 : Math.pow(10, db / 20))
export const gainToDb = (g: number): number => (g <= 1e-5 ? -Infinity : 20 * Math.log10(g))

/** Ganancia propia del clip en `t`: volumen × fundido de entrada × fundido de salida (0 si está silenciado). */
export function clipGainAt(clip: Clip, t: number): number {
  if (clip.audio.muted || !clip.enabled) return 0
  const dur = clipEnd(clip) - clip.start
  const local = t - clip.start
  let g = valueAt(clip, 'volume', t)
  if (clip.audio.fadeIn > 0 && local < clip.audio.fadeIn) g *= Math.max(0, local / clip.audio.fadeIn)
  const toEnd = dur - local
  if (clip.audio.fadeOut > 0 && toEnd < clip.audio.fadeOut) g *= Math.max(0, toEnd / clip.audio.fadeOut)
  return g
}

/** Ganancia de pista considerando silencio y solo (si alguna pista está en solo, solo suenan esas). */
export function trackGain(p: Project, track: Track): number {
  if (track.muted) return 0
  const anySolo = p.tracks.some((x) => x.solo)
  if (anySolo && !track.solo) return 0
  return track.volume
}

/** clip × pista × master (specs/04 §Volumen). */
export function finalGain(p: Project, clip: Clip, track: Track, t: number): number {
  return clipGainAt(clip, t) * trackGain(p, track) * p.settings.masterVolume
}

/** Ganancia del clip incluyendo fundidos y el efecto de las transiciones sobre el audio (crossfade / corte / ninguno). */
export function clipGainWithTransitions(p: Project, clip: Clip, t: number, modeOf: (ref: string) => AudioMode | undefined): number {
  return clipGainAt(clip, t) * transitionAudioFactor(p, clip.id, t, modeOf)
}
