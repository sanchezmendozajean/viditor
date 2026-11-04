# Línea de tiempo

La línea de tiempo muestra las pistas de **video** (arriba) y de **audio** (abajo). Un proyecto nuevo trae **V1, V2, A1 y A2**. Las pistas de video contienen el audio de sus clips.

## Agregar clips

- **Doble clic** en un medio del panel Proyecto: lo agrega al final de V1 (o de A1 si es audio).
- **Arrastrar** un medio del panel Proyecto (o archivos desde el explorador) a una pista. Los videos e imágenes solo entran en pistas de video y el audio en pistas de audio.
- Al soltar sobre otro clip se **sobrescribe** lo que hay debajo; mantén `Ctrl` para **insertar** y desplazar lo posterior.

## Editar clips

| Operación | Cómo |
|-----------|------|
| Seleccionar | Clic; `Ctrl`+clic alterna; `Mayús`+clic suma; arrastrar en un fondo de pista dibuja una marquesina |
| Mover | Arrastrar (con imán). `Alt`+arrastrar duplica |
| Recortar | Arrastrar el borde izquierdo o derecho. Está limitado por la duración del medio y por los clips vecinos |
| Dividir | Herramienta **Cuchilla** (`C`) y clic, o `Ctrl+K` en el cabezal |
| Eliminar | `Supr` deja un hueco; `Mayús+Supr` cierra el hueco |
| Eliminar hueco | Clic derecho en el hueco › *Eliminar hueco* |
| Recortar al cabezal | `Q` (inicio) y `W` (final), con cierre de hueco |
| Deshabilitar | `Mayús+E` |
| Separar audio | Clic derecho › *Separar audio* |

Los clips **no pueden solaparse** en una misma pista.

## Pistas

Cada cabecera tiene: asa **⋮⋮** para reordenar arrastrando (las pistas de video solo entre video y las de audio entre audio), nombre editable con doble clic, ocultar, bloquear, silenciar y solo. Las pistas de audio incluyen un control de volumen. Arrastra el borde inferior de una cabecera para cambiar su altura. El clic derecho abre el menú de pista: agregar arriba o abajo, duplicar, eliminar y contraer.

::: tip Orden de composición
Cambiar el orden de las pistas de video cambia el orden en que se componen: la de más arriba queda al frente.
:::

## Deshacer y rehacer

Todo cambio es un comando: `Ctrl+Z` deshace y `Ctrl+Shift+Z` (o `Ctrl+Y`) rehace, sin límite. Un arrastre continuo cuenta como un solo comando.

## Navegación

| Acción | Atajo |
|--------|-------|
| Frame anterior / siguiente | `←` / `→` (`Mayús`: 5 frames) |
| Borde de clip anterior / siguiente | `↑` / `↓` |
| Inicio / fin | `Home` / `End` |
| Agregar marcador | `M` |
| Zoom | `Alt`+rueda, `+` / `-`, `\` ajusta todo |
| Herramientas | `V` selección, `C` cuchilla, `H` mano |
| Imán | `S` |

Arrastra sobre la regla para mover el cabezal. El timecode usa el formato `HH:MM:SS:FF`.
