import type { Geometry, Mat, ShapeStyleDef } from '@shared/display-list'
import { geometryBounds } from '../../transition-runtime/geometry'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

function buildPath(ctx: Ctx, g: Geometry): Path2D | null {
  const p = new Path2D()
  switch (g.type) {
    case 'rect':
      if (g.radius && g.radius > 0) p.roundRect(g.x, g.y, g.w, g.h, g.radius)
      else p.rect(g.x, g.y, g.w, g.h)
      return p
    case 'circle':
      p.arc(g.cx, g.cy, Math.max(0, g.r), 0, Math.PI * 2)
      return p
    case 'ellipse':
      p.ellipse(g.cx, g.cy, Math.max(0, g.rx), Math.max(0, g.ry), 0, 0, Math.PI * 2)
      return p
    case 'line':
      p.moveTo(g.x1, g.y1)
      p.lineTo(g.x2, g.y2)
      return p
    case 'polygon':
      g.points.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)))
      p.closePath()
      return p
    case 'path':
      return new Path2D(g.d)
    case 'star': {
      const n = Math.max(2, g.points)
      for (let i = 0; i < n * 2; i++) {
        const r = i % 2 === 0 ? g.rOuter : g.rInner
        const a = (Math.PI * i) / n - Math.PI / 2
        const x = g.cx + Math.cos(a) * r
        const y = g.cy + Math.sin(a) * r
        if (i === 0) p.moveTo(x, y)
        else p.lineTo(x, y)
      }
      p.closePath()
      return p
    }
    case 'fill':
    case 'text':
      return null
  }
}

function paintFor(ctx: Ctx, g: Geometry, style: ShapeStyleDef, screen: { width: number; height: number }): string | CanvasGradient | undefined {
  if (style.gradient) {
    const b = geometryBounds(g, screen)
    const gr = style.gradient
    let grad: CanvasGradient
    if (gr.type === 'linear') {
      const [x0, y0] = gr.from ?? [b.x, b.y + b.h / 2]
      const [x1, y1] = gr.to ?? [b.x + b.w, b.y + b.h / 2]
      grad = ctx.createLinearGradient(x0, y0, x1, y1)
    } else {
      const [cx, cy] = gr.from ?? [b.x + b.w / 2, b.y + b.h / 2]
      const [tx, ty] = gr.to ?? [cx + Math.max(b.w, b.h) / 2, cy]
      grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(tx - cx, ty - cy) || 1)
    }
    for (const [o, c] of gr.stops) grad.addColorStop(Math.min(1, Math.max(0, o)), c)
    return grad
  }
  return style.fill
}

/**
 * Dibuja una figura de la display list en un contexto 2D. `scale` es la relación píxeles del lienzo / píxeles del
 * proyecto (calidad de la vista previa); `matrix` actúa sobre las coordenadas del proyecto.
 */
export function rasterizeShape(
  ctx: Ctx,
  g: Geometry,
  style: ShapeStyleDef,
  matrix: Mat,
  scale: number,
  screen: { width: number; height: number },
  extra: { offsetX?: number; offsetY?: number } = {}
): void {
  ctx.save()
  ctx.setTransform(scale * matrix[0], scale * matrix[1], scale * matrix[2], scale * matrix[3], scale * matrix[4] + (extra.offsetX ?? 0), scale * matrix[5] + (extra.offsetY ?? 0))
  ctx.globalAlpha = style.opacity ?? 1
  if (g.type === 'fill') {
    ctx.fillStyle = style.fill ?? 'white'
    ctx.fillRect(0, 0, screen.width, screen.height)
  } else if (g.type === 'text') {
    ctx.font = `${g.weight} ${g.size}px ${g.font}`
    ctx.textAlign = g.align
    ctx.textBaseline = 'alphabetic'
    const paint = paintFor(ctx, g, style, screen)
    if (paint) {
      ctx.fillStyle = paint
      ctx.fillText(g.str, g.x, g.y)
    }
    if (style.stroke) {
      ctx.strokeStyle = style.stroke
      ctx.lineWidth = style.strokeWidth ?? 1
      ctx.strokeText(g.str, g.x, g.y)
    }
  } else {
    const path = buildPath(ctx, g)
    if (path) {
      const paint = g.type === 'line' ? undefined : paintFor(ctx, g, style, screen)
      if (paint) {
        ctx.fillStyle = paint
        ctx.fill(path)
      }
      if (style.stroke) {
        ctx.strokeStyle = style.stroke
        ctx.lineWidth = style.strokeWidth ?? 1
        ctx.lineJoin = 'round'
        ctx.stroke(path)
      }
    }
  }
  ctx.restore()
}
