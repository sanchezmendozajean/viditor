# Viditor — Especificaciones

Viditor es un editor de video de escritorio (Electron, Windows + Linux) con la sencillez del antiguo Windows Movie Maker, la apariencia de la suite de Adobe (Premiere Pro / After Effects) y un rasgo distintivo: **las transiciones son plugins escritos en JavaScript por el usuario final**, ejecutados frame a frame como si fuera el loop de un videojuego.

## Índice

| # | Documento | Contenido |
|---|-----------|-----------|
| 01 | [Visión y alcance](01-vision-alcance.md) | Objetivos, funcionalidades, qué queda fuera |
| 02 | [Arquitectura](02-arquitectura.md) | Stack, procesos de Electron, motor de render, FFmpeg |
| 03 | [Proyecto e importación](03-proyecto-e-importacion.md) | Carpeta del proyecto, archivo `.vdproj`, arrastrar clips |
| 04 | [Línea de tiempo y clips](04-linea-de-tiempo.md) | Pistas, clips, cortes, transformaciones, volumen |
| 05 | [API de transiciones](05-api-transiciones.md) | Lenguaje, ciclo de vida, métodos, sandbox |
| 06 | [Render y exportación](06-render-exportacion.md) | Vista previa, exportación, audio |
| 07 | [Diseño de interfaz](07-diseno-interfaz.md) | Look & feel Adobe, paneles, colores, atajos — **brief para el Artifact de diseño** |
| 08 | [Hoja de ruta](08-hoja-de-ruta.md) | Fases, entregables y criterios de aceptación |
| 09 | [Documentación de ayuda](09-documentacion.md) | Ayuda integrada sin conexión + GitHub Pages, referencia generada de la API |

Material complementario:

- [`transiciones/viditor-transitions.d.ts`](transiciones/viditor-transitions.d.ts) — tipos de la API (autocompletado en el editor de transiciones).
- [`transiciones/ejemplos/`](transiciones/ejemplos/) — transiciones de referencia escritas con la API.

## Flujo de trabajo previsto

1. **Diseño** — Con `07-diseno-interfaz.md` (y el resto como contexto) se genera un Artifact con la maqueta visual interactiva de la aplicación.
2. **Construcción** — Claude Code lee estas specs + la maqueta y construye la aplicación por fases según `08-hoja-de-ruta.md`.
3. **Transiciones** — El autor (Pols) va programando transiciones con la API conforme las necesite; la API crece por versiones (`apiVersion`).

## Convenciones

- Idioma de la interfaz: **español**. Código, identificadores y nombres de archivo: inglés.
- Las palabras **DEBE**, **DEBERÍA** y **PUEDE** indican obligatorio, recomendado y opcional.
- Unidades: tiempo en segundos (`number`, con precisión de frame al serializar), coordenadas en píxeles de la resolución del proyecto, ángulos en grados.
