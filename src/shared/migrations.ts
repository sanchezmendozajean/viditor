import { FORMAT_VERSION, projectSchema, type Project } from './project-schema'

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>

/** migrations[n] convierte formatVersion n → n + 1. Vacío mientras exista solo la v1. */
const migrations: Record<number, Migration> = {}

export class ProjectFormatError extends Error {}

/** Valida y migra un JSON crudo de `.vdproj` hasta la versión actual. */
export function parseProject(raw: unknown): Project {
  if (typeof raw !== 'object' || raw === null) {
    throw new ProjectFormatError('El archivo no es un proyecto de Viditor válido.')
  }
  let data = raw as Record<string, unknown>
  let version = Number(data.formatVersion)
  if (!Number.isInteger(version) || version < 1) throw new ProjectFormatError('Falta formatVersion en el proyecto.')
  if (version > FORMAT_VERSION) {
    throw new ProjectFormatError(
      `El proyecto usa el formato v${version}, más nuevo que esta versión de Viditor (v${FORMAT_VERSION}).`
    )
  }
  while (version < FORMAT_VERSION) {
    const step = migrations[version]
    if (!step) throw new ProjectFormatError(`No hay migración desde la versión ${version}.`)
    data = { ...step(data), formatVersion: ++version }
  }
  const result = projectSchema.safeParse(data)
  if (!result.success) {
    const first = result.error.issues[0]
    throw new ProjectFormatError(`Proyecto inválido en "${first?.path.join('.')}": ${first?.message}`)
  }
  return result.data
}
