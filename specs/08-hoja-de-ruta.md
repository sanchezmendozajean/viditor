# 08 · Hoja de ruta

Cada fase termina con la app ejecutable en Windows y Linux, pruebas pasando y un commit etiquetado.

## Fase 0 — Diseño
- Artifact con la maqueta interactiva según `07-diseno-interfaz.md`.
- **Aceptación**: todas las pantallas y diálogos de 07 presentes; el autor aprueba el look & feel. Los tokens CSS de la maqueta se reutilizan tal cual en la app.

## Fase 1 — Esqueleto y proyecto
- electron-vite + Vue 3 + TS + Pinia; ventana sin marco con barra de título propia; layout de paneles redimensionables y espacios de trabajo (vacíos).
- Pantalla de inicio, Nuevo/Abrir/Guardar proyecto, recientes, autosave, `.vdproj` v1 con validación de esquema (zod).
- FFmpeg/FFprobe empaquetados; importación con diálogo dejar/copiar/mover; panel Proyecto con miniaturas.
- **Autocontenido desde el día uno**: fuentes e iconos empaquetados, CSP, bloqueo de red en la sesión y el test e2e "sin red" (02 §Autocontenido) en CI.
- Esqueleto de `docs/` con VitePress, ambos scripts de compilación, ventana de Ayuda con `viditor-docs://` y workflow de GitHub Pages.
- **Aceptación**: crear proyecto → se genera la carpeta con su estructura; arrastrar 3 videos con cada una de las 3 opciones produce el resultado correcto en disco y en el `.vdproj`; cerrar y reabrir conserva todo.

## Fase 2 — Línea de tiempo
- Pistas (agregar, eliminar, reordenar arrastrando, ocultar, bloquear, silenciar, solo, altura).
- Clips: colocar, mover con imán, recortar, dividir (C / Ctrl+K), eliminar con/sin ripple, deshabilitar; miniaturas y formas de onda.
- Sistema de comandos con deshacer/rehacer.
- **Aceptación**: secuencia de 5 clips editada solo con teclado y mouse; 50 deshacer/rehacer consistentes; reordenar pistas persiste.

## Fase 3 — Vista previa, transformaciones y audio
- Compositor WebGL2, scheduler de reproducción, J/K/L, scrubbing.
- Inspector › Movimiento/Opacidad + manipulación directa en el monitor.
- Web Audio: volumen de clip/pista/master, fundidos, medidores, mezclador.
- Proxies automáticos para códecs no soportados.
- **Aceptación**: 1080p30 en tiempo real con 2 pistas; rotar/escalar/voltear un clip se ve igual en monitor e inspector; los tres niveles de volumen se combinan correctamente.

## Fase 4 — Motor de transiciones
- TransitionRegistry, TransitionWorker con sandbox, API v1 completa (05), display list, caché.
- Modelo de solapamiento en la línea de tiempo, Ctrl+D, duración arrastrable, parámetros en el Inspector.
- 12 transiciones integradas escritas con la API.
- Espacio de trabajo **Transiciones**: Monaco + tipos, vista previa con `progress`, consola, recarga en caliente.
- Documentación de la API: JSDoc en todo el `.d.ts`, TypeDoc → `docs/api/`, sección *Transiciones* completa, páginas de ejemplos con videos generados, F1 contextual en Monaco.
- **Aceptación**: los ejemplos de `specs/transiciones/ejemplos/` funcionan sin cambios; un error en un `.js` no tumba la app; scrubbing hacia atrás produce los mismos frames que hacia adelante.

## Fase 5 — Exportación
- Ventana offscreen, decodificación FFmpeg exacta, pipe al encoder, mezcla de audio, presets, aceleración por hardware, progreso y cancelación.
- **Aceptación**: exportar el proyecto de ejemplo produce un MP4 reproducible cuya comparación frame a frame con la vista previa (calidad completa) tiene diferencia ≤ 1 nivel de color por canal en frames sin decodificación con pérdida extra.

## Fase 6 — Pulido y extras
- Fotogramas clave para transformaciones y volumen (modelo `keyframes` ya reservado).
- Revincular medios, marcadores, exportar frame, paleta de comandos, preferencias (atajos, escala de UI, carpeta de transiciones).
- Guía de usuario completa con capturas; botones **?** de ayuda contextual en todos los paneles; versionado de la documentación en GitHub Pages.
- Instaladores: NSIS + portable (Win), AppImage + deb (Linux); asociación de `.vdproj`.

## Fuera de la hoja de ruta (ideas v2)
Títulos/texto, filtros de color en clips, velocidad de clip, transiciones `.ts`, `layer.shader()`, plantillas de proyecto, exportación GIF.
