import { buildFrame, type DrawOp, type Frame, type TransitionOp } from '@shared/render-model'
import { exportFrames, exportProject, outputFps, type DecodedFrame, type ExportJobData } from '@shared/export-model'
import { formatTimecode } from '@shared/timecode'
import type { AudioMode } from '@shared/transition-model'
import { Compositor, type RawFrame, type Source } from '@/engine/compositor'
import { transitionHost, type Env } from '@/engine/transition-host'
import { YuvConverter } from './yuv'

/** Capas de clip de un frame, incluidas las dos de cada transición. */
function clipLayers(frame: Frame): DrawOp[] {
  const out: DrawOp[] = []
  for (const op of frame.ops) {
    if (op.kind === 'transition') {
      if (op.leave) out.push(op.leave)
      if (op.enter) out.push(op.enter)
    } else out.push(op)
  }
  return out
}

const MAX_INFLIGHT = 3
const PREFETCH = 3
const THUMB_EVERY = 15

interface Prepared {
  n: number
  frame: Frame
  sources: Map<string, Source>
}

/**
 * Bucle de exportación (specs/06): se ejecuta en la ventana oculta, con el MISMO compositor y el MISMO TransitionHost
 * que la vista previa. Para cada frame: construye el `Frame`, pide al main los frames fuente exactos (FFmpeg), calcula
 * las display lists de las transiciones, compone con WebGL2, lee los píxeles y los entrega al codificador.
 */
export async function runExport(jobId: string): Promise<void> {
  const api = window.viditor.exportRunner
  try {
    const job = await api.data(jobId)
    await execute(job)
  } catch (e) {
    api.fail(jobId, e instanceof Error ? e.message : String(e))
  }
}

async function execute(job: ExportJobData): Promise<void> {
  const api = window.viditor.exportRunner
  const { jobId, project, options } = job
  const { project: rp, canvas: size } = exportProject(project, options)
  const frames = exportFrames(project, options)
  const fps = outputFps(project, options)
  const fpsValue = fps.num / fps.den

  // ── Transiciones: se cargan solo las usadas, con los límites de exportación ──
  transitionHost.mode = 'export'
  const errors = new Map<string, string>()
  transitionHost.onEvent = (e) => {
    if (e.level === 'error') errors.set(e.ref, e.line ? `línea ${e.line}: ${e.text}` : e.text)
  }
  const files = await window.viditor.transitions.list()
  const modes: Record<string, AudioMode | undefined> = {}
  const names = new Map<string, string>()
  for (const ref of new Set(rp.transitions.map((t) => t.transitionRef))) {
    const file = files.find((f) => f.ref === ref)
    if (!file) continue // falta: se renderiza como corte seco (igual que en la vista previa)
    const info = await transitionHost.load(ref, file.source)
    if (info.error) throw new Error(`La transición "${ref}" tiene un error: ${info.error.message}${info.error.line ? ` (línea ${info.error.line})` : ''}`)
    modes[ref] = info.meta?.audio
    names.set(ref, info.meta?.name ?? ref)
  }

  const begun = await api.begin(jobId, modes)
  if (!begun.ok) throw new Error(begun.error)

  const canvas = document.createElement('canvas')
  const compositor = new Compositor(canvas)
  compositor.resize(size.width, size.height)
  const gl = compositor.gl
  const env: Env = { width: rp.settings.width, height: rp.settings.height, fps: fpsValue }
  // Con yuv420p la conversión se hace en la GPU y por IPC viajan 1,5 bytes por píxel en lugar de 4
  const yuv = begun.value.input === 'yuv420p' ? new YuvConverter(gl, size.width, size.height) : null
  const pixels = new Uint8Array(yuv ? yuv.bufferLength : size.width * size.height * 4)
  const frameBytes = yuv ? yuv.byteLength : pixels.length
  const thumbCanvas = document.createElement('canvas')
  thumbCanvas.width = 192
  thumbCanvas.height = Math.max(2, Math.round((192 * size.height) / size.width))
  const thumbCtx = thumbCanvas.getContext('2d')

  const stills = new Map<string, ImageBitmap>()
  const toSource = async (mediaId: string, d: DecodedFrame): Promise<Source> => {
    if (!d.still) return { width: d.width, height: d.height, data: d.data, format: d.format } satisfies RawFrame
    let bmp = stills.get(mediaId)
    if (!bmp) {
      const px = new Uint8ClampedArray(d.data.slice().buffer as ArrayBuffer)
      bmp = await createImageBitmap(new ImageData(px, d.width, d.height), { premultiplyAlpha: 'premultiply' })
      stills.set(mediaId, bmp)
    }
    return bmp
  }

  const prepare = async (n: number): Promise<Prepared> => {
    const t = ((frames.first + n) * fps.den) / fps.num
    const frame = buildFrame(rp, t)
    const sources = new Map<string, Source>()
    await Promise.all(
      clipLayers(frame).map(async (op) => {
        const r = await api.decode({ jobId, clipId: op.clipId, mediaId: op.mediaId, sourceTime: op.sourceTime, frame: n })
        if (!r.ok) throw new Error(r.error)
        sources.set(op.clipId, await toSource(op.mediaId, r.value))
      })
    )
    return { n, frame, sources }
  }

  // Tiempos acumulados por etapa (se guardan en el registro de la exportación)
  const timings = { 'espera de decodificación': 0, transiciones: 0, composición: 0, 'lectura de píxeles': 0, 'envío al codificador': 0 }
  const lap = (): number => performance.now()
  const inflight: Promise<void>[] = []
  const settle = async (p: Promise<{ ok: boolean; error?: string }>): Promise<void> => {
    const r = await p
    if (!r.ok) throw new Error(r.error ?? 'El codificador falló.')
  }

  // Precarga: los frames fuente de los siguientes instantes se piden con antelación (la transferencia solapa la composición)
  const ahead: Promise<Prepared>[] = []
  let issued = 0
  const topUp = (current: number): void => {
    while (issued < frames.count && issued <= current + PREFETCH) {
      const p = prepare(issued++)
      p.catch(() => undefined)
      ahead.push(p)
    }
  }

  // Lectura de píxeles asíncrona con dos PBO: la GPU copia el frame n mientras se compone el n+1
  const bytes = pixels.length
  const pbos = [gl.createBuffer(), gl.createBuffer()] as WebGLBuffer[]
  for (const b of pbos) {
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, b)
    gl.bufferData(gl.PIXEL_PACK_BUFFER, bytes, gl.STREAM_READ)
  }
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
  const startRead = (n: number): void => {
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbos[n % 2] as WebGLBuffer)
    if (yuv) yuv.readInto()
    else gl.readPixels(0, 0, size.width, size.height, gl.RGBA, gl.UNSIGNED_BYTE, 0)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
  }
  const collect = async (n: number): Promise<void> => {
    let t0 = lap()
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbos[n % 2] as WebGLBuffer)
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixels)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
    timings['lectura de píxeles'] += (lap() - t0) / 1000
    t0 = lap()
    // La invocación IPC serializa los datos al momento de llamar: `pixels` se puede reutilizar enseguida.
    inflight.push(settle(api.pushFrame(jobId, frameBytes === pixels.length ? pixels : pixels.subarray(0, frameBytes))))
    if (inflight.length >= MAX_INFLIGHT) await inflight.shift()
    timings['envío al codificador'] += (lap() - t0) / 1000
  }
  for (let n = 0; n < frames.count; n++) {
    let t0 = lap()
    topUp(n)
    const cur = await (ahead.shift() as Promise<Prepared>)
    topUp(n)
    timings['espera de decodificación'] += (lap() - t0) / 1000
    t0 = lap()

    // Display lists de las transiciones (el worker las calcula; en exportación un error detiene el proceso)
    for (const op of cur.frame.ops) {
      if (op.kind !== 'transition') continue
      if (!transitionHost.info(op.ref)) continue // transición que falta: corte seco
      let dl = null
      let failure: string | null = null
      try {
        dl = await transitionHost.displayList(op as TransitionOp, env)
      } catch (e) {
        failure = e instanceof Error ? e.message : String(e)
      }
      if (!dl) {
        const info = transitionHost.info(op.ref)
        const why = failure ?? errors.get(op.ref) ?? info?.error?.message ?? info?.disabled ?? 'no se pudo calcular el frame'
        const at = formatTimecode(cur.frame.time, fps.num, fps.den)
        throw new Error(`La transición "${names.get(op.ref) ?? op.ref}" falló en ${at}: ${why}`)
      }
    }

    timings.transiciones += (lap() - t0) / 1000
    t0 = lap()
    compositor.draw(
      cur.frame,
      (op) => cur.sources.get(op.clipId) ?? null,
      (op) => transitionHost.peek(op, env)
    )
    compositor.prune(new Set(cur.sources.keys()))
    yuv?.convert()
    timings.composición += (lap() - t0) / 1000
    startRead(n)
    if (n > 0) await collect(n - 1)

    if ((n + 1) % 5 === 0 || n + 1 === frames.count) {
      let thumb: string | undefined
      if (thumbCtx && (n % THUMB_EVERY === 0 || n + 1 === frames.count)) {
        thumbCtx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height)
        thumb = thumbCanvas.toDataURL('image/jpeg', 0.6)
      }
      api.progress(jobId, n + 1, thumb)
    }
  }
  if (frames.count > 0) await collect(frames.count - 1)
  await Promise.all(inflight)
  transitionHost.dispose()
  const done = await api.finish(jobId, timings)
  if (!done.ok) throw new Error(done.error)
}
