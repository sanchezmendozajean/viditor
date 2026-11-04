import { copyFile, mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { ulid } from 'ulid'
import type { MediaBin, MediaItem } from '@shared/project-schema'
import type { ImportPlan, ImportRequest, ImportResult } from '@shared/ipc'
import { mediaKindOf, probeFile } from './media-service'
import { toPosix } from './paths'

interface Candidate {
  path: string
  binId: string | null
}

export function isInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child))
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel)
}

export class ImportService {
  /** Expande carpetas y filtra por tipos soportados. Devuelve archivos y bandejas a crear. */
  async expand(paths: string[]): Promise<{ files: Candidate[]; bins: MediaBin[] }> {
    const files: Candidate[] = []
    const bins: MediaBin[] = []
    const walk = async (p: string, parentBin: string | null): Promise<void> => {
      const info = await stat(p).catch(() => null)
      if (!info) return
      if (info.isDirectory()) {
        const bin: MediaBin = { id: 'b_' + ulid(), name: basename(p), parentId: parentBin }
        const entries = (await readdir(p)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        const before = files.length
        const binIndex = bins.push(bin) - 1
        for (const e of entries) await walk(join(p, e), bin.id)
        const hasChildBins = bins.slice(binIndex + 1).length > 0
        if (files.length === before && !hasChildBins) bins.splice(binIndex, 1)
      } else if (mediaKindOf(p)) {
        files.push({ path: p, binId: parentBin })
      }
    }
    for (const p of paths) await walk(p, null)
    return { files, bins }
  }

  async plan(projectDir: string, paths: string[]): Promise<ImportPlan> {
    const { files } = await this.expand(paths)
    return { count: files.length, outsideCount: files.filter((f) => !isInside(projectDir, f.path)).length }
  }

  async import(
    projectDir: string,
    req: ImportRequest,
    onThumbnail: (item: MediaItem, abs: string) => void
  ): Promise<ImportResult> {
    const { files, bins } = await this.expand(req.paths)
    const media: MediaItem[] = []
    const skipped: string[] = []
    const mediaDir = join(projectDir, 'media')

    for (const f of files) {
      const kind = mediaKindOf(f.path)
      if (!kind) continue
      try {
        const alreadyInside = isInside(projectDir, f.path)
        let finalPath = f.path
        if (!alreadyInside && req.mode !== 'reference') {
          await mkdir(mediaDir, { recursive: true })
          finalPath = await uniqueTarget(mediaDir, basename(f.path))
          if (req.mode === 'copy') await copyFile(f.path, finalPath)
          else await moveFile(f.path, finalPath)
        }
        const inProject = isInside(projectDir, finalPath)
        const probe = await probeFile(finalPath, kind)
        const item: MediaItem = {
          id: 'm_' + ulid(),
          path: inProject ? toPosix(relative(projectDir, finalPath)) : toPosix(finalPath),
          storage: inProject ? 'project' : 'external',
          kind,
          binId: f.binId,
          probe
        }
        if (req.existingPaths.includes(item.path) || media.some((m) => m.path === item.path)) {
          skipped.push(f.path)
          continue
        }
        media.push(item)
        onThumbnail(item, finalPath)
      } catch (e) {
        skipped.push(`${f.path} (${e instanceof Error ? e.message : String(e)})`)
      }
    }
    const usedBins = new Set(media.map((m) => m.binId).filter(Boolean))
    const keep = bins.filter((b) => usedBins.has(b.id) || bins.some((c) => c.parentId === b.id))
    return { media, bins: keep, skipped }
  }
}

/** Conserva el nombre; en conflicto agrega " (2)", " (3)"… */
export async function uniqueTarget(dir: string, name: string): Promise<string> {
  const ext = extname(name)
  const stem = basename(name, ext)
  let candidate = join(dir, name)
  for (let i = 2; existsSync(candidate); i++) candidate = join(dir, `${stem} (${i})${ext}`)
  return candidate
}

/** Mover; entre unidades distintas = copiar + verificar tamaño + borrar original. */
export async function moveFile(from: string, to: string): Promise<void> {
  try {
    await rename(from, to)
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EXDEV') throw e
    await mkdir(dirname(to), { recursive: true })
    await copyFile(from, to)
    const [a, b] = await Promise.all([stat(from), stat(to)])
    if (a.size !== b.size) {
      await rm(to, { force: true })
      throw new Error('La copia no coincide en tamaño; el original no se tocó.')
    }
    await rm(from)
  }
}
