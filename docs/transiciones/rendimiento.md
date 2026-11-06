# Rendimiento

`render` se ejecuta en cada frame de la vista previa, así que su coste importa.

## Presupuesto

| Concepto | Límite |
|----------|--------|
| `render` en la vista previa | **8 ms** por frame recomendado; si supera **50 ms** tres veces seguidas, la transición se desactiva y se muestra un corte seco |
| `init` | 500 ms |
| Exportación | 2 s por frame (excederlo cancela la exportación con un mensaje claro) |
| Partes por capa | 4 096 |
| Figuras por frame | 10 000 |

## Cómo mantenerla rápida

- **Cachea en `init`** lo que no cambia entre frames: `splitGrid`, tablas de movimiento, colores calculados. En `render` solo aplica el estado de ese frame.
- **Pocas partes.** Una cuadrícula de 8×6 son 48 partes; 64×64 son 4 096 y puede tardar. Cada parte se dibuja por separado.
- **Pocas figuras.** Para muchas formas iguales, prefiere partes o una sola figura con un trazado (`draw.path`).
- Los filtros `blur` y la máscara con `feather` grande son los más caros; úsalos con moderación.
- No crees objetos grandes dentro de `render` si puedes crearlos una vez en `init`.

## Caché

Viditor guarda las display lists ya calculadas por transición y frame: al repetir un frame (volver atrás, pausar, exportar) no se vuelve a ejecutar tu código.
