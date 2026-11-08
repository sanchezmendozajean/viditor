import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import ffmpegPath from 'ffmpeg-static'
import ffprobe from 'ffprobe-static'

const root = resolve(import.meta.dirname, '../..')
let work: string
let app: ElectronApplication
let page: Page
let dir: string

function ffmpeg(args: string[]): void {
  execFileSync(ffmpegPath as string, ['-v', 'error', '-y', ...args], { stdio: 'pipe' })
}
function probe(file: string): { streams: { codec_type: string; codec_name: string; width?: number; height?: number; r_frame_rate?: string; pix_fmt?: string; color_space?: string; color_range?: string }[]; format: { duration: string } } {
  return JSON.parse(execFileSync(ffprobe.path, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file], { encoding: 'utf8' }))
}
/** Frame `n` del archivo como RGB24 crudo. */
function frameRgb(file: string, n: number, w: number, h: number): Buffer {
  return execFileSync(ffmpegPath as string, ['-v', 'error', '-i', file, '-vf', `select=eq(n\\,${n}),scale=${w}:${h}:flags=bicubic`, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], {
    maxBuffer: 1 << 28
  })
}
function diff(a: Buffer, b: Buffer): { max: number; mean: number } {
  expect(a.length).toBe(b.length)
  let max = 0
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs((a[i] as number) - (b[i] as number))
    if (d > max) max = d
    sum += d
  }
  return { max, mean: sum / a.length }
}
const center = (rgb: Buffer, w: number, h: number): [number, number, number] => {
  const o = (Math.floor(h / 2) * w + Math.floor(w / 2)) * 3
  return [rgb[o] as number, rgb[o + 1] as number, rgb[o + 2] as number]
}

async function goTo(tc: string): Promise<void> {
  await page.getByTestId('monitor-tc').click()
  await page.locator('.tc-edit').fill(tc)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('monitor-tc')).toHaveText(tc)
}
const clip = (n: number) => page.getByTestId('row-V1').getByTestId('clip').nth(n)

/** Lienzo del monitor (calidad completa) como RGB24 a 1280×720. */
async function previewRgb(): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => (document.querySelector('[data-testid=monitor-canvas]') as HTMLCanvasElement).toDataURL('image/png'))
  const png = join(work, 'preview.png')
  writeFileSync(png, Buffer.from(dataUrl.split(',')[1] as string, 'base64'))
  return execFileSync(ffmpegPath as string, ['-v', 'error', '-i', png, '-vf', 'scale=1280:720:flags=bicubic', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { maxBuffer: 1 << 28 })
}

async function openExport(): Promise<void> {
  await page.getByTestId('ws-export').click()
  await expect(page.getByTestId('export-form')).toBeVisible()
  // En las pruebas no se abre el explorador de archivos al terminar
  await page.getByTestId('export-after').selectOption('nothing')
}
async function choosePreset(id: string): Promise<void> {
  await page.getByTestId('export-preset').selectOption(id)
  await expect(page.getByTestId('export-path')).toHaveValue(new RegExp(`renders[\\\\/]Export.*\\.${id === 'prores' ? 'mov' : 'mp4'}$`))
}
const jobState = () => page.getByTestId('export-state').first()
async function waitDone(): Promise<void> {
  await expect(page.getByTestId('export-job-done')).toHaveCount(1, { timeout: 180_000 })
  // Captura opcional para revisar el aspecto: VIDITOR_SHOTS=<ruta.png>
  if (process.env.VIDITOR_SHOTS) await page.screenshot({ path: process.env.VIDITOR_SHOTS })
}

test.beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), 'viditor-e2e-ex-'))
  const src = join(work, 'src')
  mkdirSync(src, { recursive: true })
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=30:d=3', '-f', 'lavfi', '-i', 'sine=frequency=440:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', join(src, 'red.mp4')])
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=0x00c800:s=320x180:r=30:d=3', '-f', 'lavfi', '-i', 'sine=frequency=660:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', join(src, 'green.mp4')])

  const env = { ...process.env } as Record<string, string>
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ args: [root, `--user-data-dir=${join(work, 'u')}`], env })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  const parent = join(work, 'projects')
  mkdirSync(parent)
  await page.getByTestId('new-project').click()
  await page.getByTestId('np-name').fill('Export')
  await page.getByTestId('np-dir').fill(parent)
  await page.getByTestId('np-create').click()
  await expect(page.getByTestId('timeline')).toBeVisible()
  dir = join(parent, 'Export')

  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: paths })) as unknown as typeof dialog.showOpenDialog
  }, [join(src, 'red.mp4'), join(src, 'green.mp4')])
  await page.getByTestId('import-btn').click()
  await page.getByTestId('import-reference').check()
  await page.getByTestId('import-confirm').click()
  await expect(page.getByTestId('media-item')).toHaveCount(2)
  await page.getByTestId('media-item').nth(0).dblclick()
  await page.getByTestId('media-preview-insert').click()
  await page.getByText('Insertar al final del contenido').click()
  await page.getByTestId('media-item').nth(1).dblclick()
  await page.getByTestId('media-preview-insert').click()
  await page.getByText('Insertar al final del contenido').click()
  await expect(page.getByTestId('row-V1').getByTestId('clip')).toHaveCount(2)
  // Fundido cruzado de 1 s entre ambos: la secuencia dura 5 s
  await clip(0).click()
  await clip(1).click({ modifiers: ['Control'] })
  await page.keyboard.press('Control+d')
  await expect(page.getByTestId('transition-block')).toHaveCount(1)
})

test.afterAll(async () => {
  await app.close()
  rmSync(work, { recursive: true, force: true })
})

test('exporta un MP4 H.264 con la transición y el audio, y deja el registro', async () => {
  await openExport()
  await choosePreset('whatsapp-720')
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-job-video').or(page.getByTestId('export-job-audio')).or(page.getByTestId('export-job-done'))).toBeVisible({ timeout: 30_000 })
  await waitDone()

  const out = join(dir, 'renders', 'Export.mp4')
  expect(existsSync(out)).toBe(true)
  expect(existsSync(`${out}.partial`)).toBe(false)
  const info = probe(out)
  const v = info.streams.find((s) => s.codec_type === 'video')!
  const a = info.streams.find((s) => s.codec_type === 'audio')!
  expect(v.codec_name).toBe('h264')
  expect([v.width, v.height]).toEqual([1280, 720])
  expect(v.r_frame_rate).toBe('30/1')
  expect(a.codec_name).toBe('aac')
  expect(Number(info.format.duration)).toBeGreaterThan(4.9)
  expect(Number(info.format.duration)).toBeLessThan(5.2)

  // Rojo al principio, verde al final, mezcla en mitad de la transición (2,5 s)
  const [r0, g0] = center(frameRgb(out, 15, 1280, 720), 1280, 720)
  expect(r0).toBeGreaterThan(200)
  expect(g0).toBeLessThan(70)
  const [r2, g2] = center(frameRgb(out, 148, 1280, 720), 1280, 720)
  expect(g2).toBeGreaterThan(150)
  expect(r2).toBeLessThan(70)
  const [rm, gm] = center(frameRgb(out, 75, 1280, 720), 1280, 720)
  expect(rm).toBeGreaterThan(60)
  expect(gm).toBeGreaterThan(60)

  // Registro con el comando de FFmpeg
  const logs = readdirSync(join(dir, '.viditor', 'logs')).filter((f) => f.startsWith('export-'))
  expect(logs.length).toBeGreaterThan(0)
  expect(readFileSync(join(dir, '.viditor', 'logs', logs[0] as string), 'utf8')).toMatch(/libx264|h264_(nvenc|qsv|amf)/)

  // El audio exportado suena (no es silencio): el RMS del primer segundo es apreciable
  const pcm = execFileSync(ffmpegPath as string, ['-v', 'error', '-i', out, '-t', '1', '-vn', '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1'], { maxBuffer: 1 << 26 })
  let sum = 0
  for (let i = 0; i + 1 < pcm.length; i += 2) sum += pcm.readInt16LE(i) ** 2
  expect(Math.sqrt(sum / (pcm.length / 2))).toBeGreaterThan(300)
})

test('la exportación coincide con la vista previa a calidad completa (ProRes, con transición)', async () => {
  await openExport()
  await page.getByTestId('export-preset').selectOption('prores')
  await expect(page.getByTestId('export-path')).toHaveValue(/\.mov$/)
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-job-done')).toHaveCount(2, { timeout: 240_000 })

  const out = join(dir, 'renders', 'Export.mov')
  expect(existsSync(out)).toBe(true)
  const v = probe(out).streams.find((s) => s.codec_type === 'video')!
  expect(v.codec_name).toBe('prores')
  expect([v.width, v.height]).toEqual([1920, 1080])

  const report: string[] = []
  for (const [tc, n] of [['00:00:01:00', 30], ['00:00:02:15', 75], ['00:00:04:00', 120]] as const) {
    await page.getByTestId('ws-edit').click()
    await goTo(tc)
    await page.waitForTimeout(700) // el monitor renderiza el frame exacto a calidad completa
    const preview = await previewRgb()
    const exported = frameRgb(out, n, 1280, 720)
    const d = diff(preview, exported)
    report.push(`${tc}: máx ${d.max}, media ${d.mean.toFixed(3)}`)
    // Mismo compositor y mismas display lists: la única diferencia es la conversión de color del decodificador
    expect(d.mean, report.join(" | ")).toBeLessThan(1.5)
    expect(d.max, report.join(' | ')).toBeLessThanOrEqual(2)
  }
  console.log('Paridad vista previa ↔ exportación:', report.join(' | '))
})

test('H.264 con conversión YUV en la GPU: coincide con la vista previa y el registro lo indica', async () => {
  await openExport()
  await choosePreset('youtube-1080')
  await page.getByTestId('export-quality').fill('100')
  const out = await page.getByTestId('export-path').inputValue()
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-job-done')).toHaveCount(3, { timeout: 240_000 })
  const v = probe(out).streams.find((s) => s.codec_type === 'video')!
  expect(v.codec_name).toBe('h264')
  expect(v.pix_fmt).toBe('yuv420p')
  expect(v.color_space).toBe('bt709')
  expect(v.color_range).toBe('tv')

  const report: string[] = []
  for (const [tc, n] of [['00:00:01:00', 30], ['00:00:02:15', 75], ['00:00:04:00', 120]] as const) {
    await page.getByTestId('ws-edit').click()
    await goTo(tc)
    await page.waitForTimeout(700)
    const d = diff(await previewRgb(), frameRgb(out, n, 1280, 720))
    report.push(`${tc}: máx ${d.max}, media ${d.mean.toFixed(3)}`)
    // Una conversión de color mal hecha (matriz, rango o filas volteadas) daría decenas de niveles de diferencia
    expect(d.mean, report.join(' | ')).toBeLessThan(2.5)
    expect(d.max, report.join(' | ')).toBeLessThanOrEqual(12)
  }
  console.log('Paridad H.264 (YUV en GPU):', report.join(' | '))
  const logs = readdirSync(join(dir, '.viditor', 'logs')).filter((f) => f.startsWith('export-')).sort()
  expect(readFileSync(join(dir, '.viditor', 'logs', logs.at(-1) as string), 'utf8')).toContain('convertido en la GPU')
})

test('Cancelar borra el archivo parcial y no deja salida', async () => {
  await openExport()
  await page.getByTestId('export-preset').selectOption('prores')
  // Un nombre distinto para no chocar con la exportación anterior
  await page.getByTestId('export-path').fill(join(dir, 'renders', 'cancelada.mov'))
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-cancel')).toBeVisible()
  await page.getByTestId('export-cancel').click()
  await expect(page.getByTestId('export-job-cancelled')).toHaveCount(1, { timeout: 20_000 })
  await page.waitForTimeout(800)
  expect(existsSync(join(dir, 'renders', 'cancelada.mov'))).toBe(false)
  expect(existsSync(join(dir, 'renders', 'cancelada.mov.partial'))).toBe(false)
})

test('una transición que falla detiene la exportación e indica cuál y cuándo', async () => {
  mkdirSync(join(dir, 'transitions'), { recursive: true })
  writeFileSync(
    join(dir, 'transitions', 'boom.js'),
    `const meta = { apiVersion: 1, id: "boom", name: "Explosiva", category: "Personalizadas", defaultDuration: 1, audio: "crossfade", params: {} };
function render(leaveClip, enterClip, progress, ctx) {
  if (progress > 0.5) throw new Error("falla a propósito");
  leaveClip.alpha(1 - progress);
}
`
  )
  await page.getByTestId('ws-edit').click()
  await page.getByTestId('ptab-transitions').first().click()
  await expect(page.getByTestId('tcard-project:boom')).toBeVisible({ timeout: 15_000 })
  // Se sustituye el fundido por la transición que falla
  await page.getByTestId('transition-block').click()
  await page.keyboard.press('Delete')
  await expect(page.getByTestId('transition-block')).toHaveCount(0)
  await clip(0).click()
  await clip(1).click({ modifiers: ['Control'] })
  await page.getByTestId('tcard-project:boom').dblclick()
  await expect(page.getByTestId('transition-block')).toContainText('Explosiva')

  await openExport()
  await page.getByTestId('export-preset').selectOption('whatsapp-720')
  await page.getByTestId('export-path').fill(join(dir, 'renders', 'fallida.mp4'))
  await page.getByTestId('export-start').click()
  const err = page.getByTestId('export-error').first()
  await expect(err).toBeVisible({ timeout: 60_000 })
  await expect(err).toContainText('Explosiva')
  await expect(err).toContainText('falla a propósito')
  await expect(err).toContainText(/00:00:0[2-4]:\d\d/)
  await page.waitForTimeout(600)
  expect(existsSync(join(dir, 'renders', 'fallida.mp4'))).toBe(false)
  expect(existsSync(join(dir, 'renders', 'fallida.mp4.partial'))).toBe(false)
  void jobState
  void choosePreset
})

test('rendimiento: mide la exportación 1080p30 con transición (x264, sin hardware)', async () => {
  const src = join(work, 'src')
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=s=1920x1080:r=30:d=8', '-f', 'lavfi', '-i', 'sine=frequency=330:d=8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', join(src, 'hd1.mp4')])
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc=s=1920x1080:r=30:d=8', '-f', 'lavfi', '-i', 'sine=frequency=550:d=8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', join(src, 'hd2.mp4')])
  await page.getByTestId('ws-edit').click()
  // Se parte de una línea de tiempo limpia: se borran los clips anteriores
  await page.getByTestId('row-V1').getByTestId('clip').first().click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Delete')
  await expect(page.getByTestId('row-V1').getByTestId('clip')).toHaveCount(0)
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: paths })) as unknown as typeof dialog.showOpenDialog
  }, [join(src, 'hd1.mp4'), join(src, 'hd2.mp4')])
  await page.locator('[data-testid=ptab-project]:visible').click()
  await page.getByTestId('import-btn').click()
  await page.getByTestId('import-reference').check()
  await page.getByTestId('import-confirm').click()
  await expect(page.getByTestId('media-item')).toHaveCount(4)
  await page.getByTestId('media-item').nth(2).dblclick()
  await page.getByTestId('media-preview-insert').click()
  await page.getByText('Insertar al final del contenido').click()
  await page.getByTestId('media-item').nth(3).dblclick()
  await page.getByTestId('media-preview-insert').click()
  await page.getByText('Insertar al final del contenido').click()
  await expect(page.getByTestId('row-V1').getByTestId('clip')).toHaveCount(2)
  await clip(0).click()
  await clip(1).click({ modifiers: ['Control'] })
  await page.keyboard.press('Control+d')
  await expect(page.getByTestId('transition-block')).toHaveCount(1)

  await openExport()
  await page.getByTestId('export-preset').selectOption('youtube-1080')
  await page.getByTestId('export-hw').selectOption('none') // sin codificador por hardware
  await page.getByTestId('export-path').fill(join(dir, 'renders', 'rendimiento.mp4'))
  await page.getByTestId('export-clear').click({ timeout: 2000 }).catch(() => undefined) // solo queda la exportación que se mide
  const t0 = Date.now()
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-job-done')).toHaveCount(1, { timeout: 240_000 })
  const seconds = (Date.now() - t0) / 1000
  const out = join(dir, 'renders', 'rendimiento.mp4')
  const dur = Number(probe(out).format.duration)
  const logsDir = join(dir, '.viditor', 'logs')
  for (const f of readdirSync(logsDir)) {
    const t = readFileSync(join(logsDir, f), 'utf8')
    if (t.includes('rendimiento.mp4')) console.log(t.split('\n').filter((l) => l.startsWith('Tiempos') || l.startsWith('Diagnóstico')).join('\n'))
  }
  console.log(`Rendimiento 1080p30 (x264, sin hardware): ${dur.toFixed(1)} s de vídeo en ${seconds.toFixed(1)} s → ${(dur / seconds).toFixed(2)}× tiempo real`)
  expect(dur).toBeGreaterThan(14)
  expect(dur / seconds).toBeGreaterThan(0.3) // cota baja y estable en CI; el valor real se imprime arriba
})

test('contenido con textura y barras de color: el YUV nativo + GPU coincide con la decodificación de referencia de FFmpeg', async () => {
  // Sigue el proyecto de la prueba de rendimiento: hd1 (testsrc2) de 0–8 s y hd2 (barras de color) de 7–15 s (1 s de transición).
  // La referencia es FFmpeg decodificando el original (BT.709), sin pasar por la vista previa, cuyo vídeo en movimiento
  // puede diferir en un frame: comprueba la matriz de color, el rango y el submuestreo de croma.
  await openExport()
  await page.getByTestId('export-preset').selectOption('prores')
  await page.getByTestId('export-path').fill(join(dir, 'renders', 'textura.mov'))
  await page.getByTestId('export-clear').click({ timeout: 2000 }).catch(() => undefined)
  await page.getByTestId('export-start').click()
  await expect(page.getByTestId('export-job-done')).toHaveCount(1, { timeout: 240_000 })
  const out = join(dir, 'renders', 'textura.mov')
  const ref = (file: string, n: number): Buffer =>
    execFileSync(ffmpegPath as string, ['-v', 'error', '-i', file, '-vf', `select=eq(n\\,${n}),scale=1280:720:flags=bicubic:in_color_matrix=bt709`, '-frames:v', '1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { maxBuffer: 1 << 28 })
  const report: string[] = []
  for (const [file, srcFrame, n] of [['hd1.mp4', 60, 60], ['hd2.mp4', 150, 360]] as const) {
    const d = diff(ref(join(work, 'src', file), srcFrame), frameRgb(out, n, 1280, 720))
    report.push(`${file} frame ${n}: máx ${d.max}, media ${d.mean.toFixed(3)}`)
    expect(d.mean, report.join(' | ')).toBeLessThan(2)
  }
  console.log('Referencia FFmpeg:', report.join(' | '))
})
