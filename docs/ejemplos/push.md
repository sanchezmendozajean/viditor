# Empujar

El clip entrante entra empujando al saliente, que solo se desplaza un poco y se oscurece.

- **Categoría:** Deslizar
- **Duración por defecto:** 0.8 s
- **Audio:** crossfade
- **Referencia:** `builtin:push`

## Parámetros

| Parámetro | Tipo | Valor por defecto |
|-----------|------|-------------------|
| Dirección (`direction`) | `enum` | `"izquierda"` |
| Suavizado (`easing`) | `easing` | `"inOutCubic"` |
| Desplazamiento del saliente (`parallax`) | `number` | `0.3` |

## Código

<<< @/../resources/transitions/push.js

::: tip Úsala como punto de partida
En la aplicación: clic derecho sobre la transición › **Duplicar para editar**. Se copia a tu carpeta y se abre en el editor.
:::
