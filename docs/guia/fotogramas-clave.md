# Fotogramas clave

Un **fotograma clave** fija el valor de una propiedad en un instante; entre dos fotogramas, Viditor interpola. Sirven para mover, escalar, rotar, desvanecer o subir y bajar el volumen de un clip a lo largo del tiempo.

![Inspector con los rombos de fotograma clave junto a cada propiedad](/capturas/inspector-fotogramas-clave.png)

## Qué se puede animar

| Propiedad | Dónde |
|-----------|-------|
| Posición (X, Y) | Inspector › Movimiento |
| Escala / Ancho y Alto | Inspector › Movimiento |
| Rotación | Inspector › Movimiento |
| Opacidad | Inspector › Opacidad |
| Volumen del clip | Inspector › Audio |

## Cómo animar

1. Selecciona un clip y coloca el cabezal sobre él.
2. Pulsa el **rombo** junto al nombre de la propiedad (Posición, Escala, Rotación, Opacidad o Volumen). Se crea un fotograma con el valor actual y la propiedad pasa a estar *animada* (rombo con borde azul).
3. Mueve el cabezal a otro instante y **cambia el valor**, ya sea en el Inspector o arrastrando en el monitor: Viditor crea o actualiza el fotograma de ese instante automáticamente.
4. Reproduce para ver el movimiento.

Sobre el rombo:

| Acción | Efecto |
|--------|--------|
| Clic | Agrega un fotograma en el cabezal o, si ya hay uno, lo quita |
| `‹` / `›` | Salta al fotograma anterior o siguiente |
| Clic derecho | Quita **toda** la animación de esa propiedad (conserva el valor actual) |

Los fotogramas aparecen como pequeños rombos amarillos en la parte baja del clip, en la línea de tiempo. También puedes usar los comandos de **Clip › Fotograma clave…** y de la paleta de comandos (`Ctrl+Mayús+P`).

Si quitas el último fotograma de una propiedad, deja de estar animada y conserva el valor que tenía.

## Interpolación

Cuando el cabezal está sobre un fotograma, el Inspector muestra **Interpolación desde este fotograma**, que rige el tramo hasta el siguiente:

| Tipo | Comportamiento |
|------|----------------|
| **Lineal** | Velocidad constante |
| **Suave** | Arranca y termina despacio (curva *smoothstep*) |
| **Mantener** | El valor no cambia hasta el siguiente fotograma (salto) |

Antes del primer fotograma y después del último, el valor se mantiene.

## Recortar y dividir

Los fotogramas se anclan al **contenido** del clip, no a su posición en la línea de tiempo. Si recortas el principio del clip o lo mueves, la animación acompaña a las imágenes; al dividir un clip, cada mitad conserva los fotogramas que le corresponden.

## Vista previa y exportación

La vista previa y la exportación evalúan la animación con las mismas funciones, así que el resultado exportado coincide con lo que ves. El volumen animado se mezcla en la exportación igual que lo oyes en la reproducción.

::: tip Restablecer
El botón **↺** de cada grupo del Inspector restablece los valores **y quita su animación**. «Restablecer transformación» del menú contextual del clip hace lo mismo con todo el movimiento.
:::
