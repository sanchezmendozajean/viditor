import { spawn, execFile, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, createWriteStream, type WriteStream } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { BrowserWindow, shell, type WebContents } from 'electron'
import {
  buildEncoderArgs,
  CODEC_INFO,
  encoderName,
  exportFrames,
  exportProject,
  HW_SUPPORT,
  outputFps,
  outputSize,
  stdinFormat,
  type StdinFormat,
  type DecodedFrame,
  type DecodeRequest,
  type ExportCapabilities,
  type ExportJobData,
  type ExportOptions,
  type ExportProgress,
  type HwKind,
  type VideoCodec
} from '@shared/export-model'
import { IPC } from '@shared/ipc'
import type { AudioMode } from '@shared/transition-model'
import { sourceSize } from '@shared/render-model'
import type { Project } from '@shared/project-schema'
import { hardenWindow } from '../security'
import { FrameDecoderPool } from './frame-decoder'
import { mixAudio, MIX_SAMPLE_RATE } from './audio-mix'
import { resolveBinary } from './paths'
import type { ProjectService } from './project-service'

interface Job {
  id: string
  win: BrowserWindow
  notify: WebContents
  project: Project
  options: ExportOptions
  dir: string
  abort: AbortController
  work: string
  partial: string
  encoder: ChildProcess | null
  encoderName: string
  encoderError: string
  /** Diagnóstico: tiempo que el codificador tuvo el pipe lleno (contrapresión) y en tratar los frames, en ms */
  stats: { drainMs: number; pushMs: number; decodeMs: number; frames: number }
  encoderExited: Promise<number | null> | null
  pool: FrameDecoderPool | null
  log: WriteStream | null
  frames: { first: number; count: number }
  startedAt: number
  videoStartedAt: number
  finished: boolean
}

const rawProbe = (ffmpeg: string, args: string[]): Promise<boolean> =>
  new Promise((resolve) => {
    execFile(ffmpeg, args, { windowsHide: true, timeout: 20000 }, (err) => resolve(!err))
  })

/**
 * Orquesta la exportación (specs/06): abre una ventana oculta del renderer con el mismo motor (compositor +
 * transiciones), le sirve los frames decodificados con FFmpeg, recibe los frames compuestos y los envía al
 * codificador. El audio se mezcla antes con las mismas funciones de ganancia que la vista previa.
 */
export class ExportService {
  private jobs = new Map<string, Job>()
  private caps: ExportCapabilities | null = null

  constructor(private readonly projects: ProjectService) {}

  get active(): boolean {
    return [...this.jobs.values()].some((j) => !j.finished)
  }

  // ───────── Aceleración por hardware ─────────

  async capabilities(): Promise<ExportCapabilities> {
    if (this.caps) return this.caps
    const ffmpeg = await resolveBinary('ffmpeg')
    const hw: ExportCapabilities['hw'] = {}
    for (const codec of ['h264', 'h265'] as VideoCodec[]) {
      const ok: HwKind[] = []
      for (const kind of HW_SUPPORT[codec]) {
        if (kind === 'amf' && process.platform !== 'win32') continue
        if (kind === 'vaapi' && process.platform !== 'linux') continue
        if (kind === 'qsv' && process.platform === 'darwin') continue
        const vaapi = kind === 'vaapi' ? ['-vaapi_device', '/dev/dri/renderD128'] : []
        const vf = kind === 'vaapi' ? ['-vf', 'format=nv12,hwupload'] : ['-pix_fmt', kind === 'qsv' ? 'nv12' : 'yuv420p']
        const enc = encoderName(codec, kind)
        const passed = await rawProbe(ffmpeg, ['-v', 'error', ...vaapi, '-f', 'lavfi', '-i', 'color=c=black:s=256x256:d=0.2:r=10', ...vf, '-c:v', enc, '-f', 'null', '-'])
        if (passed) ok.push(kind)
      }
      hw[codec] = ok
    }
    this.caps = { hw, platform: process.platform }
    return this.caps
  }

  private async chooseHw(o: ExportOptions): Promise<HwKind | null> {
    if (o.hw === 'none' || HW_SUPPORT[o.codec].length === 0) return null
    const caps = await this.capabilities()
    const available = caps.hw[o.codec] ?? []
    if (o.hw === 'auto') return available[0] ?? null
    if (!available.includes(o.hw)) throw new Error(`La aceleración ${o.hw.toUpperCase()} no está disponible en este equipo para ${CODEC_INFO[o.codec].label}.`)
    return o.hw
  }

  // ───────── Ciclo de vida ─────────

  /** Ruta por defecto: renders/<Nombre>.<ext> (sin sobrescribir: añade « (2)»…). */
  defaultOutput(name: string, ext: string): string {
    const dir = this.projects.dir
    if (!dir) throw new Error('No hay un proyecto abierto.')
    const safe = name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || 'Proyecto'
    const folder = join(dir, 'renders')
    let out = join(folder, `${safe}.${ext}`)
    for (let i = 2; existsSync(out); i++) out = join(folder, `${safe} (${i}).${ext}`)
    return out
  }

  async start(notify: WebContents, project: Project, options: ExportOptions): Promise<string> {
    if (this.active) throw new Error('Ya hay una exportación en curso.')
    const dir = this.projects.dir
    if (!dir) throw new Error('No hay un proyecto abierto.')
    const used = new Set(project.clips.filter((c) => c.enabled).map((c) => c.mediaId))
    for (const m of project.media) {
      if (used.has(m.id) && !existsSync(this.projects.resolveMediaPath(dir, m.path))) {
        throw new Error(`Falta el archivo de "${basename(m.path)}". Revincúlalo antes de exportar.`)
      }
    }
    const frames = exportFrames(project, options)
    if (frames.count <= 0) throw new Error('No hay nada que exportar: la línea de tiempo está vacía o el rango es nulo.')
    await mkdir(dirname(options.outputPath), { recursive: true })

    const id = randomUUID()
    const work = join(tmpdir(), `viditor-export-${id}`)
    mkdirSync(work, { recursive: true })
    const win = new BrowserWindow({
      show: false,
      width: 640,
      height: 360,
      title: 'Viditor — exportación',
      webPreferences: {
        preload: join(import.meta.dirname, '../preload/index.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required'
      }
    })
    hardenWindow(win, 'viditor-app://')
    const job: Job = {
      id,
      win,
      notify,
      project,
      options,
      dir,
      abort: new AbortController(),
      work,
      partial: `${options.outputPath}.partial`,
      encoder: null,
      encoderName: '',
      encoderError: '',
      stats: { drainMs: 0, pushMs: 0, decodeMs: 0, frames: 0 },
      encoderExited: null,
      pool: null,
      log: null,
      frames,
      startedAt: Date.now(),
      videoStartedAt: 0,
      finished: false
    }
    this.jobs.set(id, job)
    win.on('closed', () => {
      if (!job.finished) void this.fail(job, 'La ventana de exportación se cerró inesperadamente.')
    })
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    void win.loadURL(`${devUrl ?? 'viditor-app://app/index.html'}#export=${id}`)
    this.emit(job, { phase: 'audio', frame: 0, total: frames.count })
    return id
  }

  private emit(job: Job, p: Partial<ExportProgress> & Pick<ExportProgress, 'phase' | 'frame' | 'total'>): void {
    if (job.notify.isDestroyed()) return
    const elapsed = (Date.now() - job.startedAt) / 1000
    const msg: ExportProgress = { jobId: job.id, fps: 0, etaSeconds: null, elapsedSeconds: elapsed, ...p }
    job.notify.send(IPC.exportProgress, msg)
  }

  private owned(sender: WebContents, jobId: string): Job {
    const job = this.jobs.get(jobId)
    if (!job || job.win.isDestroyed() || job.win.webContents !== sender) throw new Error('Trabajo de exportación no válido.')
    return job
  }

  /** La ventana de exportación pide los datos del trabajo. */
  data(sender: WebContents, jobId: string): ExportJobData {
    const job = this.owned(sender, jobId)
    return { jobId, project: job.project, options: job.options, dir: job.dir }
  }

  /** Mezcla el audio, arranca el codificador y prepara los decodificadores. */
  async begin(sender: WebContents, jobId: string, modes: Record<string, AudioMode | undefined>): Promise<{ encoder: string; input: StdinFormat }> {
    const job = this.owned(sender, jobId)
    const { project, options } = job
    const { project: rp, canvas } = exportProject(project, options)
    const fps = outputFps(project, options)

    const logFile = join(job.dir, '.viditor', 'logs', `export-${new Date().toISOString().replace(/[:.]/g, '-')}.log`)
    await mkdir(dirname(logFile), { recursive: true })
    job.log = createWriteStream(logFile, { flags: 'a' })
    job.log.write(`Viditor — exportación ${new Date().toISOString()}\nSalida: ${options.outputPath}\n${canvas.width}x${canvas.height} @ ${fps.num}/${fps.den}, ${job.frames.count} fotogramas\n`)

    // 1) Audio (mismas ganancias que la vista previa)
    const audioPath = join(job.work, 'audio.f32')
    const startSec = (job.frames.first * fps.den) / fps.num
    const endSec = ((job.frames.first + job.frames.count) * fps.den) / fps.num
    const hasAudio = await mixAudio({
      project: rp,
      start: startSec,
      end: endSec,
      modes,
      resolvePath: (m) => this.projects.resolveMediaPath(job.dir, m.path),
      out: audioPath,
      onProgress: (f) => this.emit(job, { phase: 'audio', frame: Math.round(f * job.frames.count), total: job.frames.count }),
      signal: job.abort.signal
    })
    job.log.write(hasAudio ? 'Audio mezclado.\n' : 'Sin audio.\n')

    // 2) Codificador
    const hw = await this.chooseHw(options)
    job.encoderName = encoderName(options.codec, hw)
    const input = stdinFormat(options.codec, hw)
    job.log.write(`Entrada del codificador: ${input === 'yuv420p' ? 'YUV 4:2:0 convertido en la GPU' : 'RGBA (conversión en FFmpeg)'}
`)
    const args = buildEncoderArgs({
      codec: options.codec,
      hw,
      width: canvas.width,
      height: canvas.height,
      fps,
      quality: options.quality,
      bitrateKbps: options.bitrateKbps,
      audioPath: hasAudio ? audioPath : null,
      sampleRate: MIX_SAMPLE_RATE,
      outputPath: job.partial,
      input
    })
    const ffmpeg = await resolveBinary('ffmpeg')
    job.log.write(`$ ${ffmpeg} ${args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}\n`)
    const enc = spawn(ffmpeg, args, { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] })
    job.encoder = enc
    enc.stderr?.on('data', (c: Buffer) => {
      const s = c.toString()
      job.log?.write(s)
      job.encoderError = (job.encoderError + s).slice(-1500)
    })
    enc.stdin?.on('error', () => undefined) // se informa con el código de salida
    job.encoderExited = new Promise((resolve) => {
      enc.on('close', (code) => resolve(code))
      enc.on('error', (e) => {
        job.encoderError += e.message
        resolve(-1)
      })
    })

    // 3) Decodificadores: medios originales a su tamaño nativo
    job.pool = new FrameDecoderPool(fps.num / fps.den, (mediaId) => {
      const m = project.media.find((x) => x.id === mediaId)
      if (!m || m.kind === 'audio') return null
      const [w, h] = sourceSize(m, project.settings)
      return { file: this.projects.resolveMediaPath(job.dir, m.path), width: w, height: h, kind: m.kind === 'image' ? 'image' : 'video' }
    })
    job.videoStartedAt = Date.now()
    return { encoder: job.encoderName, input }
  }

  async decode(sender: WebContents, req: DecodeRequest): Promise<DecodedFrame> {
    const job = this.owned(sender, req.jobId)
    if (!job.pool) throw new Error('El exportador aún no está listo.')
    const clip = job.project.clips.find((c) => c.id === req.clipId)
    const t0 = performance.now()
    try {
      return await job.pool.decode(req.clipId, req.mediaId, req.sourceTime, clip?.speed || 1, req.frame)
    } finally {
      job.stats.decodeMs += performance.now() - t0
    }
  }

  /** Escribe un frame RGBA en el codificador, respetando la contrapresión. */
  async pushFrame(sender: WebContents, jobId: string, data: Uint8Array): Promise<void> {
    const job = this.owned(sender, jobId)
    const stdin = job.encoder?.stdin
    if (!stdin || stdin.destroyed) throw new Error(`El codificador se detuvo: ${job.encoderError.trim() || 'sin detalles'}`)
    const t0 = performance.now()
    job.stats.frames++
    const ok = stdin.write(Buffer.from(data.buffer, data.byteOffset, data.byteLength))
    job.stats.pushMs += performance.now() - t0
    if (!ok) {
      const w0 = performance.now()
      await new Promise<void>((resolve, reject) => {
        const onDrain = (): void => {
          cleanup()
          resolve()
        }
        const onClose = (): void => {
          cleanup()
          reject(new Error(`El codificador se detuvo: ${job.encoderError.trim() || 'sin detalles'}`))
        }
        const cleanup = (): void => {
          stdin.off('drain', onDrain)
          stdin.off('close', onClose)
        }
        stdin.once('drain', onDrain)
        stdin.once('close', onClose)
      })
      job.stats.drainMs += performance.now() - w0
    }
  }

  progress(sender: WebContents, jobId: string, frame: number, thumb?: string): void {
    const job = this.owned(sender, jobId)
    const elapsed = (Date.now() - job.videoStartedAt) / 1000
    const fps = elapsed > 0.5 ? frame / elapsed : 0
    const remaining = job.frames.count - frame
    this.emit(job, { phase: 'video', frame, total: job.frames.count, fps, etaSeconds: fps > 0 ? remaining / fps : null, thumb, encoder: job.encoderName })
  }

  async finish(sender: WebContents, jobId: string, timings?: Record<string, number>): Promise<void> {
    const job = this.owned(sender, jobId)
    if (timings) job.log?.write(`Tiempos (s): ${Object.entries(timings).map(([k, v]) => `${k} ${Number(v).toFixed(2)}`).join(', ')}
`)
    job.log?.write(`Diagnóstico del codificador (s): pipe lleno ${(job.stats.drainMs / 1000).toFixed(2)}, escritura ${(job.stats.pushMs / 1000).toFixed(2)}, decodificación en main ${(job.stats.decodeMs / 1000).toFixed(2)}, frames ${job.stats.frames}
`)
    job.encoder?.stdin?.end()
    const code = await job.encoderExited
    job.pool?.dispose()
    if (job.abort.signal.aborted || job.finished) return
    if (code !== 0) {
      await this.fail(job, `FFmpeg terminó con código ${code}. ${job.encoderError.trim()}`)
      return
    }
    await rm(job.options.outputPath, { force: true })
    await rename(job.partial, job.options.outputPath)
    job.finished = true
    job.log?.write('Exportación terminada.\n')
    const total = (Date.now() - job.startedAt) / 1000
    this.emit(job, { phase: 'done', frame: job.frames.count, total: job.frames.count, outputPath: job.options.outputPath, encoder: job.encoderName, elapsedSeconds: total })
    this.cleanup(job)
    if (job.options.after === 'folder') shell.showItemInFolder(job.options.outputPath)
    else if (job.options.after === 'play') void shell.openPath(job.options.outputPath)
  }

  /** Error notificado por la ventana (p. ej. una transición falló) o detectado aquí. */
  async failFromWindow(sender: WebContents, jobId: string, message: string): Promise<void> {
    await this.fail(this.owned(sender, jobId), message)
  }

  private async fail(job: Job, message: string): Promise<void> {
    if (job.finished) return
    job.finished = true
    job.abort.abort()
    job.log?.write(`ERROR: ${message}\n`)
    this.emit(job, { phase: 'error', frame: 0, total: job.frames.count, message })
    await this.teardown(job)
  }

  cancel(jobId: string): void {
    const job = this.jobs.get(jobId)
    if (!job || job.finished) return
    job.finished = true
    job.abort.abort()
    job.log?.write('Cancelada por el usuario.\n')
    this.emit(job, { phase: 'cancelled', frame: 0, total: job.frames.count })
    void this.teardown(job)
  }

  private async teardown(job: Job): Promise<void> {
    job.pool?.dispose()
    job.encoder?.stdin?.destroy()
    job.encoder?.kill()
    await Promise.race([job.encoderExited, new Promise((r) => setTimeout(r, 2000))])
    await rm(job.partial, { force: true }).catch(() => undefined)
    this.cleanup(job)
  }

  private cleanup(job: Job): void {
    job.log?.end()
    void rm(job.work, { recursive: true, force: true }).catch(() => undefined)
    if (!job.win.isDestroyed()) job.win.destroy()
    this.jobs.delete(job.id)
  }

  dispose(): void {
    for (const id of [...this.jobs.keys()]) this.cancel(id)
  }
}

