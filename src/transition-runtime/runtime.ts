/**
 * Runtime de la API de transiciones (apiVersion 1). La API NO dibuja: sus métodos solo registran el estado de cada
 * capa, parte y figura; al terminar `render` se serializa una display list (specs/05 §Implementación).
 * Este módulo es JavaScript puro (sin DOM ni Node) para poder ejecutarse en un Web Worker y en las pruebas.
 */
import { parse as acornParse } from 'acorn'
import type { DisplayItem, DisplayList, Filters, Geometry, GradientDef, Mat, MaskItem, Rect, ShapeStyleDef } from '../shared/display-list'
import { createEase, EASING_NAMES, type EasingName } from './easing'
import { hslToRgb, mixColors, parseColor, toCss } from './colors'
import { geometryBounds } from './geometry'

export const MAX_PARTS = 4096
export const MAX_SHAPES = 10000

export class TransitionError extends Error {
  constructor(
    message: string,
    public line?: number,
    public col?: number,
    public phase?: 'load' | 'init' | 'render'
  ) {
    super(message)
    this.name = 'TransitionError'
  }
}

// ───────── Metadatos ─────────

export type ParamDef =
  | { type: 'number' | 'int'; label?: string; default: number; min?: number; max?: number; step?: number }
  | { type: 'boolean'; label?: string; default: boolean }
  | { type: 'color'; label?: string; default: string }
  | { type: 'enum'; label?: string; options: string[]; default: string }
  | { type: 'easing'; label?: string; default: EasingName }
  | { type: 'angle'; label?: string; default: number }
  | { type: 'point'; label?: string; default: [number, number] }

export interface TransitionMeta {
  apiVersion: 1
  id: string
  name: string
  category: string
  author?: string
  description?: string
  defaultDuration: number
  audio: 'crossfade' | 'cut' | 'none'
  params: Record<string, ParamDef>
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function normalizeMeta(raw: unknown): TransitionMeta {
  if (!isObj(raw)) throw new TransitionError('Falta la constante "meta" con los metadatos de la transición.', undefined, undefined, 'load')
  const fail = (m: string): never => {
    throw new TransitionError(`meta inválido: ${m}`, undefined, undefined, 'load')
  }
  if (raw.apiVersion !== 1) fail('apiVersion debe ser 1.')
  if (typeof raw.id !== 'string' || !/^[a-z0-9-]+$/.test(raw.id)) fail('id es obligatorio y solo admite a-z, 0-9 y guiones.')
  if (typeof raw.name !== 'string' || !raw.name.trim()) fail('name es obligatorio.')
  const dd = raw.defaultDuration === undefined ? 1 : Number(raw.defaultDuration)
  if (!Number.isFinite(dd) || dd <= 0) fail('defaultDuration debe ser un número mayor que 0.')
  const audio = raw.audio === undefined ? 'crossfade' : raw.audio
  if (audio !== 'crossfade' && audio !== 'cut' && audio !== 'none') fail('audio debe ser "crossfade", "cut" o "none".')
  const params: Record<string, ParamDef> = {}
  if (raw.params !== undefined) {
    if (!isObj(raw.params)) fail('params debe ser un objeto.')
    for (const [key, def] of Object.entries(raw.params as Record<string, unknown>)) {
      if (!isObj(def) || typeof def.type !== 'string') return fail(`el parámetro "${key}" necesita un "type".`)
      if (def.default === undefined) fail(`el parámetro "${key}" necesita un "default".`)
      switch (def.type) {
        case 'number':
        case 'int':
        case 'angle':
          if (typeof def.default !== 'number') fail(`el default de "${key}" debe ser un número.`)
          break
        case 'boolean':
          if (typeof def.default !== 'boolean') fail(`el default de "${key}" debe ser booleano.`)
          break
        case 'color':
          if (typeof def.default !== 'string') fail(`el default de "${key}" debe ser un texto de color.`)
          break
        case 'enum':
          if (!Array.isArray(def.options) || def.options.length === 0) fail(`"${key}" necesita una lista "options".`)
          if (!(def.options as unknown[]).includes(def.default)) fail(`el default de "${key}" debe estar en "options".`)
          break
        case 'easing':
          if (!EASING_NAMES.includes(def.default as EasingName)) fail(`"${String(def.default)}" no es un suavizado válido en "${key}".`)
          break
        case 'point':
          if (!Array.isArray(def.default) || def.default.length !== 2) fail(`el default de "${key}" debe ser [x, y].`)
          break
        default:
          fail(`tipo de parámetro desconocido en "${key}": ${def.type}`)
      }
      params[key] = def as unknown as ParamDef
    }
  }
  return {
    apiVersion: 1,
    id: raw.id as string,
    name: (raw.name as string).trim(),
    category: typeof raw.category === 'string' && raw.category.trim() ? raw.category.trim() : 'Personalizadas',
    author: typeof raw.author === 'string' ? raw.author : undefined,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    defaultDuration: dd,
    audio: audio as TransitionMeta['audio'],
    params
  }
}

/** Rellena los valores por defecto y fuerza el tipo/rango de cada parámetro. */
export function resolveParams(defs: Record<string, ParamDef>, given: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, def] of Object.entries(defs)) {
    const v = given[key] === undefined ? def.default : given[key]
    switch (def.type) {
      case 'number':
      case 'int': {
        let n = Number(v)
        if (!Number.isFinite(n)) n = def.default
        if (def.min !== undefined) n = Math.max(def.min, n)
        if (def.max !== undefined) n = Math.min(def.max, n)
        out[key] = def.type === 'int' ? Math.round(n) : n
        break
      }
      case 'angle': {
        const n = Number(v)
        out[key] = Number.isFinite(n) ? n : def.default
        break
      }
      case 'boolean':
        out[key] = Boolean(v)
        break
      case 'color':
        out[key] = typeof v === 'string' ? v : def.default
        break
      case 'enum':
        out[key] = def.options.includes(v as string) ? v : def.default
        break
      case 'easing':
        out[key] = EASING_NAMES.includes(v as EasingName) ? v : def.default
        break
      case 'point': {
        const p = Array.isArray(v) && v.length === 2 && v.every((x) => Number.isFinite(Number(x))) ? [Number(v[0]), Number(v[1])] : def.default
        out[key] = p
        break
      }
    }
  }
  return out
}

// ───────── Matrices ─────────

const mul = (a: Mat, b: Mat): Mat => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5]
]
const translate = (x: number, y: number): Mat => [1, 0, 0, 1, x, y]
const scaleM = (sx: number, sy: number): Mat => [sx, 0, 0, sy, 0, 0]
const rotateM = (deg: number): Mat => {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return [c, s, -s, c, 0, 0]
}

// ───────── Elementos ─────────

const num = (v: unknown, what: string): number => {
  const n = Number(v)
  if (!Number.isFinite(n)) throw new TransitionError(`${what}: se esperaba un número y llegó ${String(v)}.`)
  return n
}
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const combine = (a: number | undefined, b: number): number => (a === undefined ? b : 1 - (1 - a) * (1 - b))

interface MaskState {
  shape: Shape
  invert: boolean
  feather: number
}

/** Estado de transformación y filtros común a capas, partes y figuras. */
abstract class Element {
  protected dx = 0
  protected dy = 0
  protected sx = 1
  protected sy = 1
  protected rot = 0
  protected fh = false
  protected fv = false
  protected px = 0.5
  protected py = 0.5
  protected al = 1
  protected vis = true
  protected zv: number | null = null
  protected filters: Filters = {}
  protected maskState: MaskState | null = null

  constructor(protected baseZ: number) {}

  /** Cada frame empieza desde cero (regla de oro). */
  reset(): void {
    this.dx = this.dy = 0
    this.sx = this.sy = 1
    this.rot = 0
    this.fh = this.fv = false
    this.px = this.py = 0.5
    this.al = 1
    this.vis = true
    this.zv = null
    this.filters = {}
    this.maskState = null
  }

  move(dx: number, dy: number): this {
    this.dx += num(dx, 'move(dx)')
    this.dy += num(dy, 'move(dy)')
    return this
  }
  scale(s: number, sy?: number): this {
    const x = num(s, 'scale(s)')
    const y = sy === undefined ? x : num(sy, 'scale(sy)')
    this.sx *= x
    this.sy *= y
    return this
  }
  rotate(deg: number): this {
    this.rot += num(deg, 'rotate(deg)')
    return this
  }
  pivot(px: number, py: number): this {
    this.px = num(px, 'pivot(px)')
    this.py = num(py, 'pivot(py)')
    return this
  }
  alpha(a: number): this {
    this.al *= clamp01(num(a, 'alpha(a)'))
    return this
  }
  opacity(a: number): this {
    return this.alpha(a)
  }
  visible(v: boolean): this {
    this.vis = Boolean(v)
    return this
  }
  z(n: number): this {
    this.zv = num(n, 'z(n)')
    return this
  }
  flip(h: boolean, v = false): this {
    if (h) this.fh = !this.fh
    if (v) this.fv = !this.fv
    return this
  }
  mask(shape: Shape, options: { invert?: boolean; feather?: number } = {}): this {
    if (!(shape instanceof Shape)) throw new TransitionError('mask(shape): se esperaba una figura creada con draw.*')
    this.maskState = { shape, invert: Boolean(options.invert), feather: Math.max(0, Number(options.feather ?? 0)) || 0 }
    shape.usedAsMask = true
    return this
  }
  brightness(v: number): this {
    this.filters.brightness = (this.filters.brightness ?? 1) * num(v, 'brightness(v)')
    return this
  }
  contrast(v: number): this {
    this.filters.contrast = (this.filters.contrast ?? 1) * num(v, 'contrast(v)')
    return this
  }
  saturation(v: number): this {
    this.filters.saturation = (this.filters.saturation ?? 1) * num(v, 'saturation(v)')
    return this
  }
  grayscale(a: number): this {
    this.filters.grayscale = combine(this.filters.grayscale, clamp01(num(a, 'grayscale(a)')))
    return this
  }
  invert(a: number): this {
    this.filters.invert = combine(this.filters.invert, clamp01(num(a, 'invert(a)')))
    return this
  }
  sepia(a: number): this {
    this.filters.sepia = combine(this.filters.sepia, clamp01(num(a, 'sepia(a)')))
    return this
  }
  tint(c: unknown, amount: number): this {
    this.filters.tint = { color: parseColor(c), amount: clamp01(num(amount, 'tint(amount)')) }
    return this
  }
  blur(px: number): this {
    this.filters.blur = Math.max(this.filters.blur ?? 0, Math.max(0, num(px, 'blur(px)')))
    return this
  }
  pixelate(px: number): this {
    this.filters.pixelate = Math.max(this.filters.pixelate ?? 0, Math.max(0, num(px, 'pixelate(px)')))
    return this
  }

  get isVisible(): boolean {
    return this.vis
  }
  get zOrder(): number {
    return this.zv ?? this.baseZ
  }
  get alphaValue(): number {
    return this.al
  }
  get filterState(): Filters {
    return this.filters
  }
  get maskInfo(): MaskState | null {
    return this.maskState
  }

  /** Matriz del frame: escala → volteo → rotación (sobre el pivote) → traslación. */
  matrixFor(rect: Rect): Mat {
    const cx = rect.x + this.px * rect.w
    const cy = rect.y + this.py * rect.h
    let m = translate(-cx, -cy)
    m = mul(scaleM(this.sx * (this.fh ? -1 : 1), this.sy * (this.fv ? -1 : 1)), m)
    m = mul(rotateM(this.rot), m)
    m = mul(translate(cx + this.dx, cy + this.dy), m)
    return m
  }
}

export class ClipPart extends Element {
  constructor(
    private readonly parent: Layer,
    readonly index: number,
    readonly col: number,
    readonly row: number,
    readonly x: number,
    readonly y: number,
    readonly width: number,
    readonly height: number
  ) {
    super(0)
  }
  get cx(): number {
    return this.x + this.width / 2
  }
  get cy(): number {
    return this.y + this.height / 2
  }
  get rect(): Rect {
    return { x: this.x, y: this.y, w: this.width, h: this.height }
  }
  override get zOrder(): number {
    return this.zv ?? this.parent.zOrder
  }
  get owner(): Layer {
    return this.parent
  }
}

export class Layer extends Element {
  /** Partes creadas en init: duran toda la transición */
  persistentParts: ClipPart[] = []
  /** Partes creadas dentro de render: solo ese frame */
  frameParts: ClipPart[] = []

  constructor(
    readonly source: 'leave' | 'enter',
    readonly width: number,
    readonly height: number,
    baseZ: number,
    private readonly rt: Runtime
  ) {
    super(baseZ)
  }

  get parts(): ClipPart[] {
    return this.frameParts.length ? this.frameParts : this.persistentParts
  }
  get rect(): Rect {
    return { x: 0, y: 0, w: this.width, h: this.height }
  }

  splitGrid(cols: number, rows: number): ClipPart[] {
    const c = Math.floor(num(cols, 'splitGrid(cols)'))
    const r = Math.floor(num(rows, 'splitGrid(rows)'))
    if (c < 1 || r < 1) throw new TransitionError('splitGrid: cols y rows deben ser al menos 1.')
    if (c * r > MAX_PARTS) throw new TransitionError(`splitGrid: máximo ${MAX_PARTS} partes por capa (pediste ${c * r}).`)
    const parts: ClipPart[] = []
    for (let row = 0; row < r; row++) {
      for (let col = 0; col < c; col++) {
        const x0 = Math.round((col * this.width) / c)
        const x1 = Math.round(((col + 1) * this.width) / c)
        const y0 = Math.round((row * this.height) / r)
        const y1 = Math.round(((row + 1) * this.height) / r)
        parts.push(new ClipPart(this, row * c + col, col, row, x0, y0, x1 - x0, y1 - y0))
      }
    }
    this.rt.registerParts(this, parts)
    return [...parts]
  }

  splitStrips(n: number, direction: 'horizontal' | 'vertical'): ClipPart[] {
    const k = Math.floor(num(n, 'splitStrips(n)'))
    if (direction !== 'horizontal' && direction !== 'vertical') throw new TransitionError('splitStrips: la dirección debe ser "horizontal" o "vertical".')
    // "horizontal" = franjas horizontales (apiladas en vertical): una columna con n filas
    return direction === 'horizontal' ? this.splitGrid(1, k) : this.splitGrid(k, 1)
  }

  override reset(): void {
    super.reset()
    this.frameParts = []
  }
}

export class Shape extends Element {
  usedAsMask = false
  constructor(
    readonly geometry: Geometry,
    readonly style: ShapeStyleDef,
    private readonly screen: { width: number; height: number }
  ) {
    super(2)
  }
  get bounds(): Rect {
    return geometryBounds(this.geometry, this.screen)
  }
  override reset(): void {
    super.reset()
    this.usedAsMask = false
  }
}

// ───────── Runtime ─────────

export interface RuntimeConfig {
  width: number
  height: number
  fps: number
  duration: number
  params?: Record<string, unknown>
  seed?: number
  hasLeave?: boolean
  hasEnter?: boolean
}

export const DEFAULT_CONFIG: RuntimeConfig = { width: 1920, height: 1080, fps: 30, duration: 1, seed: 1, hasLeave: true, hasEnter: true }

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const GLOBAL_PARAMS = [
  'screen', 'draw', 'ease', 'math', 'color', 'log',
  // Lo siguiente se oculta al código del usuario (specs/05 §Sandbox)
  'Math', 'Date', 'performance', 'fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', 'indexedDB', 'caches',
  'Worker', 'SharedWorker', 'postMessage', 'self', 'globalThis', 'window'
] as const

let lineOffset: number | null = null
function stackLine(stack: string | undefined): { line: number; col: number } | null {
  const m = /<anonymous>:(\d+):(\d+)/.exec(stack ?? '')
  return m ? { line: Number(m[1]), col: Number(m[2]) } : null
}
/** `new Function` antepone líneas de cabecera: se mide una vez para traducir a líneas del archivo del usuario. */
function calibrate(): number {
  if (lineOffset !== null) return lineOffset
  try {
    new Function('"use strict";\nthrow new Error("probe")')()
  } catch (e) {
    const l = stackLine((e as Error).stack)
    lineOffset = l ? l.line - 1 : 3
    return lineOffset
  }
  lineOffset = 3
  return lineOffset
}

function locateSyntaxError(source: string): { line: number; col: number } | null {
  try {
    acornParse(source, { ecmaVersion: 2022, sourceType: 'script', allowReturnOutsideFunction: false })
  } catch (e) {
    const loc = (e as { loc?: { line: number; column: number } }).loc
    if (loc) return { line: loc.line, col: loc.column + 1 }
  }
  return null
}

function toTransitionError(e: unknown, phase: 'load' | 'init' | 'render', source: string): TransitionError {
  if (e instanceof TransitionError) {
    if (!e.phase) e.phase = phase
    if (e.line === undefined) {
      const l = stackLine(e.stack)
      if (l) {
        e.line = l.line - calibrate()
        e.col = l.col
      }
    }
    return e
  }
  const err = e instanceof Error ? e : new Error(String(e))
  let line: number | undefined
  let col: number | undefined
  if (err instanceof SyntaxError) {
    const s = locateSyntaxError(source)
    if (s) {
      line = s.line
      col = s.col
    }
  } else {
    const l = stackLine(err.stack)
    if (l) {
      line = l.line - calibrate()
      col = l.col
    }
  }
  return new TransitionError(`${err.name}: ${err.message}`, line !== undefined && line > 0 ? line : undefined, col, phase)
}

export type LogFn = (...args: unknown[]) => void

/** Estado interno de una instancia: capas, partes y figuras del frame. */
export class Runtime {
  phase: 'load' | 'init' | 'render' = 'load'
  readonly enter: Layer
  readonly leave: Layer
  private persistentShapes: Shape[] = []
  private frameShapes: Shape[] = []
  private shapeCount = 0
  private rand: () => number
  frame = 0
  totalFrames = 1
  time = 0
  readonly ctx: Record<string, unknown>

  constructor(readonly config: RuntimeConfig, params: Record<string, unknown> = {}) {
    const seed = config.seed ?? 1
    this.rand = mulberry32(seed)
    this.enter = new Layer('enter', config.width, config.height, 0, this)
    this.leave = new Layer('leave', config.width, config.height, 1, this)
    const self = this
    this.ctx = {
      params,
      duration: config.duration,
      seed,
      hasLeave: config.hasLeave ?? true,
      hasEnter: config.hasEnter ?? true,
      get frame() {
        return self.frame
      },
      get totalFrames() {
        return self.totalFrames
      },
      get time() {
        return self.time
      },
      random: () => this.rand()
    }
  }

  reseed(): void {
    this.rand = mulberry32(this.config.seed ?? 1)
  }

  registerParts(layer: Layer, parts: ClipPart[]): void {
    const total = this.enter.parts.length + this.leave.parts.length - layer.parts.length + parts.length
    if (total > MAX_PARTS * 2) throw new TransitionError(`Demasiadas partes en total (máximo ${MAX_PARTS} por capa).`)
    if (this.phase === 'render') layer.frameParts = parts
    else layer.persistentParts = parts
  }

  addShape(geometry: Geometry, style: ShapeStyleDef): Shape {
    if (++this.shapeCount > MAX_SHAPES) throw new TransitionError(`Demasiadas figuras por frame (máximo ${MAX_SHAPES}).`)
    const s = new Shape(geometry, style, { width: this.config.width, height: this.config.height })
    if (this.phase === 'render') this.frameShapes.push(s)
    else this.persistentShapes.push(s)
    return s
  }

  /** Regla de oro: todo vuelve a su estado base. */
  beginFrame(): void {
    this.enter.reset()
    this.leave.reset()
    for (const s of this.persistentShapes) s.reset()
    this.frameShapes = []
    this.shapeCount = this.persistentShapes.length
    for (const l of [this.enter, this.leave]) for (const p of l.persistentParts) p.reset()
    this.reseed()
  }

  buildDisplayList(frame: number): DisplayList {
    const items: (DisplayItem & { order: number })[] = []
    const masks: MaskItem[] = []
    let n = 0
    const maskFor = (st: MaskState | null): string | undefined => {
      if (!st) return undefined
      const id = `m${masks.length}`
      masks.push({
        id,
        geometry: st.shape.geometry,
        style: st.shape.style,
        matrix: st.shape.matrixFor(st.shape.bounds),
        invert: st.invert,
        feather: st.feather
      })
      return id
    }
    const merge = (a: Filters, b: Filters): Filters => {
      const out: Filters = { ...a }
      const mulK = (k: 'brightness' | 'contrast' | 'saturation'): void => {
        if (b[k] !== undefined) out[k] = (a[k] ?? 1) * (b[k] as number)
      }
      mulK('brightness')
      mulK('contrast')
      mulK('saturation')
      for (const k of ['grayscale', 'invert', 'sepia'] as const) if (b[k] !== undefined) out[k] = combine(a[k], b[k] as number)
      if (b.tint) out.tint = b.tint
      if (b.blur !== undefined) out.blur = Math.max(a.blur ?? 0, b.blur)
      if (b.pixelate !== undefined) out.pixelate = Math.max(a.pixelate ?? 0, b.pixelate)
      return out
    }
    for (const layer of [this.enter, this.leave]) {
      const present = layer.source === 'leave' ? (this.ctx.hasLeave as boolean) : (this.ctx.hasEnter as boolean)
      if (!present || !layer.isVisible) continue
      const parts = layer.parts
      if (parts.length === 0) {
        items.push({
          kind: 'layer',
          source: layer.source,
          matrix: layer.matrixFor(layer.rect),
          opacity: layer.alphaValue,
          filters: { ...layer.filterState },
          mask: maskFor(layer.maskInfo),
          z: layer.zOrder,
          order: n++
        })
        continue
      }
      const parentMat = layer.matrixFor(layer.rect)
      for (const part of parts) {
        if (!part.isVisible) continue
        const own = part.matrixFor(part.rect)
        items.push({
          kind: 'layer',
          source: layer.source,
          rect: part.rect,
          matrix: mul(parentMat, own),
          opacity: layer.alphaValue * part.alphaValue,
          filters: merge(layer.filterState, part.filterState),
          mask: maskFor(part.maskInfo ?? layer.maskInfo),
          z: part.zOrder,
          order: n++
        })
      }
    }
    for (const s of [...this.persistentShapes, ...this.frameShapes]) {
      if (!s.isVisible || s.usedAsMask) continue
      items.push({
        kind: 'shape',
        geometry: s.geometry,
        style: s.style,
        matrix: s.matrixFor(s.bounds),
        opacity: s.alphaValue,
        z: s.zOrder,
        order: n++
      })
    }
    items.sort((a, b) => a.z - b.z || a.order - b.order)
    return { frame, items: items.map(({ order: _order, ...rest }) => rest as DisplayItem), masks }
  }
}

// ───────── Utilidades globales de la API ─────────

function normStyle(style: Record<string, unknown> | undefined, defaultFill: boolean): ShapeStyleDef {
  const s = (style ?? {}) as Record<string, unknown>
  const out: ShapeStyleDef = {}
  if (s.fill !== undefined) out.fill = toCss(parseColor(s.fill))
  if (s.stroke !== undefined) out.stroke = toCss(parseColor(s.stroke))
  if (s.strokeWidth !== undefined) out.strokeWidth = Math.max(0, Number(s.strokeWidth))
  if (s.opacity !== undefined) out.opacity = clamp01(Number(s.opacity))
  const g = s.gradient as GradientDef | undefined
  if (g) {
    if ((g.type !== 'linear' && g.type !== 'radial') || !Array.isArray(g.stops)) throw new TransitionError('gradient: usa { type: "linear" | "radial", stops: [[0, color], …] }.')
    out.gradient = {
      type: g.type,
      stops: g.stops.map(([o, c]) => [clamp01(Number(o)), toCss(parseColor(c))] as [number, string]),
      from: g.from,
      to: g.to
    }
  }
  if (defaultFill && out.fill === undefined && out.stroke === undefined && !out.gradient) out.fill = 'rgba(255, 255, 255, 1)'
  return out
}

function createMath(): Record<string, unknown> {
  const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
  return {
    lerp: (a: number, b: number, t: number) => a + (b - a) * t,
    clamp,
    smoothstep: (e0: number, e1: number, x: number) => {
      const t = clamp((x - e0) / (e1 - e0 || 1e-9), 0, 1)
      return t * t * (3 - 2 * t)
    },
    map: (v: number, a: number, b: number, c: number, d: number) => c + ((v - a) / (b - a || 1e-9)) * (d - c),
    degToRad: (d: number) => (d * Math.PI) / 180,
    radToDeg: (r: number) => (r * 180) / Math.PI,
    stagger: (index: number, count: number, progress: number, overlap = 0.5) => {
      const n = Math.max(1, count)
      const ov = clamp(overlap, 0, 1)
      const d = 1 / (1 + (n - 1) * (1 - ov))
      const start = index * (1 - ov) * d
      return clamp((progress - start) / d, 0, 1)
    }
  }
}

function createColor(): Record<string, unknown> {
  return {
    rgb: (r: number, g: number, b: number, a = 1) => parseColor({ r, g, b, a }),
    // h en grados (0–360); s y l en 0–1
    hsl: (h: number, s: number, l: number, a = 1) => {
      const [r, g, b] = hslToRgb(h, s, l)
      return { r, g, b, a: clamp01(a) }
    },
    mix: (c1: unknown, c2: unknown, t: number) => mixColors(c1, c2, t)
  }
}

function createDraw(rt: Runtime): Record<string, unknown> {
  const n = (v: unknown, w: string): number => num(v, w)
  return {
    rect: (x: number, y: number, w: number, h: number, st?: Record<string, unknown>) =>
      rt.addShape({ type: 'rect', x: n(x, 'x'), y: n(y, 'y'), w: n(w, 'w'), h: n(h, 'h'), radius: st?.radius === undefined ? undefined : n(st.radius, 'radius') }, normStyle(st, true)),
    circle: (cx: number, cy: number, r: number, st?: Record<string, unknown>) =>
      rt.addShape({ type: 'circle', cx: n(cx, 'cx'), cy: n(cy, 'cy'), r: Math.max(0, n(r, 'r')) }, normStyle(st, true)),
    ellipse: (cx: number, cy: number, rx: number, ry: number, st?: Record<string, unknown>) =>
      rt.addShape({ type: 'ellipse', cx: n(cx, 'cx'), cy: n(cy, 'cy'), rx: Math.max(0, n(rx, 'rx')), ry: Math.max(0, n(ry, 'ry')) }, normStyle(st, true)),
    line: (x1: number, y1: number, x2: number, y2: number, st?: Record<string, unknown>) =>
      rt.addShape({ type: 'line', x1: n(x1, 'x1'), y1: n(y1, 'y1'), x2: n(x2, 'x2'), y2: n(y2, 'y2') }, { stroke: 'rgba(255, 255, 255, 1)', strokeWidth: 2, ...normStyle(st, false) }),
    polygon: (points: [number, number][], st?: Record<string, unknown>) => {
      if (!Array.isArray(points)) throw new TransitionError('polygon(points): se esperaba [[x, y], …].')
      return rt.addShape({ type: 'polygon', points: points.map((p) => [n(p[0], 'x'), n(p[1], 'y')] as [number, number]) }, normStyle(st, true))
    },
    path: (d: string, st?: Record<string, unknown>) => {
      if (typeof d !== 'string') throw new TransitionError('path(d): se esperaba una cadena con la sintaxis "d" de SVG.')
      return rt.addShape({ type: 'path', d }, normStyle(st, true))
    },
    star: (cx: number, cy: number, points: number, rOuter: number, rInner: number, st?: Record<string, unknown>) =>
      rt.addShape({ type: 'star', cx: n(cx, 'cx'), cy: n(cy, 'cy'), points: Math.max(2, Math.round(n(points, 'points'))), rOuter: n(rOuter, 'rOuter'), rInner: n(rInner, 'rInner') }, normStyle(st, true)),
    text: (str: string, x: number, y: number, st?: Record<string, unknown>) =>
      rt.addShape(
        {
          type: 'text',
          str: String(str),
          x: n(x, 'x'),
          y: n(y, 'y'),
          font: typeof st?.font === 'string' ? st.font : 'sans-serif',
          size: st?.size === undefined ? 48 : n(st.size, 'size'),
          weight: String(st?.weight ?? 'normal'),
          align: st?.align === 'center' || st?.align === 'right' ? st.align : 'left'
        },
        normStyle(st, true)
      ),
    fill: (c: unknown) => rt.addShape({ type: 'fill' }, { fill: toCss(parseColor(c)) })
  }
}

// ───────── Instancia ─────────

interface Compiled {
  meta: unknown
  init?: (leave: Layer, enter: Layer, ctx: unknown) => void
  render?: (leave: Layer, enter: Layer, progress: number, ctx: unknown) => void
}

export interface InstanceHooks {
  log?: LogFn
  /** Reloj en ms (el worker lo inyecta; no se expone al código del usuario) */
  now?: () => number
}

/** Una transición colocada en la línea de tiempo: su propio estado y su propio ámbito de evaluación. */
export class TransitionInstance {
  readonly meta: TransitionMeta
  private rt: Runtime
  private fns: Compiled
  private source: string
  /** Duración de la última llamada (ms) */
  lastMs = 0

  constructor(source: string, config: RuntimeConfig = DEFAULT_CONFIG, hooks: InstanceHooks = {}) {
    this.source = source
    // El meta se necesita antes de crear el runtime completo (para resolver parámetros), así que se evalúa en dos pasos.
    const probe = new Runtime({ ...DEFAULT_CONFIG, ...config }, {})
    const first = this.evaluate(probe, hooks)
    this.meta = (() => {
      try {
        return normalizeMeta(first.meta)
      } catch (e) {
        throw toTransitionError(e, 'load', source)
      }
    })()
    if (!first.render) throw new TransitionError('Falta la función render(leaveClip, enterClip, progress, ctx).', undefined, undefined, 'load')
    const params = resolveParams(this.meta.params, config.params)
    this.rt = new Runtime({ ...DEFAULT_CONFIG, ...config }, params)
    this.fns = this.evaluate(this.rt, hooks)
  }

  private evaluate(rt: Runtime, hooks: InstanceHooks): Compiled {
    const realMath = Math
    const safeMath: Record<string, unknown> = {}
    for (const k of Object.getOwnPropertyNames(realMath)) safeMath[k] = (realMath as unknown as Record<string, unknown>)[k]
    safeMath.random = () => {
      throw new TransitionError('Math.random está deshabilitado: usa ctx.random() para tener resultados deterministas.')
    }
    const blocked = (name: string) => (): never => {
      throw new TransitionError(`${name} está deshabilitado en las transiciones.`)
    }
    const logFn: LogFn = (...a) => hooks.log?.(...a)
    const values: Record<string, unknown> = {
      screen: Object.freeze({ width: rt.config.width, height: rt.config.height, fps: rt.config.fps, aspect: rt.config.width / rt.config.height }),
      draw: createDraw(rt),
      ease: createEase(),
      math: createMath(),
      color: createColor(),
      log: logFn,
      Math: safeMath,
      Date: blocked('Date'),
      performance: undefined
    }
    const args = GLOBAL_PARAMS.map((k) => values[k])
    const body = `"use strict";\n${this.source}\n;return { meta: typeof meta === "undefined" ? undefined : meta, init: typeof init === "function" ? init : undefined, render: typeof render === "function" ? render : undefined };`
    rt.phase = 'load'
    try {
      const factory = new Function(...GLOBAL_PARAMS, body)
      return factory(...args) as Compiled
    } catch (e) {
      throw toTransitionError(e, 'load', this.source)
    }
  }

  get duration(): number {
    return this.rt.config.duration
  }

  /** Se llama una vez al crear la instancia y al cambiar duración o parámetros. */
  init(): void {
    const rt = this.rt
    rt.phase = 'init'
    rt.beginFrame()
    rt.reseed()
    try {
      this.fns.init?.(rt.leave, rt.enter, rt.ctx)
    } catch (e) {
      throw toTransitionError(e, 'init', this.source)
    } finally {
      rt.phase = 'render'
    }
  }

  render(progress: number, frame = 0, totalFrames = 1): DisplayList {
    const rt = this.rt
    rt.phase = 'render'
    rt.frame = frame
    rt.totalFrames = totalFrames
    rt.time = rt.config.duration * progress
    rt.beginFrame()
    try {
      this.fns.render?.(rt.leave, rt.enter, Math.min(1, Math.max(0, progress)), rt.ctx)
    } catch (e) {
      throw toTransitionError(e, 'render', this.source)
    }
    return rt.buildDisplayList(frame)
  }
}

/** Evalúa un archivo solo para leer sus metadatos (panel Transiciones). */
export function readMeta(source: string): TransitionMeta {
  return new TransitionInstance(source, DEFAULT_CONFIG).meta
}
