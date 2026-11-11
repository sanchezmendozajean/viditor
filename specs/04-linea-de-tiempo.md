# 04 · Línea de tiempo y clips

## Pistas

- Dos tipos: **video** (V1, V2, …) y **audio** (A1, A2, …). Las de video aparecen arriba, las de audio abajo, separadas por una línea divisoria (como Premiere).
- Un proyecto nuevo trae **V1, V2, A1, A2**.
- Las pistas de video **contienen el audio de sus clips** (enfoque Movie Maker): un clip de video con audio no se divide en dos clips. Comando **Separar audio** (clic derecho) crea un clip de audio vinculado en la primera pista de audio libre y silencia el audio del clip de video.
- Cabecera de pista (izquierda):
  - Asa de arrastre (⋮⋮) para **reordenar**: se arrastra la cabecera arriba/abajo con una línea de inserción; las pistas de video solo se reordenan entre pistas de video y las de audio entre audio. Cambiar el orden de las pistas de video cambia el orden de composición.
  - Nombre editable (doble clic), color.
  - Video: 👁 ocultar, 🔒 bloquear, 🔊 silenciar, S solo.
  - Audio: 🔒 bloquear, M silenciar, S solo, mini-slider de volumen.
  - Altura redimensionable arrastrando el borde inferior.
- Menú de pista: Agregar pista arriba/abajo, Duplicar, Eliminar (si tiene clips, confirmar), Contraer.

## Clips en la línea de tiempo

Visual: rectángulo redondeado (2 px) con color por tipo (video violeta-azulado, audio verde, imagen celeste), nombre arriba a la izquierda, miniaturas (inicio + repetidas según zoom) y forma de onda en la mitad inferior si tiene audio. Línea de volumen horizontal (goma) arrastrable sobre el clip. Asas triangulares de **fundido de audio** en las esquinas superiores.

### Operaciones

| Operación | Cómo | Notas |
|-----------|------|-------|
| Seleccionar | Clic; Ctrl/Shift+clic multi; marquesina | |
| Mover | Arrastrar | Imán a bordes de clips, cabezal, marcadores, inicio (toggle **S**). Entre pistas del mismo tipo. Alt+arrastrar = duplicar |
| Recortar bordes | Arrastrar borde izquierdo/derecho | Limitado por la duración del medio. Las imágenes no tienen límite |
| Dividir | Herramienta Cuchilla (**C**) clic; o **Ctrl+K** en el cabezal sobre los clips seleccionados (o todos los de pistas desbloqueadas si no hay selección) | Genera dos clips con `in/out` contiguos |
| Eliminar | **Supr** deja hueco; **Shift+Supr** elimina y cierra hueco (ripple) | |
| Eliminar hueco | Clic derecho en un hueco › Eliminar hueco | |
| Recortar a cabezal | **Q** (recorta inicio hasta cabezal) / **W** (recorta fin desde cabezal) con ripple | |
| Deshabilitar | Shift+E | Se dibuja atenuado y no se renderiza |
| Velocidad | Reservado (v2) | |

- Los clips **no pueden solaparse** en una misma pista, excepto en una transición. Al soltar encima de otro clip: modo **sobrescribir** (por defecto) o **insertar** (manteniendo Ctrl), que desplaza lo posterior.
- Todo cambio pasa por un **sistema de comandos** con Deshacer/Rehacer ilimitado (Ctrl+Z / Ctrl+Shift+Z, Ctrl+Y). Arrastres continuos = un solo comando.

## Texto y formas

Panel Recursos › botón **+** › **Texto** / **Rectángulo**. Abre el mismo modal que «Insertar» un clip (en el cabezal, al final del elemento seleccionado, al final del contenido) y crea un recurso (`media.kind` = `text` | `shape`, sin archivo) con un clip de **1 s**.

- Las propiedades viven en el clip (`clip.generator`), no en el recurso: cada clip es editable por separado y copiar/pegar o dividir las conserva.
- Son una **capa superpuesta**: nunca sobrescriben otro clip. Van a la pista de video seleccionada si está libre en ese rango, si no a la primera libre de arriba abajo, y si no hay ninguna se crea una pista de video encima.
- Se dibujan en un canvas 2D (`layer-raster.ts`) que se entrega al mismo compositor que un fotograma de video; la exportación usa el mismo rasterizador. El tamaño del lienzo sale de `generatorSize` (compartido): cuadro del texto/forma + margen para contorno y sombra. Posición, escala, rotación y opacidad usan el `transform` normal.
- Inspector: texto, fuente (Source Sans 3 y JetBrains Mono van empaquetadas; las genéricas del sistema dependen del equipo), tamaño, negrita/cursiva, alineación, interlineado, color, cuadro (ancho/alto y «ajustar al texto»), contorno y sombra. En el rectángulo: tamaño, relleno, esquinas, contorno y sombra.
- **Pegar** (Ctrl+V) respeta la pista seleccionada: los clips del mismo tipo que la pista seleccionada se pegan en ella (conservando la separación entre pistas si se copiaron de varias).

## Transiciones en la línea de tiempo

Modelo de **solapamiento** (exactamente como lo concibió el autor): una transición de duración `d` entre el clip A (sale) y el clip B (entra) consiste en el **último `d` del clip A** superpuesto con el **primer `d` del clip B**.

- Al aplicar la transición, **B se desplaza `d` a la izquierda** (y con él todo lo posterior en la pista, ripple), creando el solape. La duración total se acorta en `d`.
- Al eliminarla, B vuelve a desplazarse `d` a la derecha.
- `d` no puede exceder la duración de A ni la de B (se limita y avisa).
- Se aplica arrastrando desde el panel **Transiciones** a la unión entre dos clips adyacentes (se resalta la unión al pasar por encima), o seleccionando la unión y pulsando **Ctrl+D** (transición por defecto, configurable; inicialmente *Fundido cruzado*).
- Se dibuja como un bloque semitransparente con patrón diagonal sobre el solape, con el nombre de la transición. Sus bordes se arrastran para cambiar la duración (simétricamente). Doble clic → Inspector con duración y parámetros de la transición.
- Audio durante la transición: según `audio` (crossfade de igual potencia por defecto, `cut` = corte en el punto medio, `none` = cada clip conserva su volumen).
- También existen "transiciones" al inicio de un clip sin clip previo o al final sin clip siguiente: el clip ausente se trata como una capa **transparente** (permite fundidos a negro/desde negro con la misma API).

## Transformaciones de clip (Inspector › Movimiento)

Se aplican al clip completo (sin keyframes en v1). Orden de aplicación: **crop → ajuste (fit) → escala → volteo → rotación (sobre el anclaje) → traslación → opacidad**.

| Propiedad | Control | Rango |
|-----------|---------|-------|
| Ajuste al cuadro | Desplegable: Ajustar / Rellenar / Estirar / Tamaño original | — |
| Posición X / Y | Scrubby number (arrastrar sobre el número, estilo Adobe) | px, relativo al centro |
| Ancho / Alto | Scrubby + candado de proporción | px resultantes (internamente `scaleX/Y`) |
| Escala | % uniforme (visible cuando proporción bloqueada) | 0–1000 % |
| Rotación | Scrubby + dial | grados, sin límite |
| Voltear | Botones H y V | booleano |
| Punto de anclaje | X/Y normalizado + selector de 9 puntos | 0–1 |
| Opacidad | Slider | 0–100 % |
| Recorte | Izq/Sup/Der/Inf | px del fuente |
| Restablecer | Botón ↺ por grupo | |

**Manipulación directa** en el Monitor del programa cuando un clip está seleccionado: caja delimitadora con 8 asas (escala; Shift = libre), asa de rotación sobre la caja (Shift = pasos de 15°), arrastrar el interior para mover, punto de anclaje visible. Guías de centrado con imán y zona segura opcional.

## Volumen

Tres niveles multiplicativos: `ganancia_final = clip.volume × track.volume × master`, más fundidos del clip y crossfades de transición.

- **Clip**: 0–200 % (mostrar también en dB: −∞ a +6 dB) en el Inspector › Audio, o arrastrando la goma sobre el clip. Silenciar clip. Fundido de entrada/salida (s).
- **Pista**: slider en la cabecera y en el **Mezclador de audio**.
- **General**: fader **Master** en el mezclador y en la barra del monitor.
- Medidores de nivel (dBFS, pico + RMS) estéreo para master y por pista. Indicador de recorte (clip) en rojo.
- Solo: si alguna pista está en solo, solo suenan las pistas en solo.

## Reproducción y navegación

| Acción | Atajo |
|--------|-------|
| Reproducir / pausa | Espacio |
| Retroceder / pausa / avanzar (velocidades ×1, ×2, ×4) | J / K / L |
| Frame anterior / siguiente | ← / → |
| Clip anterior / siguiente (bordes) | ↑ / ↓ |
| Inicio / fin | Home / End |
| Marcar entrada / salida (rango de exportación) | I / O |
| Agregar marcador | M |
| Zoom línea de tiempo | Alt+rueda, + / −, \ (ajustar todo) |
| Herramientas | V selección, C cuchilla, H mano |

- Regla de tiempo con timecode `HH:MM:SS:FF`. Cabezal azul con línea roja/azul a través de las pistas (estilo Premiere: cabezal azul).
- Scrubbing arrastrando en la regla, con audio de scrub opcional.
