import { z } from 'zod'

/** Preferencias de la aplicación (no del proyecto). Se guardan en `preferences.json` dentro de userData. */
export const prefsSchema = z.object({
  /** Escala de la interfaz en % (90–150) */
  uiScale: z.number().int().min(90).max(150).default(100),
  /** Atajos personalizados: id de comando → combinaciones (lista vacía = sin atajo) */
  shortcuts: z.record(z.string().max(64), z.array(z.string().min(1).max(40)).max(4)).default({}),
  /** Carpeta de transiciones del usuario; null = la predeterminada */
  transitionsDir: z.string().max(1024).nullable().default(null)
})

export type Prefs = z.infer<typeof prefsSchema>

export const DEFAULT_PREFS: Prefs = prefsSchema.parse({})
