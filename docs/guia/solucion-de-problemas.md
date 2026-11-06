# Solución de problemas

## Faltan archivos de medios

Si al abrir un proyecto un archivo ya no está donde estaba, el panel **Proyecto** muestra un aviso rojo y el medio aparece marcado. Pulsa **Revincular…** (en el aviso, en el medio o en el menú contextual de un clip) y elige el archivo en su nueva ubicación. Viditor revincula también, de una vez, todos los demás medios que falten **y estén en esa misma carpeta con el mismo nombre**. El proyecto se guarda enseguida.

Viditor nunca modifica ni mueve tus archivos al revincular.

## El video no se reproduce o va a saltos

- Los archivos pesados (4K, H.265, ProRes) se reproducen desde un **proxy** H.264 ligero que se genera en segundo plano; el progreso aparece en la barra de estado. Hasta que termina, la reproducción puede ir entrecortada. La **exportación siempre usa el archivo original**.
- Baja la calidad de la vista previa en el monitor (½, ¼) si tu equipo va justo.
- Algunos códecs no tienen decodificador en el reproductor integrado; el proxy resuelve la vista previa y la exportación decodifica con FFmpeg.

## La exportación falla

Cada exportación guarda un registro en `.viditor/logs/export-<fecha>.log`, dentro del proyecto, con el comando de FFmpeg y su salida. Es lo primero que conviene mirar o adjuntar en un informe.

| Síntoma | Qué hacer |
|---------|-----------|
| «La transición "X" falló en 00:00:03:12…» | Abre la transición en el editor y revisa la consola. Una transición que tarda más de 2 s en un frame se aborta. |
| Faltan medios | Revincúlalos antes de exportar (ver arriba). |
| La aceleración por hardware falla | En **Aceleración** elige *Desactivada*: se usará el codificador por software. |
| Va más lenta que el tiempo real | Prueba la aceleración por hardware, un preset más ligero o una resolución menor. Las transiciones con muchas partes o `blur` grande son lo más costoso. |

## Aceleración por hardware

Las opciones disponibles se detectan **con una codificación de prueba real**, así que solo aparecen las que funcionan en tu equipo: NVENC (NVIDIA), Quick Sync (Intel) y AMF (AMD) en Windows; VAAPI en Linux. Actualiza el controlador de la tarjeta gráfica si una opción esperada no aparece.

## Una transición no aparece o falla

- Revisa la consola del espacio **Transiciones**: muestra errores con línea y columna.
- Si el archivo `.js` de un proyecto falta, la unión se reproduce y exporta como un corte seco.
- Consulta [Depuración](/transiciones/depuracion).

## Restaurar una copia

Viditor guarda copias automáticas en `.viditor/backups/` (las últimas 10). Para recuperar una, ábrela con **Archivo › Abrir proyecto…**.
