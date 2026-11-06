/**
 * Fotogramas clave de transformación y volumen (specs/04 §Fotogramas clave).
 * Funciones puras compartidas por vista previa, exportación e inspector.
 * El tiempo `t` de cada fotograma está en segundos del medio fuente (ver `keyframeSchema`).
 */
import type { Clip, Keyframe } from './project-schema'

export type KeyProp = 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation' | 'opacity' | 'volume'

export const KEY_PROPS: readonly KeyProp[] = ['x', 'y', 'scaleX', 'scaleY', 'rotation', 'opacity', 'volume']

/** Dos fotogramas a menos de este margen (s) se consideran el mismo instante. */
export const KEY_EPS = 1e-4

export function getProp(clip: Clip, prop: KeyProp): number {
  return prop === 'volume' ? clip.audio.volume : clip.transform[prop]
}

export function setProp(clip: Clip, prop: KeyProp, value: number): void {
  if (prop === 'volume') clip.audio.volume = value
  else clip.transform[prop] = value
}

/** Tiempo de fuente que corresponde al instante `t` de la línea de tiempo (acotado al clip). */
export function sourceTimeAt(clip: Clip, t: number): number {
  const s = clip.in + (t - clip.start) * clip.speed
  return Math.min(clip.out, Math.max(clip.in, s))
}

/** Valor interpolado de una lista ordenada de fotogramas en el tiempo de fuente `s`. */
export function evalKeys(keys: readonly Keyframe[], s: number): number {
  const first = keys[0]
  if (!first) return NaN
  if (s <= first.t) return first.v
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i] as Keyframe
    if (s <= b.t) {
      const a = keys[i - 1] as Keyframe
      if (a.ease === 'hold' || b.t - a.t < 1e-9) return a.v
      let k = (s - a.t) / (b.t - a.t)
      if (a.ease === 'smooth') k = k * k * (3 - 2 * k)
      return a.v + (b.v - a.v) * k
    }
  }
  return (keys[keys.length - 1] as Keyframe).v
}

export function isAnimated(clip: Clip, prop: KeyProp): boolean {
  return (clip.keyframes[prop]?.length ?? 0) > 0
}

export function hasKeyframes(clip: Clip): boolean {
  return KEY_PROPS.some((p) => isAnimated(clip, p))
}

/** Valor de la propiedad en el tiempo de fuente `s` (el estático si no está animada). */
export function valueAtSource(clip: Clip, prop: KeyProp, s: number): number {
  const keys = clip.keyframes[prop]
  return keys && keys.length > 0 ? evalKeys(keys, s) : getProp(clip, prop)
}

/** Valor de la propiedad en el instante `t` de la línea de tiempo. */
export function valueAt(clip: Clip, prop: KeyProp, t: number): number {
  return valueAtSource(clip, prop, sourceTimeAt(clip, t))
}

/** Copia del clip con todas las propiedades animadas evaluadas en `t` (sin tocar el original). */
export function resolveClip(clip: Clip, t: number): Clip {
  if (!hasKeyframes(clip)) return clip
  const s = sourceTimeAt(clip, t)
  const out: Clip = { ...clip, transform: { ...clip.transform }, audio: { ...clip.audio } }
  for (const p of KEY_PROPS) if (isAnimated(clip, p)) setProp(out, p, valueAtSource(clip, p, s))
  return out
}

/** Inserta o reemplaza el fotograma de `prop` en el tiempo de fuente `s`, manteniendo el orden. */
export function upsertKey(clip: Clip, prop: KeyProp, s: number, v: number, ease?: Keyframe['ease']): void {
  const list = (clip.keyframes[prop] ??= [])
  const i = list.findIndex((k) => Math.abs(k.t - s) < KEY_EPS)
  if (i >= 0) {
    const cur = list[i] as Keyframe
    list[i] = { t: cur.t, v, ease: ease ?? cur.ease }
  } else {
    list.push({ t: s, v, ease: ease ?? 'linear' })
    list.sort((a, b) => a.t - b.t)
  }
}

export function keyAt(clip: Clip, prop: KeyProp, s: number): Keyframe | undefined {
  return clip.keyframes[prop]?.find((k) => Math.abs(k.t - s) < KEY_EPS)
}

/** Quita el fotograma de `s`. Si era el último, la propiedad deja de estar animada y conserva su valor. */
export function removeKey(clip: Clip, prop: KeyProp, s: number): void {
  const list = clip.keyframes[prop]
  if (!list) return
  const i = list.findIndex((k) => Math.abs(k.t - s) < KEY_EPS)
  if (i < 0) return
  const [gone] = list.splice(i, 1)
  if (list.length === 0) {
    delete clip.keyframes[prop]
    if (gone) setProp(clip, prop, gone.v)
  }
}

/** Quita toda la animación de las propiedades dadas; conservan el valor que tenían en `s`. */
export function clearKeys(clip: Clip, props: readonly KeyProp[], s: number): void {
  for (const p of props) {
    if (!isAnimated(clip, p)) continue
    setProp(clip, p, valueAtSource(clip, p, s))
    delete clip.keyframes[p]
  }
}

/** Tiempos de fuente (únicos, ordenados) de los fotogramas de las propiedades dadas. */
export function keyTimes(clip: Clip, props: readonly KeyProp[] = KEY_PROPS): number[] {
  const out: number[] = []
  for (const p of props) for (const k of clip.keyframes[p] ?? []) if (!out.some((x) => Math.abs(x - k.t) < KEY_EPS)) out.push(k.t)
  return out.sort((a, b) => a - b)
}

/** Instante de la línea de tiempo de un tiempo de fuente. */
export const timelineTimeOf = (clip: Clip, s: number): number => clip.start + (s - clip.in) / clip.speed

/**
 * Edición con animación: aplica `fn` al clip viendo los valores del instante `t`; lo que cambie en una propiedad
 * animada se guarda como fotograma en `t` y lo demás queda como valor estático.
 */
export function editAnimated(clip: Clip, t: number, fn: (c: Clip) => void): void {
  const s = sourceTimeAt(clip, t)
  const animated = KEY_PROPS.filter((p) => isAnimated(clip, p))
  const before = new Map<KeyProp, number>()
  for (const p of animated) {
    const v = valueAtSource(clip, p, s)
    before.set(p, v)
    setProp(clip, p, v)
  }
  fn(clip)
  for (const p of animated) {
    if (!isAnimated(clip, p)) continue // la edición pudo quitar la animación (restablecer)
    const v = getProp(clip, p)
    if (Math.abs(v - (before.get(p) as number)) > 1e-9) upsertKey(clip, p, s, v)
  }
}
