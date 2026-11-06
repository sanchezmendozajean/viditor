import type { RGBA } from '../shared/display-list'

const NAMED: Record<string, RGBA> = {
  black: { r: 0, g: 0, b: 0, a: 1 },
  white: { r: 255, g: 255, b: 255, a: 1 },
  red: { r: 255, g: 0, b: 0, a: 1 },
  green: { r: 0, g: 128, b: 0, a: 1 },
  lime: { r: 0, g: 255, b: 0, a: 1 },
  blue: { r: 0, g: 0, b: 255, a: 1 },
  yellow: { r: 255, g: 255, b: 0, a: 1 },
  cyan: { r: 0, g: 255, b: 255, a: 1 },
  magenta: { r: 255, g: 0, b: 255, a: 1 },
  orange: { r: 255, g: 165, b: 0, a: 1 },
  purple: { r: 128, g: 0, b: 128, a: 1 },
  gray: { r: 128, g: 128, b: 128, a: 1 },
  grey: { r: 128, g: 128, b: 128, a: 1 },
  transparent: { r: 0, g: 0, b: 0, a: 0 }
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360
  s = clamp(s, 0, 1)
  l = clamp(l, 0, 1)
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

/** Interpreta un color CSS (#rgb, #rrggbb, #rrggbbaa, rgb(), rgba(), hsl(), hsla(), nombres básicos) o un objeto Color. */
export function parseColor(input: unknown): RGBA {
  if (input && typeof input === 'object') {
    const o = input as Partial<RGBA>
    if (typeof o.r === 'number' && typeof o.g === 'number' && typeof o.b === 'number') {
      return { r: clamp(o.r, 0, 255), g: clamp(o.g, 0, 255), b: clamp(o.b, 0, 255), a: clamp(o.a ?? 1, 0, 1) }
    }
  }
  if (typeof input !== 'string') throw new Error(`Color no válido: ${String(input)}`)
  const s = input.trim().toLowerCase()
  const named = NAMED[s]
  if (named) return { ...named }
  let m = /^#([0-9a-f]{3,8})$/.exec(s)
  if (m) {
    let h = m[1] as string
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('')
    if (h.length === 6 || h.length === 8) {
      return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 }
    }
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s)
  if (m) return { r: clamp(Number(m[1]), 0, 255), g: clamp(Number(m[2]), 0, 255), b: clamp(Number(m[3]), 0, 255), a: parseAlpha(m[4]) }
  m = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s)
  if (m) {
    const [r, g, b] = hslToRgb(Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100)
    return { r, g, b, a: parseAlpha(m[4]) }
  }
  throw new Error(`Color no válido: "${input}"`)
}

function parseAlpha(v: string | undefined): number {
  if (v === undefined) return 1
  return v.endsWith('%') ? clamp(Number(v.slice(0, -1)) / 100, 0, 1) : clamp(Number(v), 0, 1)
}

export const toCss = (c: RGBA): string => `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${+c.a.toFixed(4)})`

export function mixColors(a: unknown, b: unknown, t: number): RGBA {
  const ca = parseColor(a)
  const cb = parseColor(b)
  const k = clamp(t, 0, 1)
  return { r: ca.r + (cb.r - ca.r) * k, g: ca.g + (cb.g - ca.g) * k, b: ca.b + (cb.b - ca.b) * k, a: ca.a + (cb.a - ca.a) * k }
}
