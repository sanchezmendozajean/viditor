# La regla de oro

> **Cada frame empieza desde cero.**

Al comenzar cada llamada a `render`, todas las capas, partes y figuras vuelven a su estado base: transformación identidad, `alpha` 1, visibles, sin filtros. Las llamadas como `move()` o `scale()` describen **el estado de ese frame**; no se acumulan entre frames.

```js
function render(leaveClip, enterClip, progress) {
  leaveClip.move(progress * screen.width, 0);
}
```

En `progress = 0.5` el clip está desplazado media pantalla, sin importar si el frame anterior fue el `0.1` o el `0.9`. Por eso funciona el *scrubbing* (arrastrar el cabezal en cualquier dirección) y por eso la exportación produce exactamente lo que ves en la vista previa.

## Consecuencias

- `render` debe ser una **función pura** de `progress`, `ctx` y el estado creado en `init`.
- ❌ No uses contadores que crezcan en cada frame:

  ```js
  let x = 0;
  function render(leaveClip) { x += 10; leaveClip.move(x, 0); } // ¡MAL!
  ```

  ✅ Calcula el valor desde `progress`:

  ```js
  function render(leaveClip, enterClip, progress) { leaveClip.move(progress * 100, 0); }
  ```

- Lo que se crea en **`init`** (por ejemplo `splitGrid`) se reutiliza en cada frame, y también vuelve a su base cada frame.
- Lo que se crea dentro de **`render`** (por ejemplo `draw.rect`) solo existe en ese frame.
- Dentro de un mismo frame las llamadas **sí se componen**, en el orden en que se invocan: `move(10, 0).move(5, 0)` desplaza 15.

## Aleatoriedad determinista

`Math.random` y `Date` están deshabilitados. Usa `ctx.random()`: un generador determinista sembrado por la instancia (`ctx.seed`, editable en el Inspector). Su secuencia se reinicia en `init` y en **cada** `render`, así que el mismo frame siempre recibe los mismos números.

```js
function init(leaveClip, enterClip, ctx) {
  parts = leaveClip.splitGrid(8, 6);
  // Se calcula una vez: dirección de cada pieza
  motion = parts.map(() => ({ angle: ctx.random() * Math.PI * 2 }));
}
```
