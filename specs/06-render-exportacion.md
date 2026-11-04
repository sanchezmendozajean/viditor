# 06 · Render y exportación

## Vista previa

- **Monitor del programa** con el resultado compuesto en tiempo real (ver 02 §Modelo de render).
- Calidad de reproducción: Completa / ½ / ¼ (resolución interna del compositor). Al pausar se renderiza a calidad completa.
- Si el renderer no alcanza los fps del proyecto, descarta frames manteniendo sincronía con el reloj de audio (Web Audio es el reloj maestro).
- Caché de frames de transición en memoria (LRU, ~256 MB) indexada por `(transitionId, frame, hash de parámetros, versión del archivo)`.
- Indicador sobre la regla: barra verde (frames rápidos), amarilla (cerca del límite), roja (transición con error).

## Audio en vista previa

Grafo Web Audio por clip activo: `MediaElementSource → Gain(clip × fades × crossfade) → Gain(pista) → Gain(master) → Analyser → destino`. Los medidores leen los `AnalyserNode`.

## Exportación

Diálogo **Exportar** (Ctrl+M):

| Opción | Valores |
|--------|---------|
| Nombre y destino | `renders/<Nombre>.mp4` por defecto |
| Rango | Todo el proyecto / Entrada–Salida (I/O) |
| Preset | YouTube 1080p, YouTube 4K, Instagram vertical 1080×1920, WhatsApp 720p, Alta calidad (ProRes), Personalizado |
| Contenedor / códec de video | MP4 H.264, MP4 H.265, WebM VP9, MOV ProRes 422 |
| Códec de audio | AAC 192 kbps (MP4/MOV), Opus 160 kbps (WebM), PCM (ProRes) |
| Resolución / fps | Del proyecto (por defecto) o escalar |
| Calidad | CRF (deslizador Baja–Máxima) o bitrate objetivo |
| Aceleración por hardware | Auto / NVENC / QSV / AMF (Win) / VAAPI (Linux) / Desactivada — se detecta lo disponible con `ffmpeg -encoders` y una prueba corta |
| Al terminar | Abrir carpeta / Reproducir / Nada |

### Pipeline

1. `ExportService` (main) abre una **ventana offscreen** del renderer con el mismo motor (compositor + TransitionWorker).
2. Para cada frame `n`: se decodifican los frames fuente exactos con FFmpeg (un proceso decodificador por medio activo, `-ss` preciso + `rawvideo rgba` por pipe; se reutiliza el proceso mientras el clip siga activo), se componen y se lee el framebuffer (`readPixels`, o PBO doble búfer).
3. Los frames RGBA se escriben por pipe al `stdin` de un FFmpeg codificador (`-f rawvideo -pix_fmt rgba -s WxH -r fps -i -`).
4. **Audio**: se mezcla en el main con un `filter_complex` de FFmpeg generado desde el modelo (`atrim`, `asetpts`, `volume`, `afade`, `adelay`, `acrossfade`/curvas de igual potencia, `amix` con `normalize=0`, volumen master) a un WAV temporal, y se multiplexa con el video al final. (Alternativa futura: mezcla offline con `OfflineAudioContext` para garantizar paridad exacta con la vista previa.)
5. Progreso: frame actual / total, fps de render, tiempo restante, vista en miniatura del último frame. **Cancelar** borra el archivo parcial.

### Requisitos

- La exportación DEBE producir frames idénticos a la vista previa a calidad completa (mismo compositor, mismas display lists).
- Una transición con error durante la exportación detiene el proceso y muestra cuál, en qué tiempo y el mensaje.
- Se registra el comando FFmpeg y su salida en `.viditor/logs/export-<fecha>.log`.
- Exportar un **frame actual como PNG** (Ctrl+Shift+E).

## Rendimiento orientativo

1080p30, 2 pistas, sin hardware encoder: ≥ 1× tiempo real en un equipo de gama media. Con NVENC/QSV: ≥ 2×.
