import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import ffmpegPath from 'ffmpeg-static'

const root = resolve(import.meta.dirname, '../..')
let work: string
let app: ElectronApplication
let page: Page
let vdproj: string
let videos: string[] = []

function makeVideo(file: string, color: string, seconds: number): void {
  execFileSync(
    ffmpegPath as string,
    ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=320x180:r=30:d=${seconds}`, '-f', 'lavfi', '-i', `sine=frequency=440:d=${seconds}`,
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file],
    { stdio: 'pipe' }
  )
}

const row = (name: string): Locator => page.getByTestId(`row-${name}`)
const clipsIn = (name: string): Locator => row(name).getByTestId('clip')
const saved = (): { tracks: { name: string }[]; clips: { start: number; in: number; out: number; trackId: string; id: string }[] } =>
  JSON.parse(readFileSync(vdproj, 'utf8'))

async function save(): Promise<void> {
  await page.keyboard.press('Control+s')
  await expect(page.getByTestId('statusbar')).toContainText('Guardado')
  await page.waitForTimeout(150)
}

test.beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), 'viditor-e2e-tl-'))
  const src = join(work, 'src')
  mkdirSync(src, { recursive: true })
  videos = ['red', 'green', 'blue', 'yellow', 'purple'].map((c, i) => {
    const f = join(src, `clip${i + 1}.mp4`)
    makeVideo(f, c, 3)
    return f
  })

  const env = { ...process.env } as Record<string, string>
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ args: [root, `--user-data-dir=${join(work, 'u')}`], env })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  const parent = join(work, 'projects')
  mkdirSync(parent)
  await page.getByTestId('new-project').click()
  await page.getByTestId('np-name').fill('Secuencia')
  await page.getByTestId('np-dir').fill(parent)
  await page.getByTestId('np-create').click()
  await expect(page.getByTestId('timeline')).toBeVisible()
  vdproj = join(parent, 'Secuencia', 'Secuencia.vdproj')

  // Importar los 5 videos (dejar en su ubicación)
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: paths })) as unknown as typeof dialog.showOpenDialog
  }, videos)
  await page.getByTestId('import-btn').click()
  await page.getByTestId('import-reference').check()
  await page.getByTestId('import-confirm').click()
  await expect(page.getByTestId('media-item')).toHaveCount(5)
})

test.afterAll(async () => {
  await app.close()
  rmSync(work, { recursive: true, force: true })
})

test('secuencia de 5 clips editada con teclado y mouse', async () => {
  // Agregar al final con doble clic (5 clips contiguos en V1)
  const items = page.getByTestId('media-item')
  for (let i = 0; i < 5; i++) await items.nth(i).dblclick()
  await expect(clipsIn('V1')).toHaveCount(5)
  await save()
  const starts = saved().clips.map((c) => c.start).sort((a, b) => a - b)
  expect(starts.map((s) => Math.round(s * 100) / 100)).toEqual([0, 3, 6, 9, 12])

  // Mouse: mover el 2.º clip de V1 a V2 (otra pista de video)
  const second = clipsIn('V1').nth(1)
  const b = (await second.boundingBox())!
  const v2 = (await row('V2').getByTestId('lane').boundingBox())!
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2 + 5, b.y + b.height / 2 - 20, { steps: 4 })
  await page.mouse.move(b.x + b.width / 2 + 5, v2.y + v2.height / 2, { steps: 6 })
  await page.mouse.up()
  await expect(clipsIn('V2')).toHaveCount(1)
  await expect(clipsIn('V1')).toHaveCount(4)

  // Teclado: Ctrl+Z devuelve el clip; Ctrl+Shift+Z lo vuelve a mover
  await page.keyboard.press('Control+z')
  await expect(clipsIn('V1')).toHaveCount(5)
  await page.keyboard.press('Control+Shift+z')
  await expect(clipsIn('V2')).toHaveCount(1)
  await page.keyboard.press('Control+z')
  await expect(clipsIn('V1')).toHaveCount(5)

  // Mouse: recortar el borde derecho del primer clip 40 px hacia la izquierda
  const first = clipsIn('V1').first()
  const fb = (await first.boundingBox())!
  await page.mouse.move(fb.x + fb.width - 2, fb.y + fb.height / 2)
  await page.mouse.down()
  await page.mouse.move(fb.x + fb.width - 42, fb.y + fb.height / 2, { steps: 5 })
  await page.mouse.up()
  const after = (await first.boundingBox())!
  expect(after.width).toBeLessThan(fb.width - 30)

  // Teclado: ir al inicio, avanzar 30 frames (1 s), dividir con Ctrl+K sobre el clip seleccionado
  await page.keyboard.press('Home')
  for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('monitor-tc')).toHaveText('00:00:01:00')
  await first.click()
  await page.keyboard.press('Control+k')
  await expect(clipsIn('V1')).toHaveCount(6)

  // Eliminar el fragmento derecho con ripple (Mayús+Supr): los siguientes se desplazan
  await clipsIn('V1').nth(1).click()
  await page.keyboard.press('Shift+Delete')
  await expect(clipsIn('V1')).toHaveCount(5)
  await save()
  const s = saved()
  const v1 = s.clips.filter((c) => c.trackId === s.clips[0]!.trackId).sort((a, c) => a.start - c.start)
  // El ripple solo cierra el hueco del clip eliminado (1.47 s): el 2.º clip original pasa de 3 s a ~1.53 s
  expect(v1[1]!.start).toBeGreaterThan(1.45)
  expect(v1[1]!.start).toBeLessThan(1.6)
  // Nada se solapa
  for (let i = 1; i < v1.length; i++) {
    const prev = v1[i - 1]!
    expect(v1[i]!.start).toBeGreaterThanOrEqual(prev.start + (prev.out - prev.in) - 0.001)
  }
})

test('50 deshacer/rehacer consistentes', async () => {
  await save()
  const baseline = saved().clips.length
  await page.getByTestId('lane').first().click({ position: { x: 5, y: 5 } }) // deselecciona
  await page.keyboard.press('Escape')
  await page.keyboard.press('Home')

  // 50 intentos de división en frames sucesivos (sin selección: dividen el clip bajo el cabezal).
  // Los frames que caen en un hueco no hacen nada y no generan comando.
  for (let i = 0; i < 50; i++) {
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Control+k')
  }
  const total = await clipsIn('V1').count()
  const commands = total - baseline
  expect(commands).toBeGreaterThanOrEqual(30)
  await save()
  const full = JSON.stringify(saved().clips)

  for (let i = 0; i < commands; i++) {
    await page.keyboard.press('Control+z')
    await expect(clipsIn('V1')).toHaveCount(total - i - 1)
  }
  await save()
  const base = JSON.stringify(saved().clips)

  for (let i = 0; i < commands; i++) await page.keyboard.press('Control+Shift+z')
  await expect(clipsIn('V1')).toHaveCount(total)
  await save()
  expect(JSON.stringify(saved().clips)).toBe(full)

  for (let i = 0; i < commands; i++) await page.keyboard.press('Control+z')
  await save()
  expect(JSON.stringify(saved().clips)).toBe(base)
})

test('reordenar pistas persiste al cerrar y reabrir', async () => {
  const order = async (): Promise<string[]> =>
    page.locator('[data-testid^="row-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.replace('row-', '')))
  expect((await order()).slice(0, 2)).toEqual(['V2', 'V1'])

  // Arrastrar el asa de V1 por encima de V2
  const grip = (await row('V1').getByTestId('track-grip').boundingBox())!
  const v2 = (await row('V2').boundingBox())!
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(grip.x + 4, v2.y + 4, { steps: 8 })
  await expect(page.getByTestId('insert-line')).toBeVisible()
  await page.mouse.up()
  await expect.poll(async () => (await order()).slice(0, 2)).toEqual(['V1', 'V2'])

  await save()
  expect(saved().tracks.map((t) => t.name).slice(0, 2)).toEqual(['V1', 'V2'])

  await page.getByRole('button', { name: 'Archivo' }).click()
  await page.getByRole('button', { name: 'Cerrar proyecto' }).click()
  await page.getByTestId('recent').locator('.info').click()
  await expect(page.getByTestId('timeline')).toBeVisible()
  expect((await order()).slice(0, 2)).toEqual(['V1', 'V2'])
  await expect(clipsIn('V1').first()).toBeVisible() // los clips también se restauran
})

test('bloquear y ocultar pistas; menú contextual de clip', async () => {
  await row('V2').getByTestId('btn-lock').click()
  await expect(row('V2')).toHaveClass(/locked/)
  await row('V2').getByTestId('btn-lock').click()
  await row('V1').getByTestId('btn-hide').click()
  await expect(row('V1')).toHaveClass(/hidden/)
  await row('V1').getByTestId('btn-hide').click()

  await clipsIn('V1').first().click({ button: 'right' })
  await expect(page.getByTestId('context-menu')).toContainText('Eliminar y cerrar hueco')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('context-menu')).toHaveCount(0)
})
