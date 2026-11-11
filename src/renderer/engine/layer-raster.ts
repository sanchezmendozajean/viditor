/**
 * Rasteriza texto y formas en un canvas 2D. Es la «fuente de imagen» de los clips generados: la vista previa y la
 * exportación la entregan al MISMO compositor WebGL que a un fotograma de vídeo o una imagen.
 * El tamaño del lienzo sale de `generatorSize` (compartido), así la caja de transformación coincide con lo dibujado.
 */
import { cssFont, effectPad, generatorSize, setTextFitter } from '@shared/generated'
import type { Generator, Project, RectGenerator, TextGenerator } from '@shared/project-schema'

const MAX_CACHED = 48
const cache = new Map<string, HTMLCanvasElement>()
let onFontLoaded: (() => void) | null = null

/** El motor se suscribe para redibujar cuando termina de cargar una fuente empaquetada. */
export function setFontLoadedHandler(fn: (() => void) | null): void {
  onFontLoaded = fn
}

/** ¿La fuente del texto ya está cargada? Si no, inicia la carga y avisará al terminar. */
function fontReady(g: TextGenerator): boolean {
  const font = cssFont(g, 16)
  const sample = g.text || 'A'
  if (document.fonts.check(font, sample)) return true
  void document.fonts.load(font, sample).then(() => onFontLoaded?.())
  return false
}

/** Carga las fuentes de todos los textos del proyecto (la exportación las necesita listas antes del primer fotograma). */
export async function preloadFonts(p: Project): Promise<void> {
  const loads: Promise<unknown>[] = []
  for (const c of p.clips) {
    const g = c.generator
    if (g?.type === 'text') loads.push(document.fonts.load(cssFont(g, 16), g.text || 'A'))
  }
  await Promise.all(loads)
}

const rgba = (hex: string, a: number): string => {
  const n = Number.parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    const words = para.split(' ')
    let line = ''
    for (const w of words) {
      const next = line ? `${line} ${w}` : w
      if (line && ctx.measureText(next).width > maxWidth) {
        out.push(line)
        line = w
      } else line = next
    }
    out.push(line)
  }
  return out
}

function applyShadow(ctx: CanvasRenderingContext2D, g: Generator, k: number): void {
  // Los parámetros de la sombra no se escalan con la transformación del contexto
  ctx.shadowColor = rgba(g.shadow.color, g.shadow.opacity)
  ctx.shadowBlur = g.shadow.blur * k
  ctx.shadowOffsetX = g.shadow.offsetX * k
  ctx.shadowOffsetY = g.shadow.offsetY * k
}
function clearShadow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowColor = 'rgba(0,0,0,0)'
  ctx.shadowBlur = 0
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
}

/**
 * Límites de la tinta (píxeles realmente pintados) del texto sin ajuste de línea automático, en un sistema cuyo origen
 * es el punto de alineación de la primera línea. Cada línea ocupa `lh` de alto y su centro está en `i·lh + lh/2`.
 */
function inkBounds(ctx: CanvasRenderingContext2D, g: TextGenerator): { lines: string[]; lh: number; x0: number; y0: number; x1: number; y1: number } {
  ctx.font = cssFont(g)
  ctx.textBaseline = 'middle'
  ctx.textAlign = g.align
  const lines = g.text.split('\n')
  const lh = g.fontSize * g.lineHeight
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  lines.forEach((l, i) => {
    if (!l.trim()) return
    const m = ctx.measureText(l)
    const y = i * lh + lh / 2
    x0 = Math.min(x0, -m.actualBoundingBoxLeft)
    x1 = Math.max(x1, m.actualBoundingBoxRight)
    y0 = Math.min(y0, y - m.actualBoundingBoxAscent)
    y1 = Math.max(y1, y + m.actualBoundingBoxDescent)
  })
  if (!Number.isFinite(x0)) [x0, x1, y0, y1] = [0, g.fontSize * 0.5, 0, lh] // texto vacío: una caja pequeña
  return { lines, lh, x0: x0 - 1, y0: y0 - 1, x1: x1 + 1, y1: y1 + 1 } // 1 px de holgura para el suavizado
}

function drawText(ctx: CanvasRenderingContext2D, g: TextGenerator, k: number): void {
  const pad = effectPad(g)
  ctx.font = cssFont(g)
  ctx.textBaseline = 'middle'
  ctx.textAlign = g.align
  ctx.lineJoin = 'round'
  let lines: string[]
  let lh = g.fontSize * g.lineHeight
  let x: number
  let top: number
  if (g.autoFit) {
    // Caja = tinta: la esquina superior izquierda de lo pintado cae justo en (pad, pad)
    const ink = inkBounds(ctx, g)
    lines = ink.lines
    lh = ink.lh
    x = pad - ink.x0
    top = pad - ink.y0
  } else {
    lines = wrapLines(ctx, g.text, g.boxWidth)
    top = pad + (g.boxHeight - lines.length * lh) / 2
    x = g.align === 'left' ? pad : g.align === 'right' ? pad + g.boxWidth : pad + g.boxWidth / 2
  }
  const each = (paint: (line: string, y: number) => void): void => lines.forEach((line, i) => paint(line, top + i * lh + lh / 2))
  if (g.stroke.enabled && g.stroke.width > 0) {
    if (g.shadow.enabled) applyShadow(ctx, g, k)
    ctx.lineWidth = g.stroke.width
    ctx.strokeStyle = g.stroke.color
    each((line, y) => ctx.strokeText(line, x, y))
    clearShadow(ctx)
    ctx.fillStyle = g.color
    each((line, y) => ctx.fillText(line, x, y))
  } else {
    if (g.shadow.enabled) applyShadow(ctx, g, k)
    ctx.fillStyle = g.color
    each((line, y) => ctx.fillText(line, x, y))
  }
}

function drawRect(ctx: CanvasRenderingContext2D, g: RectGenerator, k: number): void {
  const pad = effectPad(g)
  const r = Math.min(g.radius, g.width / 2, g.height / 2)
  ctx.beginPath()
  if (r > 0) ctx.roundRect(pad, pad, g.width, g.height, r)
  else ctx.rect(pad, pad, g.width, g.height)
  const stroked = g.stroke.enabled && g.stroke.width > 0
  let shadowUsed = false
  if (g.fillEnabled) {
    if (g.shadow.enabled) {
      applyShadow(ctx, g, k)
      shadowUsed = true
    }
    ctx.fillStyle = g.fill
    ctx.fill()
    clearShadow(ctx)
  }
  if (stroked) {
    if (g.shadow.enabled && !shadowUsed) applyShadow(ctx, g, k)
    ctx.lineJoin = 'round'
    ctx.lineWidth = g.stroke.width
    ctx.strokeStyle = g.stroke.color
    ctx.stroke()
    clearShadow(ctx)
  }
}

/**
 * Canvas con el texto o la forma. `scale` > 1 dibuja con más resolución (exportaciones por encima del tamaño del proyecto);
 * el compositor lo escala al tamaño que necesite.
 */
export function rasterize(g: Generator, scale = 1): HTMLCanvasElement {
  const ready = g.type === 'text' ? fontReady(g) : true
  const key = `${scale}|${JSON.stringify(g)}`
  const hit = ready ? cache.get(key) : undefined
  if (hit) {
    cache.delete(key) // se reinserta: LRU
    cache.set(key, hit)
    return hit
  }
  const [w, h] = generatorSize(g)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(w * scale))
  canvas.height = Math.max(1, Math.ceil(h * scale))
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const kx = canvas.width / w
    const ky = canvas.height / h
    ctx.setTransform(kx, 0, 0, ky, 0, 0)
    if (g.type === 'text') drawText(ctx, g, kx)
    else drawRect(ctx, g, kx)
  }
  if (ready) {
    cache.set(key, canvas)
    while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value as string)
  }
  return canvas
}

let measureCtx: CanvasRenderingContext2D | null = null

/** Cuadro que rodea exactamente los píxeles visibles del texto (sin ajuste de línea automático). */
export function fitTextBox(g: TextGenerator): { boxWidth: number; boxHeight: number } {
  measureCtx ??= document.createElement('canvas').getContext('2d')
  if (!measureCtx) return { boxWidth: g.boxWidth, boxHeight: g.boxHeight }
  const ink = inkBounds(measureCtx, g)
  return { boxWidth: Math.max(1, Math.ceil(ink.x1 - ink.x0)), boxHeight: Math.max(1, Math.ceil(ink.y1 - ink.y0)) }
}

setTextFitter(fitTextBox) // los clips de texto nuevos (cualquier vía) nacen con la caja ajustada
