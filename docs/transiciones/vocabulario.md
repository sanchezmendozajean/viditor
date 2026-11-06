# Vocabulario

La API usa cuatro palabras con un significado fijo. Conocerlas evita confusiones.

| Término | Significado |
|---------|-------------|
| **clip** | Un clip de video o imagen: `leaveClip` (el que sale), `enterClip` (el que entra) y `ClipPart` (una parte de un clip). Nunca se usa como verbo. |
| **crop** | Quitar bordes del medio fuente. Solo existe en la transformación base del clip (Inspector › Movimiento), **no** en la API de transiciones. |
| **mask** | Visibilidad por región dentro de una transición, con borde duro o suave (`feather`): `layer.mask(shape, { feather })`. |
| **split** | Dividir una capa en piezas independientes: `splitGrid` y `splitStrips`. |

## `leaveClip` y `enterClip`

Son dos **capas** de pantalla completa. `leaveClip` es lo que había antes de la transición y `enterClip` lo que viene después. Si la transición está al principio de un clip sin clip anterior, `ctx.hasLeave` es `false` y la capa saliente es transparente (así se hacen los fundidos desde/hacia nada con la misma API).

## Capa, parte y figura

| Objeto | Cómo se obtiene | Qué puede hacer |
|--------|-----------------|-----------------|
| `Layer` | `leaveClip`, `enterClip` | Transformar, filtros, máscara, dividir |
| `ClipPart` | `layer.splitGrid()` / `layer.splitStrips()` | Transformar y filtros; propiedades `index`, `col`, `row`, `x`, `y`, `cx`, `cy`… |
| `Shape` | `draw.rect()`, `draw.circle()`… | Transformar; usarse como máscara |

Mientras una capa tenga partes, **la capa original no se dibuja**: se dibujan sus partes.
