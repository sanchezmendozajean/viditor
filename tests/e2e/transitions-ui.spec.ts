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

async function goTo(tc: string): Promise<void> {
  await page.getByTestId('monitor-tc').click()
  await page.locator('.tc-edit').fill(tc)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('monitor-tc')).toHaveText(tc)
}
const clip = (n: number) => page.getByTestId('row-V1').getByTestId('clip').nth(n)
const tab = (id: 'project' | 'transitions') => page.getByTestId(`ptab-${id}`).first()

/** Arrastra una tarjeta del panel Transiciones a la unión entre los dos clips de V1. */
async function dragToJunction(ref: string): Promise<void> {
  const lane = page.getByTestId('row-V1').getByTestId('lane')
  const laneBox = (await lane.boundingBox())!
  const c0 = (await clip(0).boundingBox())!
  await page.getByTestId(`tcard-${ref}`).dragTo(lane, { targetPosition: { x: c0.x + c0.width - 4 - laneBox.x, y: 20 } })
}

test.beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), 'viditor-e2e-trui-'))
  userData = join(work, 'u')
  const src = join(work, 'src')
  mkdirSync(src, { recursive: true })
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=red:s=320x180:r=30:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', join(src, 'red.mp4')])
  ffmpeg(['-f', 'lavfi', '-i', 'color=c=0x00c800:s=320x180:r=30:d=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', join(src, 'green.mp4')])

  const env = { ...process.env } as Record<string, string>
  delete env.ELECTRON_RUN_AS_NODE
  app = await electron.launch({ args: [root, `--user-data-dir=${userData}`], env })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')

  const parent = join(work, 'projects')
  mkdirSync(parent)
  await page.getByTestId('new-project').click()
  await page.getByTestId('np-name').fill('TrUi')
  await page.getByTestId('np-dir').fill(parent)
  await page.getByTestId('np-create').click()
  await expect(page.getByTestId('timeline')).toBeVisible()

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

test('arrastrar «Deslizar horizontal» del panel Transiciones a la unión: el monitor muestra el deslizamiento', async () => {
  await tab('transitions').click()
  await expect(page.getByTestId('transitions-list')).toBeVisible()
  await expect(page.locator('[data-testid^="tcard-builtin:"]')).toHaveCount(12)

  await dragToJunction('builtin:slide-horizontal')
  await expect(page.getByTestId('transition-block')).toHaveCount(1)
  await expect(page.getByTestId('transition-block')).toContainText('Deslizar horizontal')

  // A mitad de la transición el saliente (rojo) está desplazado a la derecha y asoma el entrante (verde) por la izquierda
  await goTo('00:00:02:15')
  await expect.poll(async () => isGreen(await px(0.25, 0.5)), { timeout: 10_000 }).toBe(true)
  expect(isRed(await px(0.75, 0.5))).toBe(true)
})

test('Iris circular: el entrante aparece dentro del círculo y el saliente queda en las esquinas', async () => {
  await page.getByTestId('transition-block').click()
  await page.keyboard.press('Delete')
  await expect(page.getByTestId('transition-block')).toHaveCount(0)
  await dragToJunction('builtin:iris-circle')
  await expect(page.getByTestId('transition-block')).toContainText('Iris circular')
  await goTo('00:00:02:15')
  await expect.poll(async () => isGreen(await px(0.5, 0.5)), { timeout: 10_000 }).toBe(true)
  expect(isRed(await px(0.02, 0.03))).toBe(true)
})

test('espacio Transiciones: lista, editor Monaco, vista previa, parámetros y consola', async () => {
  await page.getByTestId('ws-transitions').click()
  await expect(page.getByTestId('transitions-workspace')).toBeVisible()
  await page.getByTestId('tcard-builtin:wipe').click()
  await expect(page.getByTestId('code-editor')).toBeVisible()
  await expect(page.locator('.monaco-editor').first()).toContainText('Barrido', { timeout: 20_000 })
  await expect(page.getByTestId('preview-params')).toContainText('Ángulo')
  // La vista previa renderiza la transición con los clips A/B de muestra (no es un lienzo vacío)
  await expect
    .poll(
      async () =>
        page.locator('.pv').getByTestId('preview-canvas').evaluate((el) => {
          const k = document.createElement('canvas')
          k.width = 16
          k.height = 9
          const x = k.getContext('2d')!
          x.drawImage(el as HTMLCanvasElement, 0, 0, 16, 9)
          const d = x.getImageData(0, 0, 16, 9).data
          let sum = 0
          for (let i = 0; i < d.length; i += 4) sum += d[i]! + d[i + 1]! + d[i + 2]!
          return sum > 1000
        }),
      { timeout: 10_000 }
    )
    .toBe(true)
  // Las integradas son de solo lectura
  await expect(page.getByTestId('duplicate-edit')).toBeVisible()
})

test('crear una transición, editarla en Monaco, guardar con Ctrl+S y recarga en caliente desde disco', async () => {
  await page.getByTestId('tr-new').click()
  const file = join(userData, 'transitions', 'mi-transicion.js')
  await expect.poll(() => existsSync(file)).toBe(true)
  await expect(page.locator('.monaco-editor').first()).toContainText('Mi transición', { timeout: 20_000 })

  // Sustituye el código por uno con un error de ejecución en la línea 4 y guarda con Ctrl+S
  const bad = [
    'const meta = { apiVersion: 1, id: "mi-transicion", name: "Rota" };',
    '',
    'function render(leaveClip, enterClip, progress) {',
    '  leaveClip.noExiste(progress);',
    '}',
    ''
  ].join('\n')
  await page.locator('.monaco-editor .view-lines').first().click()
  await page.keyboard.press('Control+a')
  // Monaco usa EditContext: se pega desde el portapapeles del sistema en vez de insertText
  await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), bad)
  await page.keyboard.press('Control+v')
  await expect(page.getByTestId('editor-dirty')).toBeVisible()
  await page.keyboard.press('Control+s')
  await expect(page.getByTestId('editor-dirty')).toHaveCount(0)
  expect(readFileSync(file, 'utf8')).toContain('noExiste')

  // La consola muestra el error con su número de línea
  const line = page.getByTestId('console-line').filter({ hasText: 'noExiste' }).first()
  await expect(line).toBeVisible({ timeout: 20_000 })
  await expect(line).toContainText('línea 4')
  await expect(page.getByTestId('preview-error')).toContainText('noExiste')

  // Se corrige el archivo desde fuera (otro editor): la app lo recarga sola
  writeFileSync(
    file,
    'const meta = { apiVersion: 1, id: "mi-transicion", name: "Arreglada", category: "Fundidos" };\nfunction render(l, e, p) { l.alpha(1 - p); log("ok", p.toFixed(1)); }\n'
  )
  await expect(page.locator('.monaco-editor').first()).toContainText('Arreglada', { timeout: 20_000 })
  await expect(page.getByTestId('preview-error')).toHaveCount(0, { timeout: 20_000 })
  await expect(page.getByTestId('console-line').filter({ hasText: 'ok' }).first()).toBeVisible({ timeout: 20_000 })
})

test('sandbox: fetch y Math.random bloqueados; un bucle infinito no tumba la app ni toca la red', async () => {
  const file = join(userData, 'transitions', 'sandbox-test.js')
  const write = (body: string): void =>
    writeFileSync(file, `const meta = { apiVersion: 1, id: "sandbox-test", name: "Sandbox" };\nfunction render(l, e, p) { ${body} }\n`)

  await page.getByTestId('ws-transitions').click()
  write('fetch("http://example.com/x");')
  await page.getByTestId('tcard-user:sandbox-test').click({ timeout: 25_000 })
  await expect(page.getByTestId('console-line').filter({ hasText: 'fetch' }).first()).toBeVisible({ timeout: 20_000 })

  write('Math.random();')
  await expect(page.getByTestId('console-line').filter({ hasText: 'ctx.random' }).first()).toBeVisible({ timeout: 20_000 })

  // Bucle infinito: el watchdog termina el worker y la interfaz sigue respondiendo
  write('while (true) {}')
  await expect(page.getByTestId('console-line').filter({ hasText: 'Tiempo excedido' }).first()).toBeVisible({ timeout: 25_000 })
  await page.getByTestId('ws-edit').click()
  await expect(page.getByTestId('timeline')).toBeVisible()
  const blocked = await app.evaluate(() => (globalThis as { __viditorBlockedRequests?: string[] }).__viditorBlockedRequests ?? [])
  expect(blocked).toEqual([])
})
