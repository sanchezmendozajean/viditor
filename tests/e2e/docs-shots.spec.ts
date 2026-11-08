/**
 * Genera las capturas de la guía de usuario en docs/public/capturas/ (ver `npm run docs:shots`).
 * Solo se ejecuta con VIDITOR_DOCS_SHOTS=1: no forma parte de la batería normal.
 * Las capturas se versionan en el repositorio para que compilar la documentación no dependa de la app.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import ffmpegPath from 'ffmpeg-static'

test.skip(process.env.VIDITOR_DOCS_SHOTS !== '1', 'Solo con VIDITOR_DOCS_SHOTS=1')

const root = resolve(import.meta.dirname, '../..')
const out = join(root, 'docs', 'public', 'capturas')
let work: string
let app: ElectronApplication
let page: Page

function ffmpeg(args: string[]): void {
  execFileSync(ffmpegPath as string, ['-v', 'error', '-y', ...args], { stdio: 'pipe' })
}
async function goTo(tc: string): Promise<void> {
  await page.getByTestId('monitor-tc').click()
  await page.locator('.tc-edit').fill(tc)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('monitor-tc')).toHaveText(tc)
}
const shot = (name: string) => page.screenshot({ path: join(out, `${name}.png`) })
const clip = (n: number) => page.getByTestId('row-V1').getByTestId('clip').nth(n)

test.beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), 'viditor-docs-shots-'))
  mkdirSync(out, { recursive: true })
  const src = join(work, 'src')
  mkdirSync(src)
  // Clips de muestra con degradados y movimiento para que las capturas se vean como un proyecto real
  ffmpeg(['-f', 'lavfi', '-i', 'gradients=s=1280x720:r=30:d=6:c0=0x1f6feb:c1=0xf78166:speed=0.02,format=yuv420p', '-f', 'lavfi', '-i', 'sine=frequency=440:d=6', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', join(src, 'Playa.mp4')])
  ffmpeg(['-f', 'lavfi', '-i', 'gradients=s=1280x720:r=30:d=6:c0=0x238636:c1=0xd2a8ff:speed=0.02,format=yuv420p', '-f', 'lavfi', '-i', 'sine=frequency=660:d=6', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', join(src, 'Montaña.mp4')])

  const env = { ...process.env } as Record<string, string>
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ args: [root, `--user-data-dir=${join(work, 'u')}`], env })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]!
    w.setContentSize(1440, 860)
    w.center()
  })

  await shot('inicio')
  const parent = join(work, 'projects')
  mkdirSync(parent)
  await page.getByTestId('new-project').click()
  await shot('nuevo-proyecto')
  await page.getByTestId('np-name').fill('Vacaciones')
  await page.getByTestId('np-dir').fill(parent)
  await page.getByTestId('np-create').click()
  await expect(page.getByTestId('timeline')).toBeVisible()

  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: paths })) as unknown as typeof dialog.showOpenDialog
  }, [join(src, 'Playa.mp4'), join(src, 'Montaña.mp4')])
  await page.getByTestId('import-btn').click()
  await shot('importar-opciones')
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
  await clip(0).click()
  await clip(1).click({ modifiers: ['Control'] })
  await page.keyboard.press('Control+d')
  await expect(page.getByTestId('transition-block')).toHaveCount(1)
  // Un marcador con nombre
  await goTo('00:00:03:00')
  await page.keyboard.press('m')
  await page.getByTestId('marker').first().dblclick()
  await page.getByTestId('marker-input').fill('Cambio de escena')
  await page.keyboard.press('Enter')
})

test.afterAll(async () => {
  await app?.close()
  rmSync(work, { recursive: true, force: true })
})

test('capturas de la guía', async () => {
  await clip(0).click()
  await goTo('00:00:00:00')
  await page.getByTestId('group-opacity').getByTestId('key-diamond').click()
  await goTo('00:00:02:00')
  await page.getByTestId('opacity').locator('.val').click()
  await page.getByTestId('opacity').locator('input').fill('35')
  await page.keyboard.press('Enter')
  await goTo('00:00:01:00')
  await page.mouse.move(5, 5)
  await shot('edicion')

  await page.locator('section.panel', { has: page.getByTestId('inspector-clip') }).screenshot({ path: join(out, 'inspector-fotogramas-clave.png') })

  await page.keyboard.press('Control+Shift+P')
  await page.getByTestId('palette-input').fill('marc')
  await shot('paleta')
  await page.keyboard.press('Escape')

  await page.keyboard.press('Control+,')
  await page.getByTestId('prefs-tab-shortcuts').click()
  await shot('preferencias-atajos')
  await page.getByTestId('prefs-tab-general').click()
  await shot('preferencias')
  await page.getByTestId('prefs-close').click()

  await page.getByTestId('ws-transitions').click()
  await page.waitForTimeout(600)
  await shot('transiciones')

  await page.getByTestId('ws-audio').click()
  await page.waitForTimeout(300)
  await shot('audio')

  await page.getByTestId('ws-export').click()
  await expect(page.getByTestId('export-form')).toBeVisible()
  await page.getByTestId('export-after').selectOption('nothing')
  await shot('exportar')
})
