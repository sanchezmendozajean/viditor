import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import ffmpegPath from 'ffmpeg-static'

const root = resolve(import.meta.dirname, '../..')
let work: string
let app: ElectronApplication
let page: Page
let dir: string

function ffmpeg(args: string[]): void {
  execFileSync(ffmpegPath as string, ['-v', 'error', '-y', ...args], { stdio: 'pipe' })
}

/** Color RGB del píxel (fx, fy normalizados) del lienzo del monitor. */
async function px(fx: number, fy: number): Promise<[number, number, number]> {
  return page.evaluate(
    ([x, y]) =>
      new Promise<[number, number, number]>((res) => {
        const c = document.querySelector('[data-testid=monitor-canvas]') as HTMLCanvasElement
        const img = new Image()
        img.onload = () => {
          const k = document.createElement('canvas')
          k.width = img.width
          k.height = img.height
          const ctx = k.getContext('2d')!
          ctx.drawImage(img, 0, 0)
          const d = ctx.getImageData(Math.floor(x! * img.width), Math.floor(y! * img.height), 1, 1).data
          res([d[0]!, d[1]!, d[2]!])
        }
        img.src = c.toDataURL()
      }),
    [fx, fy] as [number, number]
  )
}
const isRed = (c: number[]): boolean => c[0]! > 200 && c[1]! < 70 && c[2]! < 70
const isGreen = (c: number[]): boolean => c[1]! > 100 && c[0]! < 90 && c[2]! < 90
const isBlack = (c: number[]): boolean => c[0]! < 25 && c[1]! < 25 && c[2]! < 25

async function goTo(tc: string): Promise<void> {
  await page.getByTestId('monitor-tc').click()
  await page.locator('.tc-edit').fill(tc)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('monitor-tc')).toHaveText(tc)
}
async function setScrub(testId: string, value: string): Promise<void> {
  await page.getByTestId(testId).locator('.val').click()
  await page.getByTestId(testId).locator('input').fill(value)
  await page.keyboard.press('Enter')
}
const clip = (n: number) => page.getByTestId('row-V1').getByTestId('clip').nth(n)

test.beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), 'viditor-e2e-pv-'))
  const src = join(work, 'src')
  mkdirSync(src, { recursive: true })
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=30:d=3', '-f', 'lavfi', '-i', 'sine=frequency=440:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', join(src, 'red.mp4')])
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=0x00c800:s=320x180:r=30:d=3', '-f', 'lavfi', '-i', 'sine=frequency=660:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', join(src, 'green.mp4')])
  // ProRes en .mov: Chromium no lo reproduce, así que debe generarse un proxy
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=blue:s=320x180:r=30:d=2', '-c:v', 'prores_ks', '-profile:v', '0', '-pix_fmt', 'yuv422p10le', join(src, 'blue.mov')])

  const env = { ...process.env } as Record<string, string>
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ args: [root, `--user-data-dir=${join(work, 'u')}`], env })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  const parent = join(work, 'projects')
  mkdirSync(parent)
  await page.getByTestId('new-project').click()
  await page.getByTestId('np-name').fill('Preview')
  await page.getByTestId('np-dir').fill(parent)
  await page.getByTestId('np-create').click()
  await expect(page.getByTestId('timeline')).toBeVisible()
  dir = join(parent, 'Preview')

  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: paths })) as unknown as typeof dialog.showOpenDialog
  }, [join(src, 'red.mp4'), join(src, 'green.mp4'), join(src, 'blue.mov')])
  await page.getByTestId('import-btn').click()
  await page.getByTestId('import-reference').check()
  await page.getByTestId('import-confirm').click()
  await expect(page.getByTestId('media-item')).toHaveCount(3)

  // red (0–3 s) y green (3–6 s) en V1
  await page.getByTestId('media-item').nth(0).dblclick()
  await page.getByTestId('media-item').nth(1).dblclick()
  await expect(page.getByTestId('row-V1').getByTestId('clip')).toHaveCount(2)
})

test.afterAll(async () => {
  await app.close()
  rmSync(work, { recursive: true, force: true })
})

test('el monitor compone el vídeo real en cada tiempo (scrubbing)', async () => {
  await goTo('00:00:01:00')
  await expect.poll(async () => isRed(await px(0.5, 0.5)), { timeout: 10_000 }).toBe(true)
  await goTo('00:00:04:00')
  await expect.poll(async () => isGreen(await px(0.5, 0.5)), { timeout: 10_000 }).toBe(true)
  // Scrubbing hacia atrás produce el mismo resultado que hacia delante
  await goTo('00:00:01:00')
  await expect.poll(async () => isRed(await px(0.5, 0.5)), { timeout: 10_000 }).toBe(true)
})

test('Inspector: escala, opacidad, volumen y restablecer afectan al monitor', async () => {
  await goTo('00:00:01:00')
  await clip(0).click()
  await expect(page.getByTestId('group-motion')).toBeVisible()

  // Escala 50 %: el centro sigue rojo y el borde queda con el fondo negro
  await setScrub('scale', '50')
  await expect.poll(async () => isBlack(await px(0.1, 0.5))).toBe(true)
  expect(isRed(await px(0.5, 0.5))).toBe(true)
  // El tamaño en píxeles coincide con la escala (960 × 540 en un proyecto 1920×1080)
  await expect(page.getByTestId('width').locator('.val')).toHaveText('960.0')
  await expect(page.getByTestId('height').locator('.val')).toHaveText('540.0')

  // Posición X = 480 px: el clip se desplaza a la derecha
  await setScrub('pos-x', '480')
  await expect.poll(async () => isBlack(await px(0.3, 0.5))).toBe(true)
  expect(isRed(await px(0.75, 0.5))).toBe(true)

  // Opacidad 50 %: el rojo se mezcla con el fondo negro
  await setScrub('opacity', '50')
  await expect.poll(async () => { const c = await px(0.75, 0.5); return c[0]! > 100 && c[0]! < 160 }).toBe(true)

  // ↺ restablece movimiento
  await page.getByTestId('reset-motion').click()
  await expect.poll(async () => { const c = await px(0.1, 0.5); return c[0]! > 100 && c[0]! < 160 }).toBe(true)

  // Volumen 50 % → −6,0 dB
  await setScrub('volume', '50')
  await expect(page.getByTestId('volume-db')).toHaveText('-6.0 dB')

  // Todo es deshacible
  for (let i = 0; i < 3; i++) await page.keyboard.press('Control+z')
  await expect(page.getByTestId('volume-db')).toHaveText('0.0 dB')
})

test('manipulación directa en el monitor sincroniza el Inspector', async () => {
  await goTo('00:00:01:00')
  await clip(0).click()
  await page.getByTestId('reset-motion').click()
  const box = page.getByTestId('transform-box')
  await expect(box).toBeVisible()

  // Arrastrar el asa de la esquina inferior derecha hacia el centro reduce la escala
  const h = (await page.getByTestId('handle-1-1').boundingBox())!
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
  await page.mouse.down()
  const f = (await page.getByTestId('monitor-frame').boundingBox())!
  await page.mouse.move(f.x + f.width * 0.75, f.y + f.height * 0.75, { steps: 8 })
  await page.mouse.up()
  const scale = Number(((await page.getByTestId('scale').locator('.val').innerText()) || '100').replace(/[^\d.]/g, ''))
  expect(scale).toBeGreaterThan(35)
  expect(scale).toBeLessThan(65)
  // Y el monitor refleja lo mismo que dice el Inspector
  await expect.poll(async () => isBlack(await px(0.05, 0.5))).toBe(true)

  // Arrastrar el interior mueve el clip
  const before = await page.getByTestId('pos-x').locator('.val').innerText()
  const b = (await box.boundingBox())!
  const gx = b.x + b.width * 0.7 // el centro es el punto de anclaje, que se arrastra aparte
  await page.mouse.move(gx, b.y + b.height / 2)
  await page.mouse.down()
  await page.mouse.move(gx + 60, b.y + b.height / 2, { steps: 6 })
  await page.mouse.up()
  expect(await page.getByTestId('pos-x').locator('.val').innerText()).not.toBe(before)

  // Un arrastre completo = un solo comando: un deshacer devuelve la posición anterior
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('pos-x').locator('.val')).toHaveText(before)
})

test('reproducción: espacio avanza el cabezal y vuelve a pausar', async () => {
  await goTo('00:00:00:00')
  await page.mouse.click(5, 5) // saca el foco de cualquier campo
  await page.keyboard.press('Space')
  await expect(page.getByTestId('play')).toHaveAttribute('title', /Pausa/)
  await expect.poll(async () => (await page.getByTestId('monitor-tc').innerText()) !== '00:00:00:00', { timeout: 8000 }).toBe(true)
  await page.keyboard.press('Space')
  await expect(page.getByTestId('play')).toHaveAttribute('title', /Reproducir/)
  const t1 = await page.getByTestId('monitor-tc').innerText()
  await page.waitForTimeout(400)
  expect(await page.getByTestId('monitor-tc').innerText()).toBe(t1) // pausado: no avanza
  expect(t1).not.toBe('00:00:00:00')
})

test('la reproducción a 1080p mantiene la cadencia de la interfaz', async () => {
  await goTo('00:00:00:15')
  await clip(0).click()
  await page.getByTestId('reset-motion').click()
  await page.mouse.click(5, 5)
  await page.keyboard.press('Space')
  await expect(page.getByTestId('play')).toHaveAttribute('title', /Pausa/)
  // Cuenta los requestAnimationFrame durante 1,5 s: si el compositor bloqueara el hilo caerían muy por debajo de 60/s
  const frames = await page.evaluate(
    () =>
      new Promise<number>((res) => {
        let n = 0
        const t0 = performance.now()
        const loop = (): void => {
          n++
          if (performance.now() - t0 < 1500) requestAnimationFrame(loop)
          else res((n * 1000) / (performance.now() - t0))
        }
        requestAnimationFrame(loop)
      })
  )
  // Los medidores reciben señal en ambos canales (fuente mono duplicada a L y R)
  await expect.poll(async () => page.locator('.lbl').innerText(), { timeout: 5000 }).toMatch(/L -?\d.* R -?\d/)
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + '/preview.png' })
  await page.keyboard.press('Space')
  expect(frames).toBeGreaterThan(40)
})

test('medidores y mezclador en el espacio Audio; fader de pista', async () => {
  await page.getByTestId('ws-audio').click()
  await expect(page.getByTestId('mixer')).toBeVisible()
  await expect(page.getByTestId('strip-V1')).toBeVisible()
  await expect(page.getByTestId('strip-A1')).toBeVisible()
  const fader = page.getByTestId('fader-V1')
  await fader.focus()
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('strip-V1')).toContainText('dB')
  await page.getByTestId('ws-edit').click()
  await expect(page.getByTestId('meters')).toBeVisible()
})

test('proxy automático para ProRes y vista previa con él', async () => {
  // blue.mov (ProRes) se importó: debe generarse su proxy H.264 en la caché
  const meta = () => JSON.parse(readFileSync(join(dir, 'Preview.vdproj'), 'utf8')) as { media: { id: string; path: string; proxy?: string }[] }
  await page.keyboard.press('Control+s')
  await expect
    .poll(
      () => {
        const m = meta().media.find((x) => x.path.endsWith('blue.mov'))
        return Boolean(m) && existsSync(join(dir, '.viditor', 'cache', 'proxies', `${m!.id}.mp4`))
      },
      { timeout: 60_000 }
    )
    .toBe(true)

  // El renderer recibe el aviso y guarda la ruta del proxy en el proyecto
  await page.keyboard.press('Control+s')
  await expect.poll(() => meta().media.find((x) => x.path.endsWith('blue.mov'))?.proxy, { timeout: 20_000 }).toMatch(/proxies\/m_.*\.mp4$/)

  // Se coloca en V2 sobre la zona vacía (a partir de 6 s) y el monitor lo muestra en azul
  await page.getByTestId('media-item').nth(2).dblclick()
  await goTo('00:00:07:00')
  await expect.poll(async () => { const c = await px(0.5, 0.5); return c[2]! > 150 && c[0]! < 80 }, { timeout: 15_000 }).toBe(true)
})
