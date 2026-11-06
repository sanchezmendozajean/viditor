# Exportar

Abre el espacio de trabajo **Exportar** (pestaña superior o `Ctrl+M`). A la izquierda está el formulario; abajo, la cola con el progreso.

![Espacio Exportar con el formulario y la cola](/capturas/exportar.png)

## Lo que ves es lo que exportas

La exportación usa **el mismo compositor y las mismas display lists de transición** que la vista previa a calidad completa. Los frames fuente se leen del archivo **original** con FFmpeg (nunca del proxy), así que un clip ProRes se exporta con su calidad real aunque en la vista previa se reproduzca desde un proxy.

## Opciones

| Opción | Valores |
|--------|---------|
| **Preset** | YouTube 1080p · YouTube 4K · Instagram vertical 1080×1920 · WhatsApp 720p · Alta calidad (ProRes) · Personalizado |
| **Destino** | `renders/<Nombre>.mp4` dentro del proyecto. No sobrescribe: añade ` (2)`, ` (3)`… |
| **Rango** | Todo el proyecto, o Entrada–Salida (marca con `I` y `O` en la línea de tiempo) |
| **Formato** | MP4 H.264 · MP4 H.265 · WebM VP9 · MOV ProRes 422 |
| **Audio** | AAC 192 kbps (MP4) · Opus 160 kbps (WebM) · PCM 16 bits (ProRes) |
| **Resolución / fotogramas** | Los del proyecto, o escalados |
| **Calidad** | Deslizador Baja–Máxima (calidad constante) o bitrate objetivo |
| **Aceleración** | Automática, desactivada o NVENC / Quick Sync / AMF (Windows) / VAAPI (Linux), según lo que funcione en tu equipo |
| **Al terminar** | Abrir la carpeta · Reproducir · Nada |

Cualquier ajuste manual convierte el preset en **Personalizado**.

::: tip Resolución con otro aspecto
Si la resolución de salida tiene otra proporción que el proyecto (por ejemplo 1080×1920 desde un proyecto 16:9), los clips se **reencuadran** con su ajuste (ajustar / rellenar). Si solo cambia la escala, el resultado es el mismo cuadro a otro tamaño.
:::

## Exportar un fotograma

`Ctrl+Mayús+E` (o **Archivo › Exportar fotograma actual…**) guarda el fotograma del cabezal como **PNG** a la resolución del proyecto, con el mismo compositor que la vista previa y la exportación.

## Cómo se hace

1. Se mezcla el **audio** con las mismas ganancias que oyes (clip × pista × general, fundidos y crossfades de transición) a 48 kHz estéreo.
2. Para cada frame se decodifica exactamente el fotograma fuente, se calculan las transiciones, se compone en WebGL2 y se envía al codificador de FFmpeg.
3. Al terminar se publica el archivo. **Cancelar** borra el archivo parcial.

## Errores durante la exportación

Si una transición falla (error de ejecución, bucle infinito, o más de 2 s en un frame), la exportación se detiene y la cola indica **qué transición, en qué tiempo y el mensaje**. Una transición cuyo archivo falta se exporta como corte seco, igual que en la vista previa.

## Registro

Cada exportación guarda el comando de FFmpeg y su salida en `.viditor/logs/export-<fecha>.log` dentro del proyecto. Es lo primero que conviene adjuntar si algo falla.

## Rendimiento

Referencia en un equipo de gama media: 1080p30 con 2 pistas, sin codificador por hardware, alrededor de tiempo real. Con NVENC/Quick Sync suele ser bastante más rápido. Las transiciones pesadas (muchas partes, `blur` grande) son lo que más cuesta; consulta [Rendimiento](/transiciones/rendimiento).
