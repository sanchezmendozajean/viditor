# 01 · Visión y alcance

## Visión

Un editor de video **ligero y directo** para tareas cotidianas (unir clips, cortar, transicionar, ajustar volumen), con una interfaz profesional estilo Adobe y un sistema de **transiciones programables** que convierte al usuario en autor de sus propios efectos.

## Plataformas

- **Windows 10/11 x64** y **Linux x64** (AppImage + .deb). Ninguna otra.
- No se soporta macOS: no se agregan rutas de código, firmas ni builds para él.

## Funcionalidades (v1)

### Núcleo tipo Movie Maker
1. **Unir clips** — colocar varios clips en secuencia en una pista y exportarlos como un único video.
2. **Transiciones** entre clips adyacentes de una misma pista (solapamiento, ver 04 y 05).
3. **Cortar** — dividir un clip en el cabezal, recortar inicio/fin, eliminar segmentos (con o sin cerrar el hueco).
4. **Volumen** — por clip, por pista y general del proyecto (master). Fundido de entrada/salida de audio por clip.

### Extras
5. **Transiciones como plugins JS** — cada transición es un archivo `.js` que describe qué ocurre en cada frame. Las transiciones integradas también se escriben con la misma API (no hay transiciones "especiales" en código nativo).
6. **Transformaciones de clip** — posición, ancho/alto (escala), rotación, volteo horizontal/vertical, opacidad, punto de anclaje, recorte (crop) y modo de ajuste al cuadro.
7. **Pistas reubicables** — múltiples pistas de video y audio; se reordenan arrastrando su cabecera. El orden de las pistas de video define el orden de composición.
8. **Proyecto como carpeta** — al crear un proyecto se crea un directorio con un archivo de definición (`.vdproj`), al estilo de una solución de Visual Studio.
9. **Importación con decisión de ubicación** — al arrastrar un archivo, el usuario elige: dejarlo donde está, copiarlo al proyecto o moverlo al proyecto.
10. **Editor de transiciones integrado** — editor de código (Monaco) con vista previa en vivo, consola de errores y recarga automática.
11. **Documentación de ayuda** — guía de usuario y referencia de la API de transiciones, consultable desde la app sin conexión (F1, ayuda contextual) y publicada en GitHub Pages.

### Medios soportados
- Video: MP4/MOV/MKV/WebM/AVI (H.264, H.265, VP8/9, AV1, ProRes, MPEG-4) — todo lo que decodifique FFmpeg.
- Audio: MP3, WAV, AAC/M4A, OGG/Opus, FLAC.
- Imagen fija: PNG, JPG, WebP, BMP (duración por defecto 5 s, ajustable).

## Fuera de alcance (v1)

- Títulos/texto como clip independiente (la API de transiciones sí puede dibujar texto).
- Efectos de color/filtros persistentes sobre clips (solo transformaciones). Se evaluará en v2.
- Fotogramas clave (keyframes) en transformaciones y volumen → **fase 6** (ver hoja de ruta). El modelo de datos DEBE dejar espacio para ellos.
- Edición multicámara, corrección de color, estabilización, chroma key, subtítulos.
- Colaboración, nube, cuentas de usuario.
- Transiciones entre clips de pistas distintas.

## Principios

- **Lo que ves es lo que exportas**: vista previa y exportación usan el **mismo compositor** y la misma ejecución de transiciones.
- **No destructivo**: nunca se modifican los archivos fuente (salvo la acción explícita "mover al proyecto").
- **Determinista**: un frame dado siempre produce el mismo resultado, independientemente de cómo se llegó a él (scrubbing, reproducción o exportación).
- **Seguro**: el código de transiciones de terceros se ejecuta en un sandbox sin acceso al sistema.
- **Autocontenido**: funciona sin internet y no consulta nada en línea; fuentes, iconos, imágenes y documentación van dentro de la aplicación (ver 02 §Autocontenido).
- **Documentado**: ayuda integrada y sin conexión, publicada también en GitHub Pages (ver 09).
