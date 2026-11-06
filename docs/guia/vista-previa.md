# Vista previa y reproducción

El **Monitor del programa** muestra la composición de todas las pistas de video en el instante del cabezal, de la pista más baja (fondo) a la más alta (frente). El monitor usa un compositor WebGL2; la exportación usará exactamente el mismo.

## Reproducir

| Acción | Cómo |
|--------|------|
| Reproducir / pausa | `Espacio` o el botón ▶ |
| Hacia delante ×1, ×2, ×4 | `L` (cada pulsación acelera) |
| Hacia atrás ×1, ×2, ×4 | `J` (se busca frame a frame, sin audio) |
| Pausa | `K` |
| Frame anterior / siguiente | `←` / `→` |
| Ir a un tiempo | clic en el timecode del monitor, escribe `HH:MM:SS:FF` y pulsa Intro |

Arrastrar sobre la regla de la línea de tiempo (*scrubbing*) muestra cada frame con precisión; al pausar siempre se renderiza a calidad completa.

## Calidad

El selector **Completa / ½ / ¼** reduce la resolución interna del compositor mientras reproduces, para equipos modestos. Si la vista previa no alcanza los fps del proyecto se descartan frames, pero el audio nunca se desincroniza.

## Proxies automáticos

Chromium no reproduce algunos formatos (ProRes, H.265 en algunas instalaciones, AVI antiguos, H.264 de 10 bits o 4:2:2). Al importarlos, Viditor genera en segundo plano un **proxy H.264** en `.viditor/cache/proxies/` y la vista previa lo usa en cuanto está listo; el progreso aparece en la barra de estado. El archivo original **nunca se modifica** y la exportación siempre lo usará a él.

::: tip
La carpeta `.viditor/cache/` se puede borrar sin riesgo: los proxies se vuelven a generar al abrir el proyecto.
:::
