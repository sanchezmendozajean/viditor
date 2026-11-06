import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig } from 'vitepress'

// El índice de ejemplos y la referencia de la API los generan scripts/docs-examples.mjs y scripts/docs-api.mjs
const here = import.meta.dirname
const examples: { text: string; link: string }[] = existsSync(join(here, '..', 'ejemplos', 'sidebar.json')) ? JSON.parse(readFileSync(join(here, '..', 'ejemplos', 'sidebar.json'), 'utf8')) : []
const apiDir = join(here, '..', 'api')
const apiGroup = (dir: string, text: string): { text: string; collapsed: boolean; items: { text: string; link: string }[] } | null => {
  const full = join(apiDir, dir)
  if (!existsSync(full)) return null
  const items = readdirSync(full).filter((f) => f.endsWith('.md')).sort().map((f) => ({ text: f.slice(0, -3), link: `/api/${dir}/${f.slice(0, -3)}` }))
  return { text, collapsed: false, items }
}
const apiSidebar = [apiGroup('interfaces', 'Interfaces'), apiGroup('type-aliases', 'Tipos'), apiGroup('variables', 'Globales'), apiGroup('functions', 'Funciones')].filter(Boolean) as { text: string; collapsed: boolean; items: { text: string; link: string }[] }[]

// Dos compilaciones (specs/09): "app" → resources/docs (base "/"), "pages" → GitHub Pages (base "/viditor/").
const target = process.env.VITEPRESS_TARGET === 'app' ? 'app' : 'pages'

export default defineConfig({
  lang: 'es-ES',
  title: 'Viditor',
  description: 'Editor de video con transiciones programables',
  base: target === 'app' ? '/' : '/viditor/',
  outDir: target === 'app' ? '../resources/docs' : '.vitepress/dist',
  cleanUrls: true,
  ignoreDeadLinks: false,
  appearance: 'force-dark',
  head: [],
  themeConfig: {
    // Sin enlace "Editar en GitHub" en la app; sin CDNs ni fuentes remotas en ninguna compilación.
    search: { provider: 'local', options: { locales: { root: { translations: { button: { buttonText: 'Buscar', buttonAriaLabel: 'Buscar' }, modal: { noResultsText: 'Sin resultados para', resetButtonTitle: 'Borrar búsqueda', footer: { selectText: 'seleccionar', navigateText: 'navegar', closeText: 'cerrar' } } } } } } },
    nav: [
      { text: 'Guía', link: '/guia/crear-y-abrir-proyectos' },
      { text: 'Transiciones', link: '/transiciones/primera-transicion' },
      { text: 'Referencia API', link: '/api/' },
      { text: 'Ejemplos', link: '/ejemplos/' }
    ],
    sidebar: {
      '/guia/': [
        {
          text: 'Guía de usuario',
          items: [
            { text: 'Crear y abrir proyectos', link: '/guia/crear-y-abrir-proyectos' },
            { text: 'Importar medios', link: '/guia/importar-medios' },
            { text: 'Línea de tiempo', link: '/guia/linea-de-tiempo' },
            { text: 'Vista previa y reproducción', link: '/guia/vista-previa' },
            { text: 'Transformaciones', link: '/guia/transformaciones' },
            { text: 'Audio y mezclador', link: '/guia/audio' },
            { text: 'Atajos de teclado', link: '/guia/atajos' }
          ]
        }
      ],
      '/transiciones/': [
        {
          text: 'Transiciones',
          items: [
            { text: 'Tu primera transición', link: '/transiciones/primera-transicion' },
            { text: 'Anatomía de un archivo', link: '/transiciones/anatomia' },
            { text: 'La regla de oro', link: '/transiciones/regla-de-oro' },
            { text: 'Coordenadas, pivote y orden', link: '/transiciones/coordenadas' },
            { text: 'Vocabulario', link: '/transiciones/vocabulario' },
            { text: 'Recetas', link: '/transiciones/recetas' },
            { text: 'Depuración', link: '/transiciones/depuracion' },
            { text: 'Rendimiento', link: '/transiciones/rendimiento' },
            { text: 'Compartir transiciones', link: '/transiciones/compartir' }
          ]
        }
      ],
      '/api/': [{ text: 'Referencia de la API', items: [{ text: 'Portada', link: '/api/' }] }, ...apiSidebar],
      '/ejemplos/': [{ text: 'Transiciones integradas', items: [{ text: 'Todas', link: '/ejemplos/' }, ...examples] }]
    },
    outline: { label: 'En esta página' },
    docFooter: { prev: 'Anterior', next: 'Siguiente' },
    darkModeSwitchLabel: 'Apariencia',
    sidebarMenuLabel: 'Menú',
    returnToTopLabel: 'Volver arriba'
  }
})
