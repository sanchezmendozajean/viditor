/** Clips de muestra A/B para previsualizar transiciones: barras de color con una letra gigante (se ve bien el movimiento). */
export function drawSample(canvas: HTMLCanvasElement, w: number, h: number, which: 'A' | 'B'): void {
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
  const hues = which === 'A' ? [8, 28, 45, 340, 20, 55] : [200, 225, 170, 260, 190, 150]
  const bw = w / hues.length
  hues.forEach((hue, i) => {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, `hsl(${hue}, 80%, 58%)`)
    g.addColorStop(1, `hsl(${hue}, 75%, 32%)`)
    ctx.fillStyle = g
    ctx.fillRect(i * bw, 0, Math.ceil(bw), h)
  })
  // Marco para distinguir los bordes del clip
  ctx.lineWidth = Math.max(2, w / 120)
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth)
  ctx.fillStyle = 'rgba(0,0,0,0.38)'
  ctx.beginPath()
  ctx.arc(w / 2, h / 2, h * 0.36, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = `800 ${Math.round(h * 0.55)}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(which, w / 2, h / 2 + h * 0.03)
}
