/** Mapa panel/contexto → ruta dentro de la documentación (viditor-docs://). */
export const HELP_TOPICS = {
  index: '/',
  project: '/guia/crear-y-abrir-proyectos',
  import: '/guia/importar-medios',
  timeline: '/guia/linea-de-tiempo',
  transitions: '/transiciones/primera-transicion',
  debugging: '/transiciones/depuracion',
  shortcuts: '/guia/atajos'
} as const

export type HelpTopic = keyof typeof HELP_TOPICS

const MEMBERS: Record<string, string[]> = {
  Transformable: ['move', 'scale', 'rotate', 'pivot', 'alpha', 'opacity', 'visible', 'z'],
  Filterable: ['flip', 'mask', 'brightness', 'contrast', 'saturation', 'grayscale', 'invert', 'sepia', 'tint', 'blur', 'pixelate'],
  Layer: ['splitGrid', 'splitStrips'],
  ClipPart: ['index', 'col', 'row', 'x', 'y', 'cx', 'cy'],
  Draw: ['rect', 'circle', 'ellipse', 'line', 'polygon', 'path', 'star', 'text', 'fill'],
  MathUtils: ['lerp', 'clamp', 'smoothstep', 'map', 'degToRad', 'radToDeg', 'stagger'],
  ColorUtils: ['rgb', 'hsl', 'mix'],
  TransitionContext: ['params', 'duration', 'frame', 'totalFrames', 'time', 'seed', 'hasLeave', 'hasEnter', 'random'],
  Screen: ['width', 'height', 'fps', 'aspect'],
  TransitionMeta: ['apiVersion', 'id', 'name', 'category', 'author', 'description', 'defaultDuration', 'audio']
}

const EASING = ['linear', 'inQuad', 'outQuad', 'inOutQuad', 'inCubic', 'outCubic', 'inOutCubic', 'inQuart', 'outQuart', 'inOutQuart', 'inExpo', 'outExpo', 'inOutExpo', 'inBack', 'outBack', 'inOutBack', 'outBounce', 'outElastic']
const GLOBALS: Record<string, string> = {
  screen: '/api/variables/screen',
  draw: '/api/variables/draw',
  ease: '/api/variables/ease',
  math: '/api/variables/math',
  color: '/api/variables/color',
  log: '/api/functions/log'
}

/**
 * Página de la referencia generada (TypeDoc) para un símbolo de la API, con su ancla.
 * Devuelve la portada de la referencia si el símbolo no se conoce.
 */
export function apiHelpPath(symbol: string): string {
  if (GLOBALS[symbol]) return GLOBALS[symbol] as string
  if (EASING.includes(symbol)) return '/api/type-aliases/EasingName'
  for (const [iface, list] of Object.entries(MEMBERS)) {
    if (list.includes(symbol)) return `/api/interfaces/${iface}#${symbol.toLowerCase()}`
  }
  if (/^(Layer|ClipPart|Shape|ShapeStyle|TextStyle|Gradient|Color|Draw|MathUtils|ColorUtils|Screen|TransitionContext|TransitionMeta|Transformable|Filterable)$/.test(symbol)) {
    return `/api/interfaces/${symbol}`
  }
  if (/^(ColorLike|EasingFn|EasingName|ParamDef)$/.test(symbol)) return `/api/type-aliases/${symbol}`
  return '/api/'
}

/** Todas las páginas a las que puede apuntar `apiHelpPath` (sin anclas): un test comprueba que existen en la documentación. */
export function apiHelpPages(): string[] {
  const pages = new Set<string>(['/api/', '/api/type-aliases/EasingName', ...Object.values(GLOBALS)])
  for (const iface of Object.keys(MEMBERS)) pages.add(`/api/interfaces/${iface}`)
  return [...pages]
}
