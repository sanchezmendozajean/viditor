import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import ffmpegPath from 'ffmpeg-static'

const root = resolve(import.meta.dirname, '../..')
let work: string
let app: ElectronApplication
let page: Page
let dir: string
let userData: string

function ffmpeg(args: string[]): void {
  execFileSync(ffmpegPath as string, ['-v', 'error', '-y', ...args], { stdio: 'pipe' })
}

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
const vdproj = (): { clips: { id: string; start: number; in: number; out: number }[]; transitions: { id: string; transitionRef: string; duration: number; params: Record<string, unknown>; leaveClipId: string | null; enterClipId: string | null }[] } =>
  JSON.parse(readFileSync(join(dir, 'Trans.vdproj'), 'utf8'))

async function goTo(tc: string): Promise<void> {
  await page.getByTestId('monitor-tc').click()
  await page.locator('.tc-edit').fill(tc)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('monitor-tc')).toHaveText(tc)
}
async function save(): Promise<void> {
  await page.keyboard.press('Control+s')
  await expect(page.getByTestId('statusbar')).toContainText('Guardado')
  await page.waitForTimeout(150)
}
async function setScrub(testId: string, value: string): Promise<void> {
  await page.getByTestId(testId).locator('.val').click()
  await page.getByTestId(testId).locator('input').fill(value)
  await page.keyboard.press('Enter')
}
const clip = (n: number) => page.getByTestId('row-V1').getByTestId('clip').nth(n)

test.beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), 'viditor-e2e-tr-'))
  userData = join(work, 'u')
  const src = join(work, 'src')
  mkdirSync(src, { recursive: true })
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=30:d=3', '-f', 'lavfi', '-i', 'sine=frequency=440:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', join(src, 'red.mp4')])
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=0x00c800:s=320x180:r=30:d=3', '-f', 'lavfi', '-i', 'sine=frequency=660:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', join(src, 'green.mp4')])

  const env = { ...process.env } as Record<string, string>
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ args: [root, `--user-data-dir=${userData}`], env })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  const parent = join(work, 'projects')
  mkdirSync(parent)
  await page.getByTestId('new-project').click()
  await page.getByTestId('np-name').fill('Trans')
  await page.getByTestId('np-dir').fill(parent)
  await page.getByTestId('np-create').click()
  await expect(page.getByTestId('timeline')).toBeVisible()
  dir = join(parent, 'Trans')

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
})

test.afterAll(async () => {
  await app.close()
  rmSync(work, { recursive: true, force: true })
})

test('Ctrl+D aplica la transición por defecto: B se desplaza y el monitor mezcla ambos clips', async () => {
  await clip(0).click()
  await clip(1).click({ modifiers: ['Control'] })
  await page.keyboard.press('Control+d')
  await expect(page.getByTestId('transition-block')).toHaveCount(1)
  await expect(page.getByTestId('transition-block')).toContainText('Fundido cruzado')
  await expect(page.getByTestId('inspector-transition')).toBeVisible()

  await save()
  const p = vdproj()
  expect(p.transitions).toHaveLength(1)
  expect(p.transitions[0]!.transitionRef).toBe('builtin:crossfade')
  expect(p.transitions[0]!.duration).toBeCloseTo(1)
  // Solapamiento: el segundo clip empieza 1 s antes (en 2 s) y la secuencia dura 5 s
  const starts = p.clips.map((c) => c.start).sort((a, b) => a - b)
  expect(starts[0]).toBeCloseTo(0)
  expect(starts[1]).toBeCloseTo(2)

  // Fuera del solape se ve cada clip; en el centro del solape, una mezcla de rojo y verde
  await goTo('00:00:01:00')
  await expect.poll(async () => isRed(await px(0.5, 0.5)), { timeout: 10_000 }).toBe(true)
  await goTo('00:00:04:00')
  await expect.poll(async () => isGreen(await px(0.5, 0.5)), { timeout: 10_000 }).toBe(true)
  await goTo('00:00:02:14')
  await expect
    .poll(async () => {
      const c = await px(0.5, 0.5)
      return c[0]! > 90 && c[0]! < 190 && c[1]! > 60 && c[1]! < 140
    }, { timeout: 10_000 })
    .toBe(true)
})

test('duración y parámetros desde el Inspector; deshacer y quitar devuelven la línea de tiempo', async () => {
  await page.getByTestId('transition-block').click()
  await setScrub('tr-duration', '2')
  await save()
  expect(vdproj().transitions[0]!.duration).toBeCloseTo(2)
  expect(vdproj().clips.map((c) => c.start).sort((a, b) => a - b)[1]).toBeCloseTo(1)

  await page.keyboard.press('Control+z')
  await save()
  expect(vdproj().transitions[0]!.duration).toBeCloseTo(1)

  // Quitar con Supr: el clip vuelve a su sitio
  await page.getByTestId('transition-block').click()
  await page.keyboard.press('Delete')
  await expect(page.getByTestId('transition-block')).toHaveCount(0)
  await save()
  expect(vdproj().clips.map((c) => c.start).sort((a, b) => a - b)[1]).toBeCloseTo(3)
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('transition-block')).toHaveCount(1)
})
