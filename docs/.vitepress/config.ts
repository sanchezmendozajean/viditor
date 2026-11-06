import { defineConfig } from 'vitepress'

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
      '/transiciones/': [{ text: 'Transiciones', items: [{ text: 'Tu primera transición', link: '/transiciones/primera-transicion' }] }]
    },
    outline: { label: 'En esta página' },
    docFooter: { prev: 'Anterior', next: 'Siguiente' },
    darkModeSwitchLabel: 'Apariencia',
    sidebarMenuLabel: 'Menú',
    returnToTopLabel: 'Volver arriba'
  }
})
