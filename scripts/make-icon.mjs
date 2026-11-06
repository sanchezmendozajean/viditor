// Genera build/icon.png (512×512) sin dependencias: cuadrado redondeado azul con una «V» blanca.
// Uso: node scripts/make-icon.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const N = 512
const SS = 3 // supermuestreo para suavizar los bordes
const ACCENT = [0x2d, 0x8c, 0xeb]
const R = 104 // radio de las esquinas

const inRoundRect = (x, y) => {
  const cx = Math.min(Math.max(x, R), N - R)
  const cy = Math.min(Math.max(y, R), N - R)
  return (x - cx) ** 2 + (y - cy) ** 2 <= R * R
}
// «V»: dos trazos gruesos que se unen abajo
const A = [128, 150]
const B = [256, 370]
const C = [384, 150]
const W = 38
const distSeg = (px, py, [ax, ay], [bx, by]) => {
  const dx = bx - ax
  const dy = by - ay
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}
const inV = (x, y) => distSeg(x, y, A, B) <= W / 2 || distSeg(x, y, B, C) <= W / 2

const raw = Buffer.alloc(N * (N * 4 + 1))
for (let y = 0; y < N; y++) {
  raw[y * (N * 4 + 1)] = 0
  for (let x = 0; x < N; x++) {
    let cover = 0
    let v = 0
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const px = x + (sx + 0.5) / SS
        const py = y + (sy + 0.5) / SS
        if (inRoundRect(px, py)) {
          cover++
          if (inV(px, py)) v++
        }
      }
    }
    const total = SS * SS
    const o = y * (N * 4 + 1) + 1 + x * 4
    const white = cover ? v / cover : 0
    raw[o] = Math.round(ACCENT[0] + (255 - ACCENT[0]) * white)
    raw[o + 1] = Math.round(ACCENT[1] + (255 - ACCENT[1]) * white)
    raw[o + 2] = Math.round(ACCENT[2] + (255 - ACCENT[2]) * white)
    raw[o + 3] = Math.round((cover / total) * 255)
  }
}

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const sum = Buffer.alloc(4)
  sum.writeUInt32BE(crc(body))
  return Buffer.concat([len, body, sum])
}
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(N, 0)
ihdr.writeUInt32BE(N, 4)
ihdr[8] = 8 // profundidad
ihdr[9] = 6 // RGBA
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
mkdirSync('build', { recursive: true })
writeFileSync('build/icon.png', png)
console.log(`build/icon.png (${png.length} bytes)`)
