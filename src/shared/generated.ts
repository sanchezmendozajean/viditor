/**
 * Recursos generados (texto y formas). Las propiedades viven en `clip.generator`; el tamaño del lienzo en que se
 * dibujan se calcula aquí, de forma determinista, para que la vista previa, la caja de transformación y la
 * exportación coincidan sin medir texto.
 */
import type { Generator, MediaItem, ProjectSettings, RectGenerator, TextGenerator } from './project-schema'
import { DEFAULT_SHADOW, DEFAULT_STROKE } from './project-schema'

export type GeneratedKind = 'text' | 'shape'
export const isGeneratedKind = (k: MediaItem['kind'] | undefined): k is GeneratedKind => k === 'text' || k === 'shape'

/** Duración inicial (s) de un texto o forma recién insertado. */
export const GENERATED_DEFAULT_DURATION = 1

const MAX_SIDE = 8192

export interface FontChoice {
  /** Valor guardado en `fontFamily` */
  value: string
  label: string
  /** Empaquetada con la aplicación (idéntica en cualquier equipo) */
  bundled: boolean
}

export const FONT_CHOICES: FontChoice[] = [
  { value: 'Source Sans 3', label: 'Source Sans 3', bundled: true },
  { value: 'JetBrains Mono', label: 'JetBrains Mono', bundled: true },
  { value: 'sans-serif', label: 'Sans-serif del sistema', bundled: false },
  { value: 'serif', label: 'Serif del sistema', bundled: false },
  { value: 'monospace', label: 'Monoespaciada del sistema', bundled: false }
]

const GENERIC = new Set(['sans-serif', 'serif', 'monospace', 'cursive', 'fantasy'])

/** Valor CSS de `font-family` con respaldo. */
export function cssFamily(name: string): string {
  return GENERIC.has(name) ? name : `"${name.replace(/"/g, '')}", sans-serif`
}

/** Valor del atajo `font` de CSS/canvas para un tamaño dado. */
export function cssFont(g: TextGenerator, size = g.fontSize): string {
  return `${g.italic ? 'italic ' : ''}${g.bold ? 600 : 400} ${size}px ${cssFamily(g.fontFamily)}`
}

/** Margen alrededor del cuadro para que contorno y sombra no se recorten. */
export function effectPad(g: Generator): number {
  const strokeW = g.stroke.enabled ? g.stroke.width / 2 : 0
  const sh = g.shadow.enabled ? g.shadow.blur * 1.5 + Math.max(Math.abs(g.shadow.offsetX), Math.abs(g.shadow.offsetY)) : 0
  const pad = strokeW + sh
  return pad > 0 ? Math.ceil(pad) + 2 : 0 // sin efectos no hay margen: el lienzo es exactamente el contenido
}

/** Cuadro (sin margen) del contenido, en px del proyecto. */
export function contentSize(g: Generator): [number, number] {
  return g.type === 'text' ? [g.boxWidth, g.boxHeight] : [g.width, g.height]
}

/** Tamaño del lienzo de la capa (cuadro + margen), en px del proyecto. */
export function generatorSize(g: Generator): [number, number] {
  const pad = effectPad(g)
  const [w, h] = contentSize(g)
  return [Math.min(MAX_SIDE, Math.max(1, Math.round(w + 2 * pad))), Math.min(MAX_SIDE, Math.max(1, Math.round(h + 2 * pad)))]
}

type TextFitter = (g: TextGenerator) => { boxWidth: number; boxHeight: number }
let textFitter: TextFitter | null = null
/** El renderer registra aquí cómo medir el texto (necesita un canvas): así los clips nuevos nacen con la caja ajustada. */
export function setTextFitter(fn: TextFitter | null): void {
  textFitter = fn
}

export function defaultGenerator(kind: GeneratedKind, s: ProjectSettings): Generator {
  if (kind === 'text') {
    const fontSize = Math.max(12, Math.round(s.height * 0.1))
    const lineHeight = 1.2
    const g: TextGenerator = {
      type: 'text',
      text: 'Texto',
      fontFamily: 'Source Sans 3',
      fontSize,
      bold: false,
      italic: false,
      align: 'center',
      lineHeight,
      color: '#ffffff',
      stroke: { ...DEFAULT_STROKE },
      shadow: { ...DEFAULT_SHADOW },
      autoFit: false,
      boxWidth: Math.round(s.width * 0.6),
      boxHeight: Math.round(fontSize * lineHeight * 1.25)
    }
    if (textFitter) Object.assign(g, textFitter(g), { autoFit: true })
    return g
  }
  return {
    type: 'rectangle',
    width: Math.round(s.width * 0.3),
    height: Math.round(s.height * 0.2),
    fillEnabled: true,
    fill: '#4f8cff',
    radius: 0,
    stroke: { ...DEFAULT_STROKE },
    shadow: { ...DEFAULT_SHADOW }
  }
}

/** Nombre base de un recurso generado nuevo. */
export const generatedLabel = (kind: GeneratedKind): string => (kind === 'text' ? 'Texto' : 'Rectángulo')

/** Resumen corto para el nombre del clip: la primera línea del texto, o el nombre de la forma. */
export function generatorTitle(g: Generator): string {
  if (g.type === 'rectangle') return 'Rectángulo'
  const first = g.text.split('\n').find((l) => l.trim())?.trim() ?? ''
  return first ? (first.length > 28 ? `${first.slice(0, 27)}…` : first) : 'Texto'
}

export type { RectGenerator, TextGenerator }
