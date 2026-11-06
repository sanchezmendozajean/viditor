import { basename, dirname, join, relative, resolve, isAbsolute } from 'node:path'
import { toPosix } from './paths'

export interface MissingMedia {
  id: string
  path: string
}

export interface Relinked {
  id: string
  path: string
  storage: 'project' | 'external'
}

/** Ruta tal como se guarda en el .vdproj: relativa (con `/`) si está dentro del proyecto, absoluta si no. */
export function storedPath(projectDir: string, abs: string): { path: string; storage: 'project' | 'external' } {
  const rel = relative(resolve(projectDir), resolve(abs))
  const inside = rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
  return inside ? { path: toPosix(rel), storage: 'project' } : { path: toPosix(resolve(abs)), storage: 'external' }
}

/**
 * Revincula el medio `first` al archivo elegido y, de paso, a todos los demás faltantes cuyo archivo (mismo nombre)
 * exista en la misma carpeta que el elegido. Nunca toca los archivos.
 */
export function planRelink(
  projectDir: string,
  first: MissingMedia,
  chosen: string,
  others: readonly MissingMedia[],
  exists: (path: string) => boolean
): Relinked[] {
  const out: Relinked[] = [{ id: first.id, ...storedPath(projectDir, chosen) }]
  const folder = dirname(chosen)
  for (const m of others) {
    if (m.id === first.id) continue
    const candidate = join(folder, basename(m.path))
    if (exists(candidate)) out.push({ id: m.id, ...storedPath(projectDir, candidate) })
  }
  return out
}
