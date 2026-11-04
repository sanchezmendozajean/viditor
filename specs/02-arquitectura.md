# 02 · Arquitectura

## Stack

| Capa | Elección | Motivo |
|------|----------|--------|
| Shell | **Electron** (última estable) | Windows + Linux con una sola base |
| Lenguaje | **TypeScript** estricto | Tipos compartidos entre procesos y con la API de transiciones |
| Build | **electron-vite** + **electron-builder** | HMR en desarrollo; NSIS/portable (Win), AppImage/deb (Linux) |
| UI | **Vue 3** (Composition API) + **Pinia** | Reactividad simple para paneles/inspector |
| Editor de código | **Monaco Editor** | Autocompletado con `viditor-transitions.d.ts` |
| Compositor | **WebGL2** (propio, sin librerías pesadas) | Transformaciones, recortes, máscaras y filtros por GPU |
| Medios | **FFmpeg + FFprobe** empaquetados (binarios estáticos por plataforma en `resources/ffmpeg/{win32,linux}`) | Análisis, miniaturas, formas de onda, proxies y exportación |
| Audio en vista previa | **Web Audio API** | Ganancias por clip/pista/master, medidores |
| Observación de archivos | **chokidar** | Recarga en caliente de transiciones y detección de medios faltantes |
| Pruebas | **Vitest** (unidad) + **Playwright for Electron** (e2e) | |
| Fuentes | **@fontsource/source-sans-3** y **@fontsource/jetbrains-mono** (archivos `.woff2` empaquetados) | Sin Google Fonts |
| Iconos | **lucide** (SVG importados en build, licencia ISC) | Sin fuentes de iconos remotas |
| Documentación | **VitePress** + **TypeDoc** (ver 09) | Mismo contenido en la app y en GitHub Pages |

## Procesos

```
┌──────────────────────────── Main process (Node) ────────────────────────────┐
│ ProjectService   – crear/abrir/guardar .vdproj, autosave, backups           │
│ MediaService     – ffprobe, miniaturas, waveforms, proxies (cola de jobs)    │
│ ImportService    – dejar / copiar / mover archivos al proyecto               │
│ ExportService    – orquesta la exportación (ffmpeg encoder + render offscreen)│
│ TransitionRegistry – descubre .js en carpetas, watch, valida meta           │
└──────────────▲───────────────────────────────────────────────────────────────┘
               │ IPC tipado (contextBridge, sin nodeIntegration)
┌──────────────┴──────────── Renderer (UI) ───────────────────────────────────┐
│ Vue app: paneles, timeline, inspector, monitor, editor de transiciones       │
│ Stores (Pinia): project, timeline, selection, playback, ui                    │
│ Engine:                                                                       │
│   ├─ FrameScheduler   – reloj de reproducción, scrubbing                     │
│   ├─ SourceProvider   – entrega frames de cada clip como textura             │
│   ├─ Compositor (WebGL2) – dibuja la "display list" del frame                │
│   └─ AudioGraph (Web Audio)                                                   │
│ TransitionHost ──postMessage──► TransitionWorker(s) (sandbox, ver 05)        │
└───────────────────────────────────────────────────────────────────────────────┘
```

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` en el renderer. Toda E/S pasa por un preload con una API tipada (`window.viditor.*`).
- Los tipos compartidos viven en `src/shared/` (modelo del proyecto, contratos IPC, display list).

## Autocontenido (sin red)

La aplicación DEBE funcionar completa **sin conexión a internet** y **no realizar ninguna petición de red** en tiempo de ejecución.

- Todo recurso se empaqueta: fuentes, iconos, imágenes, Monaco (sus workers incluidos), FFmpeg, transiciones integradas, clips de muestra A/B y la documentación (09).
- **Monaco**: cargarlo desde `node_modules` vía el bundler (`vite-plugin-monaco-editor` o importación ESM con `MonacoEnvironment.getWorker`). Si se usa `@monaco-editor/loader`, DEBE configurarse con `loader.config({ monaco })`, porque por defecto descarga desde un CDN.
- Prohibido: CDNs, Google Fonts, analíticas/telemetría, comprobación automática de actualizaciones, reporte de errores remoto, imágenes o avatares remotos, `<iframe>` externos.
- **CSP** en todas las ventanas: `default-src 'self' viditor-media: viditor-docs:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: viditor-media:; media-src 'self' blob: viditor-media:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; frame-src 'none'` (los medios del usuario se sirven por el protocolo propio `viditor-media://`).
- **Red bloqueada en la sesión**: `session.defaultSession.webRequest.onBeforeRequest` cancela cualquier petición `http(s)`/`ws(s)` y la registra en el log de desarrollo.
- `will-navigate` y `setWindowOpenHandler` deniegan navegación externa. La única salida permitida es `shell.openExternal` iniciado por un clic del usuario en un enlace externo (p. ej. en la Ayuda).
- **Test e2e obligatorio**: abrir la app, crear un proyecto, importar, reproducir, abrir el editor de transiciones y la Ayuda con la red deshabilitada; el test falla si se registra cualquier petición de red.
- **Licencias**: los avisos de licencia de fuentes, iconos, FFmpeg y dependencias se generan en build a `resources/licenses/` y se muestran en **Ayuda › Acerca de Viditor**.

## Modelo de render por frame

Para un tiempo `t` del proyecto:

1. **Resolver** qué clips están activos en `t` en cada pista de video visible (de abajo hacia arriba).
2. Para cada clip activo, obtener su **frame fuente** (`sourceTime = clip.in + (t - clip.start) * clip.speed`) como textura.
3. Renderizar cada clip como una **capa** del tamaño del cuadro del proyecto aplicando su transformación base (posición, escala, rotación, volteo, crop, opacidad).
4. Si `t` cae dentro de una **transición**, las dos capas (saliente y entrante) NO se componen directamente: se envían al `TransitionWorker`, que devuelve una **display list** (lista de instrucciones de dibujo) para ese frame.
5. El **Compositor** dibuja todas las capas/listas en orden de pista sobre el color de fondo del proyecto.

La display list es un JSON serializable (ver 05 §Implementación), lo que permite:
- ejecutar transiciones fuera del hilo de UI,
- reutilizar exactamente el mismo resultado en la exportación,
- cachear frames de transición.

## Fuentes de frames (SourceProvider)

- **Vista previa**: `HTMLVideoElement` por clip activo (pool reutilizable) + `requestVideoFrameCallback` para sincronía, subido a textura con `texImage2D`. Para códecs no soportados por Chromium (H.265 en algunas instalaciones, ProRes, AVI antiguos) se genera un **proxy** H.264 en `.viditor/cache/proxies/` y se usa ese.
- **Exportación**: decodificación por FFmpeg a `rawvideo` RGBA por pipe, frame exacto, desde el archivo **original** (nunca el proxy).
- Imágenes fijas: textura estática cacheada.

## Estructura del repositorio

```
viditor/
├─ specs/                     ← este directorio
├─ CLAUDE.md                  ← guía para Claude Code
├─ resources/ffmpeg/{win32,linux}/
├─ resources/transitions/     ← transiciones integradas (.js con la API pública)
├─ resources/docs/            ← documentación compilada (generada, ver 09)
├─ resources/licenses/        ← avisos de licencia (generados)
├─ docs/                      ← fuente de la documentación (VitePress)
├─ src/
│  ├─ main/                   ← servicios del proceso principal
│  ├─ preload/
│  ├─ shared/                 ← tipos, esquema .vdproj, contratos IPC
│  ├─ renderer/
│  │  ├─ app/                 ← Vue: layout, paneles, componentes
│  │  ├─ stores/
│  │  └─ engine/              ← scheduler, compositor, audio, transition host
│  └─ transition-runtime/     ← código del worker + implementación de la API
└─ tests/
```

## Rendimiento (objetivos)

- Vista previa 1080p30 en tiempo real con 2 pistas de video + 1 transición en una GPU integrada moderna.
- Scrubbing: el frame aparece en < 150 ms.
- `render()` de una transición: presupuesto de **8 ms** por frame en vista previa (advertencia si se supera).
- Si la vista previa no logra tiempo real, se descartan frames (nunca se desincroniza el audio). Opción de calidad de vista previa: Completa / ½ / ¼.
