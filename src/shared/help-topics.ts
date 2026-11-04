/** Mapa panel/contexto → ruta dentro de la documentación (viditor-docs://). */
export const HELP_TOPICS = {
  index: '/',
  project: '/guia/crear-y-abrir-proyectos',
  import: '/guia/importar-medios',
  timeline: '/guia/linea-de-tiempo',
  transitions: '/transiciones/primera-transicion',
  shortcuts: '/guia/atajos'
} as const

export type HelpTopic = keyof typeof HELP_TOPICS
