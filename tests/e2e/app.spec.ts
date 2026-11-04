import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import ffmpegPath from 'ffmpeg-static'

const root = resolve(import.meta.dirname, '../..')
let work: string
let userData: string
let app: ElectronApplication
let page: Page

function makeVideo(file: string, color: string): void {
  execFileSync(
    ffmpegPath as string,
    ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=320x180:r=30:d=1`, '-f', 'lavfi', '-i', 'sine=frequency=440:d=1',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', file],
    { stdio: 'pipe' }
  )
}

async function stubOpenDialog(files: string[]): Promise<void> {
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: paths })) as unknown as typeof dialog.showOpenDialog
  }, files)
}

async function blocked(): Promise<string[]> {
  return app.evaluate(() => (globalThis as { __viditorBlockedRequests?: string[] }).__viditorBlockedRequests ?? [])
}

async function createProject(name: string): Promise<string> {
  const parent = join(work, 'projects')
  mkdirSync(parent, { recursive: true })
  await page.getByTestId('new-project').click()
  await page.getByTestId('np-name').fill(name)
  await page.getByTestId('np-dir').fill(parent)
  await page.getByTestId('np-create').click()
  await expect(page.getByTestId('project-panel')).toBeVisible()
  return join(parent, name)
}

async function importOne(file: string, choice: 'reference' | 'copy' | 'move', before: number): Promise<void> {
  await stubOpenDialog([file])
  await page.getByTestId('import-btn').click()
  await expect(page.getByTestId('import-dialog')).toBeVisible()
  await page.getByTestId(`import-${choice}`).check()
  await page.getByTestId('import-confirm').click()
  if (await page.getByTestId('toast').isVisible({ timeout: 1500 }).catch(() => false)) throw new Error('Toast: ' + (await page.getByTestId('toast').innerText()))
  await expect(page.getByTestId('media-item')).toHaveCount(before + 1)
}

test.beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), 'viditor-e2e-'))
  userData = join(work, 'userdata')
})

test.beforeEach(async () => {
  const env = { ...process.env } as Record<string, string>
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ args: [root, `--user-data-dir=${userData}`], env })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
})

test.afterEach(async () => {
  await app.close()
})

test.afterAll(() => {
  rmSync(work, { recursive: true, force: true })
})

test('fase 1: crear proyecto, importar con las 3 opciones, cerrar y reabrir; sin red', async () => {
  const dir = await createProject('Vacaciones')

  // Estructura en disco (specs/03)
  for (const sub of ['media', 'transitions', 'renders', '.viditor/cache', '.viditor/backups']) {
    expect(existsSync(join(dir, sub)), sub).toBe(true)
  }
  const vdproj = join(dir, 'Vacaciones.vdproj')
  const initial = JSON.parse(readFileSync(vdproj, 'utf8'))
  expect(initial.formatVersion).toBe(1)
  expect(initial.settings.width).toBe(1920)

  // Tres videos de origen, fuera del proyecto
  const src = join(work, 'src')
  mkdirSync(src, { recursive: true })
  const a = join(src, 'a.mp4'), b = join(src, 'b.mp4'), c = join(src, 'c.mp4')
  makeVideo(a, 'red'); makeVideo(b, 'green'); makeVideo(c, 'blue')

  await importOne(a, 'reference', 0)
  await importOne(b, 'copy', 1)
  await importOne(c, 'move', 2)

  // Disco: dejar → intacto; copiar → original + copia; mover → solo en media/
  expect(existsSync(a)).toBe(true)
  expect(existsSync(join(dir, 'media', 'a.mp4'))).toBe(false)
  expect(existsSync(b)).toBe(true)
  expect(existsSync(join(dir, 'media', 'b.mp4'))).toBe(true)
  expect(existsSync(c)).toBe(false)
  expect(existsSync(join(dir, 'media', 'c.mp4'))).toBe(true)

  // .vdproj: rutas relativas dentro del proyecto, absolutas fuera, con separador "/"
  const saved = JSON.parse(readFileSync(vdproj, 'utf8'))
  const byName = (n: string) => saved.media.find((m: { path: string }) => m.path.endsWith(n))
  expect(byName('a.mp4').storage).toBe('external')
  expect(byName('a.mp4').path).toBe(a.split('\\').join('/'))
  expect(byName('b.mp4')).toMatchObject({ storage: 'project', path: 'media/b.mp4' })
  expect(byName('c.mp4')).toMatchObject({ storage: 'project', path: 'media/c.mp4' })
  expect(byName('b.mp4').probe.width).toBe(320)

  // Miniaturas generadas por la cola de trabajos
  await expect.poll(() => existsSync(join(dir, '.viditor', 'cache', 'thumbs', `${saved.media[0].id}.jpg`)), { timeout: 20_000 }).toBe(true)

  // Cerrar y reabrir conserva todo
  await page.getByRole('button', { name: 'Archivo' }).click()
  await page.getByRole('button', { name: 'Cerrar proyecto' }).click()
  await expect(page.getByTestId('recent')).toHaveCount(1)
  await page.getByTestId('recent').locator('.info').click()
  await expect(page.getByTestId('media-item')).toHaveCount(3)

  // Test "sin red": ninguna petición http(s)/ws(s) en toda la sesión
  // Ayuda (F1): la documentación empaquetada carga por viditor-docs:// sin tocar la red
  const helpPromise = app.waitForEvent('window')
  await page.keyboard.press('F1')
  const help = await helpPromise
  await help.waitForLoadState('domcontentloaded')
  expect(help.url()).toMatch(/^viditor-docs:\/\/docs\//)
  await expect(help.locator('h1, .name').first()).toContainText('Viditor')
  await help.close()
  expect(await blocked()).toEqual([])
})

test('crear un proyecto en una carpeta no vacía muestra un error amable', async () => {
  const dir = await createProject('Repetido')
  expect(existsSync(dir)).toBe(true)
  await page.getByRole('button', { name: 'Archivo' }).click()
  await page.getByRole('button', { name: 'Cerrar proyecto' }).click()
  await page.getByTestId('new-project').click()
  await page.getByTestId('np-name').fill('Repetido')
  await page.getByTestId('np-dir').fill(join(work, 'projects'))
  await page.getByTestId('np-create').click()
  await expect(page.getByTestId('toast')).toContainText('ya existe')
})
