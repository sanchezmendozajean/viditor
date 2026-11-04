import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

const exe = process.platform === 'win32' ? '.exe' : ''

function resourcesDir(): string {
  return app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources')
}

export function resourcePath(...parts: string[]): string {
  return join(resourcesDir(), ...parts)
}

/** Ruta de un binario de FFmpeg: carpeta empaquetada primero, luego paquetes npm (solo desarrollo). */
export async function resolveBinary(name: 'ffmpeg' | 'ffprobe'): Promise<string> {
  const packaged = resourcePath('ffmpeg', process.platform, name + exe)
  if (existsSync(packaged)) return packaged
  if (!app.isPackaged) {
    if (name === 'ffmpeg') {
      const mod = (await import('ffmpeg-static')) as unknown as { default: string | null }
      if (mod.default && existsSync(mod.default)) return mod.default
    } else {
      const mod = (await import('ffprobe-static')) as unknown as { path?: string; default?: { path?: string } }
      const p = mod.path ?? mod.default?.path
      if (p && existsSync(p)) return p
    }
  }
  throw new Error(`No se encontró ${name}. Ejecuta "npm run ffmpeg:fetch".`)
}

/** Nombre seguro para el sistema de archivos (Windows y Linux). */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim()
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
  const safe = reserved.test(cleaned) ? `_${cleaned}` : cleaned
  return safe || 'Proyecto'
}

/** Ruta con separador `/` para guardar en el .vdproj. */
export function toPosix(p: string): string {
  return p.split('\\').join('/')
}
