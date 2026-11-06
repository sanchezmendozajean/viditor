# Depuración

## La consola

El espacio **Transiciones** tiene una consola en la parte inferior:

- Lo que escribas con `log(...)` (limitado a 200 líneas por segundo).
- Los **errores** con el número de línea de tu archivo: haz clic en «línea N» para saltar a ella en el editor.
- El **tiempo medio** de `render` en ms por frame (el presupuesto es de 8 ms; se resalta si lo superas).

El editor subraya también los errores de sintaxis mientras escribes.

## Qué significan los errores

| Mensaje | Causa y solución |
|---------|------------------|
| `meta inválido: …` | Falta `apiVersion: 1`, `id` o `name`, o hay un parámetro mal definido. |
| `meta.id debe coincidir con el nombre del archivo` | Renombra el archivo o cambia el `id`. |
| `Falta la función render(…)` | Todo archivo necesita `function render(leaveClip, enterClip, progress, ctx)`. |
| `SyntaxError: …` | Error de sintaxis; la consola indica la línea. |
| `l.noExiste is not a function` | Estás llamando a un método que la API no tiene. Mira la [referencia](/api/). |
| `Math.random está deshabilitado` | Usa `ctx.random()`. |
| `Date está deshabilitado` | Usa `ctx.time` o `progress`. |
| `fetch está deshabilitado` | Las transiciones no tienen acceso a la red ni al disco. |
| `Demasiadas partes` / `Demasiadas figuras` | Límite de 4 096 partes por capa y 10 000 figuras por frame. |
| `Tiempo excedido… ¿hay un bucle infinito?` | Tu código no terminó: se detuvo el worker. Revisa los bucles y recarga. |
| `render() superó 50 ms tres veces seguidas` | La transición era demasiado pesada: se desactivó y se muestra un corte seco. Usa menos partes o figuras. |

## Qué pasa si una transición falla

Un error en un `.js` **nunca tumba la aplicación**. La transición se marca en rojo en la línea de tiempo, se renderiza como un **corte seco** y el error queda en la consola. Al guardar el archivo corregido se recarga sola.

## Consejos

- Prueba con `progress` fijo arrastrando la barra de la vista previa y usa `log(progress.toFixed(2), valor)`.
- Activa la **rejilla** de la vista previa para comprobar posiciones.
- Si el resultado depende de `ctx.random()`, cambia la **semilla** en el Inspector para ver otras variantes.
