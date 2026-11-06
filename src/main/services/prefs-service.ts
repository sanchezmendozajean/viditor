import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { DEFAULT_PREFS, prefsSchema, type Prefs } from '@shared/prefs-schema'
import { writeAtomic } from './project-service'

/** Preferencias de la aplicación en `<userData>/preferences.json` (guardado atómico, tolerante a archivos dañados). */
export class PrefsService {
  private value: Prefs = DEFAULT_PREFS

  private file(): string {
    return join(app.getPath('userData'), 'preferences.json')
  }

  load(): Prefs {
    try {
      const parsed = prefsSchema.safeParse(JSON.parse(readFileSync(this.file(), 'utf8')))
      this.value = parsed.success ? parsed.data : DEFAULT_PREFS
    } catch {
      this.value = DEFAULT_PREFS
    }
    return this.value
  }

  get(): Prefs {
    return this.value
  }

  async set(partial: unknown): Promise<Prefs> {
    const next = prefsSchema.parse({ ...this.value, ...(partial as object) })
    await writeAtomic(this.file(), JSON.stringify(next, null, 2) + '\n')
    this.value = next
    return next
  }
}
