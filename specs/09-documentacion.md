# 09 · Documentación de ayuda

## Objetivo

Una sola fuente de documentación que:
1. se **incluye dentro de la aplicación** y se lee sin conexión (ventana de Ayuda),
2. se **publica en GitHub Pages** con el mismo contenido,
3. documenta tanto el uso del editor como la **API de transiciones**, sin que la referencia se desfase del código.

Idioma: español.

## Fuente única

```
viditor/
├─ docs/                         ← fuente (Markdown + Vue de VitePress)
│  ├─ .vitepress/config.ts
│  ├─ index.md                   ← portada
│  ├─ guia/                      ← guía de usuario
│  ├─ transiciones/              ← tutorial y conceptos de la API
│  ├─ api/                       ← REFERENCIA GENERADA (no editar a mano)
│  ├─ ejemplos/                  ← una página por ejemplo
│  └─ public/                    ← imágenes, capturas, videos cortos (locales)
└─ resources/transitions/        ← los ejemplos .js se leen desde aquí (no se duplican)
```

- Generador: **VitePress** (Vue, coincide con el stack). Su búsqueda local (MiniSearch) funciona sin servidor ni red.
- **Referencia de la API generada** desde `viditor-transitions.d.ts` con **TypeDoc + typedoc-plugin-markdown** hacia `docs/api/`. Así la referencia, el autocompletado de Monaco y la documentación salen del mismo archivo.
- Cada miembro público de la API DEBE tener un comentario **JSDoc en español** con descripción, `@param`, `@returns` y al menos un `@example`. Un test de CI falla si algún miembro exportado no tiene documentación.
- Las páginas de ejemplos incluyen el código directamente desde `resources/transitions/*.js` (directiva `<<< @/../resources/transitions/grid-shrink.js` de VitePress), de modo que el ejemplo documentado es exactamente el que trae la app.

## Contenido

### Guía de usuario (`guia/`)
Primeros pasos · Crear y abrir proyectos (estructura de la carpeta y del `.vdproj`) · Importar medios (dejar / copiar / mover, revincular) · Línea de tiempo (pistas, clips, cortes, imán, deshacer) · Transformaciones · Audio y mezclador · Transiciones en la línea de tiempo · Exportar · Atajos de teclado (tabla generada desde el registro de comandos de la app) · Preferencias · Solución de problemas (códecs, proxies, aceleración por hardware).

### Transiciones (`transiciones/`)
1. **Tu primera transición** — tutorial paso a paso: Nueva transición → editar → ver la vista previa → aplicar en la línea de tiempo.
2. **Anatomía de un archivo** — `meta`, `init`, `render`, parámetros.
3. **La regla de oro** — cada frame empieza desde cero; `render` como función de `progress`.
4. **Coordenadas, pivote y orden de dibujo**.
5. **Vocabulario** — clip, crop, mask, split.
6. **Recetas** — fundidos con `alpha`, deslizamientos, `splitGrid` con escalonado (`math.stagger`), máscaras con `feather`, aleatoriedad determinista con `ctx.random()`.
7. **Depuración** — consola, `log()`, errores con número de línea, límites de tiempo.
8. **Rendimiento** — presupuesto de 8 ms, cuántas partes usar, cachear en `init`.
9. **Compartir transiciones** — carpetas usuario/proyecto, prioridad, `apiVersion`.

### Referencia (`api/`, generada)
Una página por objeto: `Layer`, `ClipPart`, `Shape`, `draw`, `ease` (con gráfica de cada curva), `math`, `color`, `screen`, `ctx`, `TransitionMeta`, tipos de parámetro.

### Ejemplos (`ejemplos/`)
Una página por transición integrada: descripción, parámetros, código completo y un video corto en bucle (WebM generado por la propia app, ver abajo). En la app, cada página tiene un botón **Abrir en el editor** (copia el ejemplo a la carpeta del usuario y abre el espacio Transiciones).

## Dos compilaciones

| Script | Destino | `base` | Uso |
|--------|---------|--------|-----|
| `npm run docs:build:app` | `resources/docs/` | `/` | Empaquetado dentro de la app |
| `npm run docs:build:pages` | `docs/.vitepress/dist` | `/viditor/` | GitHub Pages |

- La compilación `app` se ejecuta antes de `electron-builder`; el instalador incluye `resources/docs/`.
- Diferencias entre ambas compilaciones (variable `VITEPRESS_TARGET`):
  - `app`: oculta el enlace "Editar en GitHub" y el selector de versiones; muestra botones de integración (*Abrir en el editor*, *Ir a la opción*).
  - `pages`: muestra el aviso "Descarga Viditor" y el enlace al repositorio.
- **Videos de ejemplo**: un script `npm run docs:previews` usa el motor de exportación en modo headless para renderizar cada transición integrada con los clips de muestra A/B a WebM (480×270, 2 s, sin audio) en `docs/public/previews/`. Se versionan en el repositorio para no depender de la app al compilar la documentación.

## Ayuda dentro de la aplicación

- Ventana **Ayuda** (F1 o **Ayuda › Documentación**): una `BrowserWindow` que carga la documentación empaquetada mediante un protocolo propio **`viditor-docs://`** registrado con `protocol.handle` y servido desde `resources/docs/` (nunca `file://`, para que las rutas absolutas de VitePress funcionen y se pueda aplicar la CSP).
- Misma apariencia que la app (tema oscuro de VitePress personalizado con los tokens de 07).
- **Ayuda contextual**:
  - En Monaco, **F1 sobre un símbolo** de la API (`splitGrid`, `alpha`, `ease.inOutCubic`…) abre su página de referencia en el ancla correspondiente. El hover de Monaco muestra el JSDoc y un enlace "Ver en la documentación".
  - Botón **?** en la cabecera de cada panel (Proyecto, Inspector, Línea de tiempo, Mezclador, Exportar) → sección correspondiente de la guía.
  - Los mensajes de error de la consola de transiciones incluyen un enlace "¿Qué significa esto?" a *Depuración*.
- Mapa de contexto → URL en `src/shared/help-topics.ts` (un test comprueba que cada URL exista en la compilación de la documentación).
- Los enlaces externos dentro de la documentación (p. ej. a GitHub) **no se abren dentro de la app**: se muestran con un icono de enlace externo y, solo al hacer clic el usuario, se abren en el navegador del sistema con `shell.openExternal`. La ventana de ayuda nunca navega fuera de `viditor-docs://`.
- La ventana de ayuda muestra la versión de la documentación (= versión de la app).

## Publicación en GitHub Pages

Workflow `.github/workflows/docs.yml`:
- Disparadores: push a `main` que toque `docs/**`, `resources/transitions/**` o `viditor-transitions.d.ts`, y publicación de una release.
- Pasos: `npm ci` → `npm run docs:api` (TypeDoc) → `npm run docs:build:pages` → `actions/upload-pages-artifact` → `actions/deploy-pages`.
- Versionado (fase posterior): la raíz publica la última release; `main` se publica en `/viditor/next/`.

## La documentación también es autocontenida

Igual que la app (ver 02 §Autocontenido): fuentes, iconos, imágenes y videos se sirven desde la propia compilación. Sin Google Fonts, CDNs, analíticas ni incrustaciones externas, tampoco en la versión de GitHub Pages.

## Criterios de aceptación
- Con la red desactivada, F1 abre la documentación, la búsqueda funciona y todas las imágenes/videos cargan.
- Agregar un método con JSDoc al `.d.ts` y recompilar lo hace aparecer en la referencia, en el hover de Monaco y en la búsqueda.
- `docs:build:pages` y `docs:build:app` compilan sin enlaces rotos (`ignoreDeadLinks: false`).
