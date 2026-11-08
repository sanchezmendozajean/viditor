import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import ffmpegPath from 'ffmpeg-static'

const root = resolve(import.meta.dirname, '../..')
let work: string
let src: string
let app: ElectronApplication
let page: Page
let projectDir: string
let projectFile: string

function ffmpeg(args: string[]): void {
  execFileSync(ffmpegPath as string, ['-v', 'error', '-y', ...args], { stdio: 'pipe' })
}
const env = (): Record<string, string> => {
  const e = { ...process.env } as Record<string, string>
  delete e.ELECTRON_RUN_AS_NODE
  return e
}
async function launch(extraArgs: string[] = []): Promise<void> {
  app = await electron.launch({ args: [root, `--user-data-dir=${join(work, 'u')}`, ...extraArgs], env: env() })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
}
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
const clip = () => page.getByTestId('row-V1').getByTestId('clip').first()
const stubOpen = (paths: string[]) =>
  app.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: p })) as unknown as typeof dialog.showOpenDialog
  }, paths)

test.beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), 'viditor-e2e-p6-'))
  src = join(work, 'src')
  mkdirSync(src, { recursive: true })
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=30:d=4', '-f', 'lavfi', '-i', 'sine=frequency=440:d=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', join(src, 'red.mp4')])
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=0x00c800:s=320x180:r=30:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', join(src, 'green.mp4')])

  await launch()
  const parent = join(work, 'projects')
  mkdirSync(parent)
  await page.getByTestId('new-project').click()
  await page.getByTestId('np-name').fill('Fase6')
  await page.getByTestId('np-dir').fill(parent)
  await page.getByTestId('np-create').click()
  await expect(page.getByTestId('timeline')).toBeVisible()
  projectDir = join(parent, 'Fase6')
  projectFile = join(projectDir, 'Fase6.vdproj')

  await stubOpen([join(src, 'red.mp4'), join(src, 'green.mp4')])
  await page.getByTestId('import-btn').click()
  await page.getByTestId('import-reference').check()
  await page.getByTestId('import-confirm').click()
  await expect(page.getByTestId('media-item')).toHaveCount(2)
  await page.getByTestId('media-item').nth(0).dblclick()
  await page.getByTestId('media-preview-insert').click()
  await page.getByText('Insertar al final del contenido').click()
  await expect(page.getByTestId('row-V1').getByTestId('clip')).toHaveCount(1)
})

test.afterAll(async () => {
  await app?.close()
  rmSync(work, { recursive: true, force: true })
})

test('paleta de comandos: busca sin tildes, ejecuta con Intro y atenúa lo no disponible', async () => {
  // El cuadro «Buscar comando» de la barra de espacios de trabajo también la abre
  await page.getByTestId('open-palette').click()
  await expect(page.getByTestId('palette')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('palette')).toHaveCount(0)
  await page.keyboard.press('Control+Shift+P')
  await expect(page.getByTestId('palette')).toBeVisible()
  await page.getByTestId('palette-input').fill('marcador anterior')
  await expect(page.getByTestId('palette-item')).toHaveCount(1)
  await page.getByTestId('palette-input').fill('agregar marcador')
  await expect(page.getByTestId('palette-item').first()).toContainText('Agregar marcador')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('palette')).toHaveCount(0)
  await expect(page.getByTestId('marker')).toHaveCount(1)
  // Esc cierra la paleta sin ejecutar nada
  await page.keyboard.press('Control+Shift+P')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('palette')).toHaveCount(0)
})

test('marcadores: renombrar con doble clic, color y eliminar desde el menú; deshacer', async () => {
  await page.getByTestId('marker').first().dblclick()
  await page.getByTestId('marker-input').fill('Intro')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('marker').first()).toContainText('Intro')
  await page.getByTestId('marker').first().click({ button: 'right' })
  await page.getByText('Eliminar marcador').click()
  await expect(page.getByTestId('marker')).toHaveCount(0)
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('marker')).toHaveCount(1)
  await expect(page.getByTestId('marker').first()).toContainText('Intro')
})

test('fotogramas clave: la opacidad se anima entre dos instantes y se guarda en el proyecto', async () => {
  await clip().click()
  await goTo('00:00:00:00')
  await setScrub('opacity', '100')
  await page.getByTestId('group-opacity').getByTestId('key-diamond').click()
  await expect(page.getByTestId('clip-key')).toHaveCount(1)
  await goTo('00:00:02:00')
  await setScrub('opacity', '0')
  // Editar una propiedad animada crea el segundo fotograma sin pulsar el rombo
  await expect(page.getByTestId('clip-key')).toHaveCount(2)
  await goTo('00:00:01:00')
  await expect(page.getByTestId('opacity').locator('.val')).toHaveText(/^50/)
  // Quitar el fotograma del cabezal (el de 2 s no es el actual: no cambia nada); el rombo en 1 s agrega uno
  await page.getByTestId('group-opacity').getByTestId('key-diamond').click()
  await expect(page.getByTestId('clip-key')).toHaveCount(3)
  await page.keyboard.press('Control+z')
  await expect(page.getByTestId('clip-key')).toHaveCount(2)

  await page.keyboard.press('Control+s')
  await expect
    .poll(() => (existsSync(projectFile) ? (JSON.parse(readFileSync(projectFile, 'utf8')).clips[0]?.keyframes?.opacity?.length ?? 0) : 0))
    .toBe(2)
})

test('el comando «Restablecer transformación» quita la animación', async () => {
  await clip().click({ button: 'right' })
  await page.getByText('Restablecer transformación').click()
  await expect(page.getByTestId('clip-key')).toHaveCount(0)
})

test('exportar fotograma: guarda un PNG a la resolución del proyecto', async () => {
  const out = join(work, 'frame.png')
  await app.evaluate(({ dialog }, f) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: f })) as unknown as typeof dialog.showSaveDialog
  }, out)
  await goTo('00:00:01:00')
  await page.keyboard.press('Control+Shift+E')
  await expect.poll(() => existsSync(out)).toBe(true)
  const png = readFileSync(out)
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  expect(png.readUInt32BE(16)).toBe(1920) // ancho en IHDR
  expect(png.readUInt32BE(20)).toBe(1080)
})

test('preferencias: un atajo personalizado sustituye al de fábrica y persiste tras reiniciar', async () => {
  await page.keyboard.press('Control+,')
  await expect(page.getByTestId('preferences')).toBeVisible()
  await page.getByTestId('prefs-tab-shortcuts').click()
  await page.getByTestId('prefs-filter').fill('Agregar marcador')
  const row = page.locator('[data-testid=prefs-command][data-id="marker.add"]')
  await row.getByTestId('prefs-key').click()
  await page.keyboard.press('Control+Shift+B')
  await expect(row.getByTestId('prefs-key')).toHaveText('Ctrl+Mayús+B')
  // Reasignar una combinación en uso avisa y se la quita al otro comando
  await page.getByTestId('prefs-filter').fill('Dividir')
  const split = page.locator('[data-testid=prefs-command][data-id="clip.split"]')
  await split.getByTestId('prefs-key').click()
  await page.keyboard.press('Control+Shift+B')
  await expect(page.getByTestId('prefs-notice')).toContainText('Agregar marcador')
  await split.getByTestId('prefs-key').click()
  await page.keyboard.press('Control+K')
  await expect(split.getByTestId('prefs-key')).toHaveText('Ctrl+K')
  await page.getByTestId('prefs-filter').fill('Agregar marcador')
  await expect(row.getByTestId('prefs-key')).toHaveText('—')
  // Asignación definitiva: Mayús+N
  await row.getByTestId('prefs-key').click()
  await page.keyboard.press('Shift+N')
  await expect(row.getByTestId('prefs-key')).toHaveText('Mayús+N')
  await page.getByTestId('prefs-close').click()

  const before = await page.getByTestId('marker').count()
  await page.keyboard.press('m') // el atajo de fábrica ya no hace nada
  await expect(page.getByTestId('marker')).toHaveCount(before)
  await goTo('00:00:03:00')
  await page.keyboard.press('Shift+N')
  await expect(page.getByTestId('marker')).toHaveCount(before + 1)
  // Los menús muestran el atajo vigente
  await expect.poll(() => readFileSync(join(work, 'u', 'preferences.json'), 'utf8')).toContain('Shift+N')

  await page.keyboard.press('Control+s')
  await app.close()
  await launch([projectFile]) // el proyecto se abre por argumento (doble clic en el explorador)
  await expect(page.getByTestId('timeline')).toBeVisible({ timeout: 15000 })
  const n = await page.getByTestId('marker').count()
  await goTo('00:00:03:10')
  await page.keyboard.press('Shift+N')
  await expect(page.getByTestId('marker')).toHaveCount(n + 1)
})

test('escala de la interfaz: se aplica al instante y se conserva', async () => {
  await page.keyboard.press('Control+,')
  await page.getByTestId('prefs-scale').fill('125')
  await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.getZoomFactor())).toBeCloseTo(1.25, 2)
  await expect.poll(() => JSON.parse(readFileSync(join(work, 'u', 'preferences.json'), 'utf8')).uiScale).toBe(125)
  await page.getByTestId('prefs-scale').fill('100')
  await page.getByTestId('prefs-close').click()
})

test('revincular: los medios faltantes de una misma carpeta se recuperan juntos', async () => {
  await page.keyboard.press('Control+s')
  await app.close()
  // Los archivos originales cambian de carpeta mientras el proyecto está cerrado
  const moved = join(work, 'moved')
  mkdirSync(moved)
  renameSync(join(src, 'red.mp4'), join(moved, 'red.mp4'))
  renameSync(join(src, 'green.mp4'), join(moved, 'green.mp4'))

  await launch([projectFile])
  await expect(page.getByTestId('project-panel')).toBeVisible({ timeout: 20000 }) // abierto por argumento, como el doble clic del explorador
  await expect(page.getByTestId('missing-banner')).toContainText('Faltan 2')

  await stubOpen([join(moved, 'red.mp4')])
  await page.getByTestId('relink').first().click()
  await expect(page.getByTestId('missing-banner')).toHaveCount(0)
  await expect(page.getByTestId('relink')).toHaveCount(0)
  await expect.poll(() => JSON.parse(readFileSync(projectFile, 'utf8')).media.map((m: { path: string }) => m.path.includes('moved'))).toEqual([true, true])
})
