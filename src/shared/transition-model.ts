/**
 * Modelo de solapamiento de transiciones (specs/04 §Transiciones en la línea de tiempo).
 * Una transición de duración `d` entre A (sale) y B (entra) ocupa el último `d` de A superpuesto con el primer `d` de B.
 * Aquí solo hay funciones de consulta; las ediciones viven en timeline-ops.ts.
 */
import type { Clip, Project, Transition } from './project-schema'

const clipEnd = (c: Clip): number => c.start + (c.out - c.in) / (c.speed || 1)
const clipDur = (c: Clip): number => (c.out - c.in) / (c.speed || 1)
export const frameDur = (p: Project): number => p.settings.fps.den / p.settings.fps.num

export interface TransitionRange {
  start: number
  end: number
}

export function clipOf(p: Project, id: string | null): Clip | undefined {
  return id ? p.clips.find((c) => c.id === id) : undefined
}

/** Intervalo de la línea de tiempo que ocupa la transición, o null si sus clips ya no existen. */
export function transitionRange(p: Project, t: Transition): TransitionRange | null {
  const a = clipOf(p, t.leaveClipId)
  const b = clipOf(p, t.enterClipId)
  if (a && b) return { start: b.start, end: clipEnd(a) }
  if (a) return { start: clipEnd(a) - t.duration, end: clipEnd(a) }
  if (b) return { start: b.start, end: b.start + t.duration }
  return null
}

/** Transiciones que tocan a un clip (como saliente o entrante). */
export function transitionsOfClip(p: Project, clipId: string): Transition[] {
  return p.transitions.filter((t) => t.leaveClipId === clipId || t.enterClipId === clipId)
}

/** Tiempo del clip ocupado por sus transiciones (suma de duraciones): lo que no puede recortarse. */
export function transitionTimeOnClip(p: Project, clipId: string, ignoreId?: string): number {
  return transitionsOfClip(p, clipId)
    .filter((t) => t.id !== ignoreId)
    .reduce((a, t) => a + t.duration, 0)
}

/** Un borde está bloqueado si hay una transición entre dos clips en él (se cambia desde la transición). */
export function lockedEdges(p: Project, clipId: string): { start: boolean; end: boolean } {
  let start = false
  let end = false
  for (const t of p.transitions) {
    if (t.leaveClipId && t.enterClipId) {
      if (t.enterClipId === clipId) start = true
      if (t.leaveClipId === clipId) end = true
    }
  }
  return { start, end }
}

/** Duración mínima de un clip: un frame más el tiempo ocupado por sus transiciones. */
export function minClipDuration(p: Project, clip: Clip): number {
  return frameDur(p) + transitionTimeOnClip(p, clip.id)
}

/** Duración máxima de una transición entre A y B (o de un lado solo), dejando al menos un frame libre en cada clip. */
export function maxTransitionDuration(p: Project, leaveId: string | null, enterId: string | null, ignoreId?: string): number {
  const fd = frameDur(p)
  const a = clipOf(p, leaveId)
  const b = clipOf(p, enterId)
  const roomA = a ? clipDur(a) - transitionTimeOnClip(p, a.id, ignoreId) - fd : Infinity
  const roomB = b ? clipDur(b) - transitionTimeOnClip(p, b.id, ignoreId) - fd : Infinity
  return Math.min(roomA, roomB)
}

/** Transición activa (rango) en el instante `t` dentro de una pista de video, si la hay. */
export function transitionAt(p: Project, trackId: string, t: number): { tr: Transition; range: TransitionRange } | null {
  for (const tr of p.transitions) {
    if (tr.trackId !== trackId) continue
    const range = transitionRange(p, tr)
    if (range && t >= range.start - 1e-9 && t < range.end - 1e-9) return { tr, range }
  }
  return null
}

export interface TransitionTiming {
  frame: number
  totalFrames: number
  /** 0 en el primer frame del solape, 1 en el último (lineal; el suavizado lo aplica el autor) */
  progress: number
}

/** Frame y progreso de una transición en `t`: cuantizado al frame para que vista previa y exportación coincidan. */
export function transitionTiming(p: Project, range: TransitionRange, t: number): TransitionTiming {
  const fps = p.settings.fps.num / p.settings.fps.den
  const totalFrames = Math.max(1, Math.round((range.end - range.start) * fps))
  const frame = Math.min(totalFrames - 1, Math.max(0, Math.floor((t - range.start) * fps + 1e-6)))
  return { frame, totalFrames, progress: totalFrames > 1 ? frame / (totalFrames - 1) : 0 }
}

export type AudioMode = 'crossfade' | 'cut' | 'none'

/**
 * Factor de ganancia que aplican las transiciones al audio de un clip en `t`.
 * `modeOf` devuelve el modo por defecto (`meta.audio`) de una referencia de transición.
 */
export function transitionAudioFactor(p: Project, clipId: string, t: number, modeOf: (ref: string) => AudioMode | undefined): number {
  let g = 1
  for (const tr of transitionsOfClip(p, clipId)) {
    const range = transitionRange(p, tr)
    if (!range || t < range.start || t >= range.end) continue
    const mode = tr.audio ?? modeOf(tr.transitionRef) ?? 'crossfade'
    const x = Math.min(1, Math.max(0, (t - range.start) / (range.end - range.start || 1)))
    const leaving = tr.leaveClipId === clipId
    if (mode === 'crossfade') g *= leaving ? Math.cos((x * Math.PI) / 2) : Math.sin((x * Math.PI) / 2) // potencia constante
    else if (mode === 'cut') g *= leaving ? (x < 0.5 ? 1 : 0) : x < 0.5 ? 0 : 1
  }
  return g
}
