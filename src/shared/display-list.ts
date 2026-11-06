/**
 * Display list: lo que una transición devuelve por frame (specs/05 §Implementación).
 * Es JSON serializable: se calcula en un Web Worker y la misma lista se dibuja en la vista previa y en la exportación.
 */

/** Matriz afín [a, b, c, d, e, f]: x' = a·x + c·y + e ; y' = b·x + d·y + f (px del proyecto). */
export type Mat = [a: number, b: number, c: number, d: number, e: number, f: number]

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Color RGBA con r, g, b en 0–255 y a en 0–1. */
export interface RGBA {
  r: number
  g: number
  b: number
  a: number
}

/** Filtros combinados de un elemento (cada tipo aparece una sola vez). 1 = sin cambio salvo donde se indica. */
export interface Filters {
  brightness?: number
  contrast?: number
  saturation?: number
  /** 0–1 */
  grayscale?: number
  invert?: number
  sepia?: number
  tint?: { color: RGBA; amount: number }
  /** Radio en px del proyecto */
  blur?: number
  /** Tamaño del bloque en px del proyecto */
  pixelate?: number
}

export type Geometry =
  | { type: 'rect'; x: number; y: number; w: number; h: number; radius?: number }
  | { type: 'circle'; cx: number; cy: number; r: number }
  | { type: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'polygon'; points: [number, number][] }
  | { type: 'path'; d: string }
  | { type: 'star'; cx: number; cy: number; points: number; rOuter: number; rInner: number }
  | { type: 'text'; str: string; x: number; y: number; font: string; size: number; weight: string; align: 'left' | 'center' | 'right' }
  | { type: 'fill' }

export interface GradientDef {
  type: 'linear' | 'radial'
  stops: [number, string][]
  from?: [number, number]
  to?: [number, number]
}

export interface ShapeStyleDef {
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
  gradient?: GradientDef
}

export interface LayerItem {
  kind: 'layer'
  source: 'leave' | 'enter'
  /** Rectángulo de la capa que se dibuja (partes); sin él, toda la pantalla */
  rect?: Rect
  /** Transformación de la pieza en px del proyecto (actúa sobre las coordenadas originales del rect) */
  matrix: Mat
  opacity: number
  filters: Filters
  /** id de una entrada de `masks` */
  mask?: string
  z: number
}

export interface ShapeItem {
  kind: 'shape'
  geometry: Geometry
  style: ShapeStyleDef
  matrix: Mat
  opacity: number
  z: number
}

export interface MaskItem {
  id: string
  geometry: Geometry
  style: ShapeStyleDef
  matrix: Mat
  invert: boolean
  /** Suavizado del borde en px */
  feather: number
}

export type DisplayItem = LayerItem | ShapeItem

export interface DisplayList {
  frame: number
  /** Ordenados de atrás hacia delante (z ascendente, estable) */
  items: DisplayItem[]
  masks: MaskItem[]
}

export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0]
