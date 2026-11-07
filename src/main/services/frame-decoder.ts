import { spawn, type ChildProcess } from 'node:child_process'
import type { DecodedFrame } from '@shared/export-model'
import { resolveBinary } from './paths'

/**
 * Decodificador de frames exactos para la exportación (specs/06 §Pipeline): un proceso FFmpeg por clip activo que
 * entrega `rawvideo rgba` por pipe, siempre desde el archivo ORIGINAL (nunca el proxy). El frame `k` del flujo
 * corresponde al instante `inicio + k·speed/fps` del medio. El proceso se reutiliza mientras el clip siga activo.
 */
export interface DecoderSource {
  file: string
  width: number
  height: number
  kind: 'video' | 'image'
}

/** Bytes de un frame yuv420p: plano Y y dos de croma submuestreados (con redondeo hacia arriba en tamaños impares) */
export const yuv420Bytes = (w: number, h: number): number => w * h + 2 * ((w + 1) >> 1) * ((h + 1) >> 1)

const MAX_BUFFERED_FRAMES = 6
/** Si el siguiente frame pedido está más lejos que esto, es más barato reiniciar que descartar */
const MAX_SKIP = 90

class FrameStream {
  private proc: ChildProcess | null = null
  private chunks: Buffer[] = []
  private buffered = 0
  private ended = false
  private error = ''
  private waiters: (() => void)[] = []
  private index = -1
  private target = -1
  private chain: Promise<void> = Promise.resolve()
  private last: Buffer | null = null
  lastUsedFrame = 0

  constructor(
    private readonly ffmpeg: string,
    private readonly src: DecoderSource,
    private readonly startTime: number,
    private readonly fps: number,
    private readonly speed: number
  ) {
    this.begin()
  }

  private get frameBytes(): number {
    return yuv420Bytes(this.src.width, this.src.height)
  }

  private begin(): void {
    // Sin conversión a RGB en la CPU: se entrega YUV 4:2:0 de rango limitado a tamaño nativo y la GPU hace la matriz
    // de color y el escalado (como la vista previa). El filtro scale solo normaliza el rango y el tamaño esperado.
    const vf = `fps=${(this.fps / this.speed).toFixed(6)},scale=${this.src.width}:${this.src.height}:flags=bicubic:in_range=auto:out_range=tv,format=yuv420p`
    const args = ['-v', 'error', '-ss', this.startTime.toFixed(6), '-i', this.src.file, '-an', '-sn', '-vf', vf, '-pix_fmt', 'yuv420p', '-f', 'rawvideo', 'pipe:1']
    const p = spawn(this.ffmpeg, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    this.proc = p
    p.stdout?.on('data', (c: Buffer) => {
      this.chunks.push(c)
      this.buffered += c.length
      if (this.buffered > this.frameBytes * MAX_BUFFERED_FRAMES) p.stdout?.pause()
      this.wake()
    })
    p.stderr?.on('data', (c: Buffer) => (this.error = (this.error + c.toString()).slice(-2000)))
    p.on('close', () => {
      this.ended = true
      this.wake()
    })
    p.on('error', (e) => {
      this.error = e.message
      this.ended = true
      this.wake()
    })
  }

  private wake(): void {
    const w = this.waiters
    this.waiters = []
    for (const f of w) f()
  }

  private take(n: number): Buffer {
    const out = Buffer.allocUnsafe(n)
    let off = 0
    while (off < n) {
      const c = this.chunks[0] as Buffer
      const k = Math.min(c.length, n - off)
      c.copy(out, off, 0, k)
      off += k
      if (k === c.length) this.chunks.shift()
      else this.chunks[0] = c.subarray(k)
    }
    this.buffered -= n
    if (this.buffered < this.frameBytes * 2) this.proc?.stdout?.resume()
    return out
  }

  /** Lee el siguiente frame del flujo; al agotarse repite el último (el vídeo es más corto que el clip). */
  private async next(): Promise<Buffer> {
    const n = this.frameBytes
    while (this.buffered < n) {
      if (this.ended) {
        if (this.last) return this.last
        throw new Error(`FFmpeg no pudo decodificar ${this.src.file}${this.error ? `: ${this.error.trim()}` : ''}`)
      }
      await new Promise<void>((r) => this.waiters.push(r))
    }
    const f = this.take(n)
    this.index++
    this.last = f
    return f
  }

  /** Último frame solicitado (las peticiones se encadenan: se admite precarga de varios frames). */
  get position(): number {
    return this.target
  }

  /** Frame número `idx` del flujo. Solo avanza; si hay que retroceder o saltar mucho el llamador reinicia. */
  frame(idx: number): Promise<Buffer> {
    this.target = Math.max(this.target, idx)
    const run = this.chain.then(() => this.read(idx))
    this.chain = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  private async read(idx: number): Promise<Buffer> {
    if (idx <= this.index && this.last) return this.last
    let f: Buffer = this.last ?? Buffer.alloc(0)
    while (this.index < idx) f = await this.next()
    return f
  }

  canServe(idx: number): boolean {
    return idx >= this.target && idx - this.target <= MAX_SKIP
  }

  kill(): void {
    this.proc?.stdout?.destroy()
    this.proc?.kill()
    this.proc = null
    this.chunks = []
    this.wake()
  }
}

export class FrameDecoderPool {
  private streams = new Map<string, FrameStream>()
  private stills = new Map<string, DecodedFrame>()
  private ffmpeg: string | null = null

  constructor(
    private readonly fps: number,
    private readonly resolve: (mediaId: string) => DecoderSource | null
  ) {}

  private async bin(): Promise<string> {
    return (this.ffmpeg ??= await resolveBinary('ffmpeg'))
  }

  async decode(clipId: string, mediaId: string, sourceTime: number, speed: number, frameNo: number): Promise<DecodedFrame> {
    const src = this.resolve(mediaId)
    if (!src) throw new Error(`No se encontró el medio ${mediaId}.`)
    if (src.kind === 'image') return this.still(mediaId, src)

    let s = this.streams.get(clipId)
    let entry = this.meta.get(clipId)
    if (s && entry) {
      const idx = Math.round(((sourceTime - entry.start) * this.fps) / speed)
      if (idx < s.position || !s.canServe(idx)) {
        s.kill()
        s = undefined
      }
    }
    if (!s) {
      entry = { start: sourceTime }
      this.meta.set(clipId, entry)
      s = new FrameStream(await this.bin(), src, sourceTime, this.fps, speed)
      this.streams.set(clipId, s)
    }
    const idx = Math.max(0, Math.round(((sourceTime - (entry as { start: number }).start) * this.fps) / speed))
    s.lastUsedFrame = frameNo
    const data = await s.frame(idx)
    this.sweep(frameNo)
    return { width: src.width, height: src.height, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), format: 'yuv420p', still: false }
  }

  private meta = new Map<string, { start: number }>()

  /** Libera los procesos de clips que ya no se piden. */
  private sweep(frameNo: number): void {
    for (const [id, s] of this.streams) {
      if (frameNo - s.lastUsedFrame > 3) {
        s.kill()
        this.streams.delete(id)
        this.meta.delete(id)
      }
    }
  }

  private async still(mediaId: string, src: DecoderSource): Promise<DecodedFrame> {
    const hit = this.stills.get(mediaId)
    if (hit) return hit
    const ffmpeg = await this.bin()
    const args = ['-v', 'error', '-i', src.file, '-frames:v', '1', '-vf', `scale=${src.width}:${src.height}:flags=bicubic`, '-pix_fmt', 'rgba', '-f', 'rawvideo', 'pipe:1']
    const data = await new Promise<Buffer>((resolve, reject) => {
      const p = spawn(ffmpeg, args, { windowsHide: true })
      const out: Buffer[] = []
      let err = ''
      p.stdout.on('data', (c: Buffer) => out.push(c))
      p.stderr.on('data', (c: Buffer) => (err += c.toString()))
      p.on('error', reject)
      p.on('close', (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(err.trim() || `ffmpeg terminó con código ${code}`))))
    })
    const f: DecodedFrame = { width: src.width, height: src.height, data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), format: 'rgba', still: true }
    this.stills.set(mediaId, f)
    return f
  }

  dispose(): void {
    for (const s of this.streams.values()) s.kill()
    this.streams.clear()
    this.meta.clear()
    this.stills.clear()
  }
}

