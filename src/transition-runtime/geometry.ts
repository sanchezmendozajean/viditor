import type { Geometry, Rect } from '../shared/display-list'

/** Límites aproximados de un trazado SVG (los puntos de control cuentan: la caja nunca queda corta). */
export function pathBounds(d: string): Rect {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? []
  const xs: number[] = []
  const ys: number[] = []
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0
  let cmd = ''
  let i = 0
  const num = (): number => Number(tokens[i++])
  const add = (x: number, y: number): void => {
    xs.push(x)
    ys.push(y)
  }
  const args: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 }
  while (i < tokens.length) {
    const t = tokens[i] as string
    if (/[a-zA-Z]/.test(t)) {
      cmd = t
      i++
      if (cmd === 'z' || cmd === 'Z') {
        cx = sx
        cy = sy
        continue
      }
    } else if (!cmd) {
      throw new Error('Trazado SVG no válido: debe empezar por un comando (M, L, C…).')
    }
    const rel = cmd === cmd.toLowerCase()
    const k = cmd.toLowerCase()
    const n = args[k]
    if (n === undefined) throw new Error(`Comando SVG desconocido: "${cmd}"`)
    const v: number[] = []
    for (let j = 0; j < n; j++) v.push(num())
    if (v.some((x) => Number.isNaN(x))) throw new Error('Trazado SVG no válido: faltan números.')
    const ox = rel ? cx : 0
    const oy = rel ? cy : 0
    switch (k) {
      case 'm':
        cx = ox + (v[0] as number)
        cy = oy + (v[1] as number)
        sx = cx
        sy = cy
        add(cx, cy)
        cmd = rel ? 'l' : 'L'
        break
      case 'l':
      case 't':
        cx = ox + (v[0] as number)
        cy = oy + (v[1] as number)
        add(cx, cy)
        break
      case 'h':
        cx = ox + (v[0] as number)
        add(cx, cy)
        break
      case 'v':
        cy = oy + (v[0] as number)
        add(cx, cy)
        break
      case 'c':
        add(ox + (v[0] as number), oy + (v[1] as number))
        add(ox + (v[2] as number), oy + (v[3] as number))
        cx = ox + (v[4] as number)
        cy = oy + (v[5] as number)
        add(cx, cy)
        break
      case 's':
      case 'q':
        add(ox + (v[0] as number), oy + (v[1] as number))
        cx = ox + (v[2] as number)
        cy = oy + (v[3] as number)
        add(cx, cy)
        break
      case 'a':
        cx = ox + (v[5] as number)
        cy = oy + (v[6] as number)
        add(cx, cy)
        break
    }
  }
  if (xs.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
  const x0 = Math.min(...xs)
  const y0 = Math.min(...ys)
  return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 }
}

/** Caja que contiene la figura, en px del proyecto; su centro es el pivote por defecto. */
export function geometryBounds(g: Geometry, screen: { width: number; height: number }): Rect {
  switch (g.type) {
    case 'rect':
      return { x: g.x, y: g.y, w: g.w, h: g.h }
    case 'circle':
      return { x: g.cx - g.r, y: g.cy - g.r, w: g.r * 2, h: g.r * 2 }
    case 'ellipse':
      return { x: g.cx - g.rx, y: g.cy - g.ry, w: g.rx * 2, h: g.ry * 2 }
    case 'line': {
      const x = Math.min(g.x1, g.x2)
      const y = Math.min(g.y1, g.y2)
      return { x, y, w: Math.abs(g.x2 - g.x1), h: Math.abs(g.y2 - g.y1) }
    }
    case 'polygon': {
      if (g.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
      const xs = g.points.map((p) => p[0])
      const ys = g.points.map((p) => p[1])
      const x = Math.min(...xs)
      const y = Math.min(...ys)
      return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
    }
    case 'path':
      return pathBounds(g.d)
    case 'star':
      return { x: g.cx - g.rOuter, y: g.cy - g.rOuter, w: g.rOuter * 2, h: g.rOuter * 2 }
    case 'text': {
      const w = g.str.length * g.size * 0.55
      const x = g.align === 'center' ? g.x - w / 2 : g.align === 'right' ? g.x - w : g.x
      return { x, y: g.y - g.size, w, h: g.size * 1.2 }
    }
    case 'fill':
      return { x: 0, y: 0, w: screen.width, h: screen.height }
  }
}
