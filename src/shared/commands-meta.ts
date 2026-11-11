/**
 * Catálogo de comandos de la aplicación: nombre, categoría y atajos por defecto.
 * Es la fuente única de la paleta de comandos (Ctrl+Mayús+P), de los atajos configurables y de la tabla de la guía
 * (docs/guia/atajos.md se genera desde aquí). La implementación de cada comando vive en el renderer.
 */
export type CommandCategory = 'Archivo' | 'Edición' | 'Reproducción' | 'Línea de tiempo' | 'Fotogramas clave' | 'Ver' | 'Ayuda'

export interface CommandMeta {
  id: string
  label: string
  category: CommandCategory
  /** Atajos por defecto; el primero es el que se muestra en los menús */
  keys?: string[]
  /** Funciona también con el foco en un campo de texto */
  global?: boolean
  /** Requiere un proyecto abierto (por defecto sí) */
  anywhere?: boolean
}

export const COMMANDS: readonly CommandMeta[] = [
  // Archivo
  { id: 'file.new', label: 'Nuevo proyecto…', category: 'Archivo', keys: ['Ctrl+N'], global: true, anywhere: true },
  { id: 'file.open', label: 'Abrir proyecto…', category: 'Archivo', keys: ['Ctrl+O'], global: true, anywhere: true },
  { id: 'file.save', label: 'Guardar', category: 'Archivo', keys: ['Ctrl+S'], global: true },
  { id: 'file.import', label: 'Importar medios…', category: 'Archivo', keys: ['Ctrl+I'], global: true },
  { id: 'file.openFolder', label: 'Ir a los archivos del proyecto', category: 'Archivo' },
  { id: 'file.close', label: 'Cerrar proyecto', category: 'Archivo' },
  { id: 'export.frame', label: 'Exportar fotograma actual (PNG)…', category: 'Archivo', keys: ['Ctrl+Shift+E'] },
  { id: 'view.export', label: 'Ir a Exportar', category: 'Archivo', keys: ['Ctrl+M'], global: true },

  // Edición
  { id: 'edit.undo', label: 'Deshacer', category: 'Edición', keys: ['Ctrl+Z'] },
  { id: 'edit.redo', label: 'Rehacer', category: 'Edición', keys: ['Ctrl+Shift+Z', 'Ctrl+Y'] },
  { id: 'edit.copy', label: 'Copiar clips', category: 'Edición', keys: ['Ctrl+C'] },
  { id: 'edit.paste', label: 'Pegar clips…', category: 'Edición', keys: ['Ctrl+V'] },
  { id: 'edit.selectAll', label: 'Seleccionar todo', category: 'Edición', keys: ['Ctrl+A'] },
  { id: 'edit.selectNone', label: 'Quitar la selección', category: 'Edición', keys: ['Escape'] },
  { id: 'edit.delete', label: 'Eliminar', category: 'Edición', keys: ['Delete', 'Backspace'] },
  { id: 'edit.deleteRipple', label: 'Eliminar y cerrar hueco', category: 'Edición', keys: ['Shift+Delete', 'Shift+Backspace'] },

  // Reproducción
  { id: 'play.toggle', label: 'Reproducir / pausa', category: 'Reproducción', keys: ['Space'] },
  { id: 'play.forward', label: 'Reproducir hacia delante (×1, ×2, ×4)', category: 'Reproducción', keys: ['L'] },
  { id: 'play.backward', label: 'Reproducir hacia atrás (×1, ×2, ×4)', category: 'Reproducción', keys: ['J'] },
  { id: 'play.pause', label: 'Pausa', category: 'Reproducción', keys: ['K'] },
  { id: 'seek.frameBack', label: 'Frame anterior', category: 'Reproducción', keys: ['ArrowLeft'] },
  { id: 'seek.frameForward', label: 'Frame siguiente', category: 'Reproducción', keys: ['ArrowRight'] },
  { id: 'seek.frames5Back', label: 'Retroceder 5 frames', category: 'Reproducción', keys: ['Shift+ArrowLeft'] },
  { id: 'seek.frames5Forward', label: 'Avanzar 5 frames', category: 'Reproducción', keys: ['Shift+ArrowRight'] },
  { id: 'seek.edgePrev', label: 'Borde de clip anterior', category: 'Reproducción', keys: ['ArrowUp'] },
  { id: 'seek.edgeNext', label: 'Borde de clip siguiente', category: 'Reproducción', keys: ['ArrowDown'] },
  { id: 'seek.start', label: 'Ir al inicio', category: 'Reproducción', keys: ['Home'] },
  { id: 'seek.end', label: 'Ir al final', category: 'Reproducción', keys: ['End'] },
  { id: 'marker.prev', label: 'Ir al marcador anterior', category: 'Reproducción' },
  { id: 'marker.next', label: 'Ir al marcador siguiente', category: 'Reproducción' },

  // Línea de tiempo
  { id: 'clip.split', label: 'Dividir en el cabezal', category: 'Línea de tiempo', keys: ['Ctrl+K'] },
  { id: 'clip.trimStart', label: 'Recortar inicio al cabezal', category: 'Línea de tiempo', keys: ['Q'] },
  { id: 'clip.trimEnd', label: 'Recortar final al cabezal', category: 'Línea de tiempo', keys: ['W'] },
  { id: 'clip.toggleEnabled', label: 'Habilitar / deshabilitar clip', category: 'Línea de tiempo', keys: ['Shift+E'] },
  { id: 'clip.resetTransform', label: 'Restablecer transformación', category: 'Línea de tiempo' },
  { id: 'transition.default', label: 'Aplicar la transición predeterminada', category: 'Línea de tiempo', keys: ['Ctrl+D'] },
  { id: 'tool.select', label: 'Herramienta de selección', category: 'Línea de tiempo', keys: ['V'] },
  { id: 'tool.razor', label: 'Herramienta cuchilla', category: 'Línea de tiempo', keys: ['C'] },
  { id: 'tool.hand', label: 'Herramienta mano', category: 'Línea de tiempo', keys: ['H'] },
  { id: 'timeline.snap', label: 'Activar / desactivar el imán', category: 'Línea de tiempo', keys: ['S'] },
  { id: 'marker.add', label: 'Agregar marcador', category: 'Línea de tiempo', keys: ['M'] },
  { id: 'range.in', label: 'Marcar entrada (rango de exportación)', category: 'Línea de tiempo', keys: ['I'] },
  { id: 'range.out', label: 'Marcar salida (rango de exportación)', category: 'Línea de tiempo', keys: ['O'] },
  { id: 'track.addVideo', label: 'Agregar pista de video', category: 'Línea de tiempo' },
  { id: 'track.addAudio', label: 'Agregar pista de audio', category: 'Línea de tiempo' },
  { id: 'zoom.in', label: 'Acercar la línea de tiempo', category: 'Línea de tiempo', keys: ['+', '='] },
  { id: 'zoom.out', label: 'Alejar la línea de tiempo', category: 'Línea de tiempo', keys: ['-'] },
  { id: 'zoom.fit', label: 'Ajustar el zoom a la secuencia', category: 'Línea de tiempo', keys: ['\\'] },

  // Fotogramas clave (del clip seleccionado)
  { id: 'key.toggleTransform', label: 'Fotograma clave de movimiento en el cabezal', category: 'Fotogramas clave' },
  { id: 'key.toggleOpacity', label: 'Fotograma clave de opacidad en el cabezal', category: 'Fotogramas clave' },
  { id: 'key.toggleVolume', label: 'Fotograma clave de volumen en el cabezal', category: 'Fotogramas clave' },
  { id: 'key.prev', label: 'Ir al fotograma clave anterior', category: 'Fotogramas clave' },
  { id: 'key.next', label: 'Ir al fotograma clave siguiente', category: 'Fotogramas clave' },

  // Ver
  { id: 'view.guides', label: 'Activar / desactivar las guías inteligentes del monitor', category: 'Ver' },
  { id: 'view.edit', label: 'Espacio de trabajo: Edición', category: 'Ver' },
  { id: 'view.transitions', label: 'Espacio de trabajo: Transiciones', category: 'Ver' },
  { id: 'view.audio', label: 'Espacio de trabajo: Audio', category: 'Ver' },
  { id: 'app.palette', label: 'Paleta de comandos…', category: 'Ver', keys: ['Ctrl+Shift+P'], global: true, anywhere: true },
  { id: 'app.preferences', label: 'Preferencias…', category: 'Ver', keys: ['Ctrl+,'], global: true, anywhere: true },

  // Ayuda
  { id: 'help.docs', label: 'Documentación', category: 'Ayuda', keys: ['F1'], global: true, anywhere: true },
  { id: 'help.shortcuts', label: 'Atajos de teclado (guía)', category: 'Ayuda', anywhere: true }
]

export const COMMAND_BY_ID: ReadonlyMap<string, CommandMeta> = new Map(COMMANDS.map((c) => [c.id, c]))

/** Atajos efectivos: los de fábrica con las personalizaciones del usuario encima (`[]` = sin atajo). */
export function effectiveKeys(meta: CommandMeta, overrides: Readonly<Record<string, string[]>>): string[] {
  return overrides[meta.id] ?? meta.keys ?? []
}

/** Mapa combinación → id de comando. Ante un conflicto gana el comando personalizado. */
export function buildKeymap(overrides: Readonly<Record<string, string[]>>): Map<string, string> {
  const map = new Map<string, string>()
  for (const c of COMMANDS) if (!(c.id in overrides)) for (const k of c.keys ?? []) map.set(k, c.id)
  for (const [id, keys] of Object.entries(overrides)) if (COMMAND_BY_ID.has(id)) for (const k of keys) map.set(k, id)
  return map
}

/** Comandos que ya usan la combinación (para avisar de conflictos al reasignar). */
export function conflictsFor(combo: string, exceptId: string, overrides: Readonly<Record<string, string[]>>): CommandMeta[] {
  return COMMANDS.filter((c) => c.id !== exceptId && effectiveKeys(c, overrides).includes(combo))
}
