// Copia los binarios estáticos de FFmpeg/FFprobe a resources/ffmpeg/{win32,linux}/ para empaquetarlos.
// Los binarios de win32 y linux provienen de los paquetes ffmpeg-static (descarga en su instalación)
// y ffprobe-static (incluye ambas plataformas). Se ejecuta antes de electron-builder.
import { chmodSync, copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'resources', 'ffmpeg')
const platform = process.platform

const ffprobeBin = join(dirname(require.resolve('ffprobe-static')), 'bin')
const ffmpegStatic = require('ffmpeg-static')

function put(plat, name, src) {
  if (!src || !existsSync(src)) return false
  const dir = join(out, plat)
  mkdirSync(dir, { recursive: true })
  const dest = join(dir, name)
  copyFileSync(src, dest)
  if (plat !== 'win32') chmodSync(dest, 0o755)
  console.log(`  ${plat}/${name}`)
  return true
}

console.log('Copiando binarios a resources/ffmpeg/')
// ffprobe: ambas plataformas vienen en el paquete.
put('win32', 'ffprobe.exe', join(ffprobeBin, 'win32', 'x64', 'ffprobe.exe'))
put('linux', 'ffprobe', join(ffprobeBin, 'linux', 'x64', 'ffprobe'))
// ffmpeg: solo la plataforma donde se ejecutó la instalación de ffmpeg-static.
const ok = put(platform, platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg', ffmpegStatic)
if (!ok) {
  console.error('No se encontró el binario de ffmpeg-static para esta plataforma.')
  process.exit(1)
}
console.log('Nota: empaqueta cada plataforma en su propio sistema (o CI) para disponer de su ffmpeg.')
