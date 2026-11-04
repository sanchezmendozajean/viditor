import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FORMAT_VERSION } from '../../src/shared/project-schema'
import { parseProject, ProjectFormatError } from '../../src/shared/migrations'

const base = {
  formatVersion: 1,
  app: 'viditor',
  name: 'Demo',
  settings: { width: 1920, height: 1080, fps: { num: 30, den: 1 } }
}

describe('parseProject', () => {
  it('aplica valores por defecto', () => {
    const p = parseProject(base)
    expect(p.settings.sampleRate).toBe(48000)
    expect(p.settings.importMode).toBe('ask')
    expect(p.settings.background).toBe('#000000')
    expect(p.media).toEqual([])
    expect(p.view.workspace).toBe('edit')
  })

  it('rechaza una versión de formato más nueva', () => {
    expect(() => parseProject({ ...base, formatVersion: FORMAT_VERSION + 1 })).toThrow(ProjectFormatError)
  })

  it('rechaza archivos que no son proyectos', () => {
    expect(() => parseProject(null)).toThrow(ProjectFormatError)
    expect(() => parseProject({ ...base, formatVersion: undefined })).toThrow(ProjectFormatError)
    expect(() => parseProject({ ...base, app: 'otra' })).toThrow(ProjectFormatError)
  })

  it('valida resolución y fps', () => {
    expect(() => parseProject({ ...base, settings: { ...base.settings, width: 0 } })).toThrow(ProjectFormatError)
    expect(() => parseProject({ ...base, settings: { ...base.settings, fps: { num: 30, den: 0 } } })).toThrow(ProjectFormatError)
  })

  it('valida las referencias de transición', () => {
    const bad = { ...base, transitions: [{ id: 'x', trackId: 't', leaveClipId: 'a', enterClipId: 'b', transitionRef: 'otra:fade', duration: 1 }] }
    expect(() => parseProject(bad)).toThrow(ProjectFormatError)
  })
})

// Los servicios importan 'electron' en otros módulos; aquí solo se prueban funciones puras.
describe('import helpers', () => {
  const dirs: string[] = []
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })))

  it('uniqueTarget agrega sufijos " (2)", " (3)"', async () => {
    const { uniqueTarget } = await import('../../src/main/services/import-service')
    const d = mkdtempSync(join(tmpdir(), 'vd-'))
    dirs.push(d)
    writeFileSync(join(d, 'clip.mp4'), 'x')
    expect(await uniqueTarget(d, 'clip.mp4')).toBe(join(d, 'clip (2).mp4'))
    writeFileSync(join(d, 'clip (2).mp4'), 'x')
    expect(await uniqueTarget(d, 'clip.mp4')).toBe(join(d, 'clip (3).mp4'))
    expect(await uniqueTarget(d, 'otro.mp4')).toBe(join(d, 'otro.mp4'))
  })

  it('isInside distingue rutas dentro y fuera', async () => {
    const { isInside } = await import('../../src/main/services/import-service')
    const d = mkdtempSync(join(tmpdir(), 'vd-'))
    dirs.push(d)
    expect(isInside(d, join(d, 'media', 'a.mp4'))).toBe(true)
    expect(isInside(d, d)).toBe(false)
    expect(isInside(d, join(d, '..', 'otro', 'a.mp4'))).toBe(false)
  })

  it('moveFile mueve y elimina el original', async () => {
    const { moveFile } = await import('../../src/main/services/import-service')
    const d = mkdtempSync(join(tmpdir(), 'vd-'))
    dirs.push(d)
    writeFileSync(join(d, 'a.txt'), 'hola')
    await moveFile(join(d, 'a.txt'), join(d, 'b.txt'))
    expect(readdirSync(d)).toEqual(['b.txt'])
    expect(readFileSync(join(d, 'b.txt'), 'utf8')).toBe('hola')
  })
})
