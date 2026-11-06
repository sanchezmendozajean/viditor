/**
 * Modelo de render por frame (specs/02 §Modelo de render, specs/04 §Transformaciones).
 * Funciones puras: la vista previa (WebGL2) y la exportación usan EXACTAMENTE las mismas.
 * Orden de aplicación: crop → ajuste (fit) → escala → volteo → rotación (sobre el anclaje) → traslación → opacidad.
 */
import type { Clip, MediaItem, Project, ProjectSettings, Track } from './project-schema'
import { clipEnd } from './timeline-ops'

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
}

export interface Frame {
  time: number
  width: number
  height: number
  background: string
  ops: DrawOp[]
}

const RAD = Math.PI / 180

/** Tamaño del fuente tal como se ve (el metadato de rotación intercambia ancho y alto). */
export function sourceSize(m: MediaItem | undefined, s: ProjectSettings): [number, number] {
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
  const [sw, sh] = sourceSize(m, s)
  const cw = Math.max(1, sw - t.crop.left - t.crop.right)
  const ch = Math.max(1, sh - t.crop.top - t.crop.bottom)
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

/** Frame de vídeo en el tiempo `t`: capas de abajo (fondo) hacia arriba (frente). */
export function buildFrame(p: Project, t: number): Frame {
  const s = p.settings
  const ops: DrawOp[] = []
  const mediaById = new Map(p.media.map((m) => [m.id, m]))
  // p.tracks va de arriba a abajo; el vídeo se compone del fondo al frente.
  for (const track of [...p.tracks].reverse()) {
    if (track.kind !== 'video' || track.hidden) continue
    for (const clip of p.clips) {
      if (clip.trackId !== track.id || !clip.enabled) continue
      if (t < clip.start - 1e-9 || t >= clipEnd(clip) - 1e-9) continue
      const media = mediaById.get(clip.mediaId)
      if (!media || media.kind === 'audio') continue
      const g = clipGeometry(s, clip, media)
      const c = clip.transform.crop
      const u0 = c.left / g.sw
      const v0 = c.top / g.sh
      const u1 = 1 - c.right / g.sw
      const v1 = 1 - c.bottom / g.sh
      ops.push({
        clipId: clip.id,
        mediaId: media.id,
        kind: media.kind === 'image' ? 'image' : 'video',
        sourceTime: clip.in + (t - clip.start) * clip.speed,
        matrix: clipMatrix(s, clip, g),
        uv: [clip.transform.flipH ? u1 : u0, clip.transform.flipV ? v1 : v0, clip.transform.flipH ? u0 : u1, clip.transform.flipV ? v0 : v1],
        opacity: clip.transform.opacity
      })
    }
  }
  return { time: t, width: s.width, height: s.height, background: s.background, ops }
}

// ───────── Audio ─────────

export const dbToGain = (db: number): number => (db <= -100 ? 0 : Math.pow(10, db / 20))
export const gainToDb = (g: number): number => (g <= 1e-5 ? -Infinity : 20 * Math.log10(g))

/** Ganancia propia del clip en `t`: volumen × fundido de entrada × fundido de salida (0 si está silenciado). */
export function clipGainAt(clip: Clip, t: number): number {
  if (clip.audio.muted || !clip.enabled) return 0
  const dur = clipEnd(clip) - clip.start
  const local = t - clip.start
  let g = clip.audio.volume
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
