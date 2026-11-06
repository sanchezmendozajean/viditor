# Recetas

## Fundidos con `alpha`

```js
function render(leaveClip, enterClip, progress) {
  // El entrante queda opaco debajo y el saliente se desvanece encima:
  // mezcla exacta saliente·(1−p) + entrante·p
  leaveClip.alpha(1 - progress);
}
```

::: warning Fundir los dos a la vez
Si haces `leaveClip.alpha(1 - p)` **y** `enterClip.alpha(p)`, a mitad de la transición el resultado se oscurece (`0,5·saliente + 0,25·entrante + 0,25·fondo`), porque las capas se componen una sobre otra. Deja el entrante opaco o usa `dip-to-black` si quieres pasar por un color.
:::

## Deslizamientos

```js
function render(leaveClip, enterClip, progress, ctx) {
  const p = ease[ctx.params.easing](progress);
  leaveClip.move(p * screen.width, 0);
  enterClip.move((p - 1) * screen.width, 0);
}
```

## Cuadrícula con escalonado (`math.stagger`)

```js
let parts;
function init(leaveClip, enterClip, ctx) { parts = leaveClip.splitGrid(4, 3); }

function render(leaveClip, enterClip, progress, ctx) {
  for (let i = 0; i < parts.length; i++) {
    // Cada parte empieza un poco después que la anterior
    const local = math.stagger(i, parts.length, progress, 0.5);
    parts[i].scale(1 - ease.inCubic(local));
  }
}
```

`math.stagger(index, count, progress, overlap)` devuelve el progreso local (0–1) de cada elemento: con `overlap = 0` se animan uno tras otro y con `overlap = 1` todos a la vez.

## Máscaras con borde suave (`feather`)

```js
function render(leaveClip, enterClip, progress, ctx) {
  const maxR = Math.hypot(screen.width, screen.height) / 2;
  const hole = draw.circle(screen.width / 2, screen.height / 2, progress * maxR);
  enterClip.z(2).mask(hole, { feather: 12 }); // el entrante aparece dentro del círculo
}
```

La figura que se usa como máscara **no se dibuja**. Con `invert: true` se ve lo de fuera de la figura.

## Aleatoriedad determinista

```js
let parts, motion;
function init(leaveClip, enterClip, ctx) {
  parts = leaveClip.splitGrid(8, 6);
  motion = parts.map(() => ({ angle: ctx.random() * Math.PI * 2, spin: (ctx.random() - 0.5) * 720 }));
}
function render(leaveClip, enterClip, progress) {
  for (const part of parts) {
    const m = motion[part.index];
    part.move(Math.cos(m.angle) * progress * 800, Math.sin(m.angle) * progress * 800).rotate(m.spin * progress).alpha(1 - progress);
  }
}
```

## Pasar por un color

```js
function render(leaveClip, enterClip, progress, ctx) {
  if (progress < 0.5) { enterClip.visible(false); draw.fill(ctx.params.color).alpha(progress * 2); }
  else { leaveClip.visible(false); draw.fill(ctx.params.color).alpha((1 - progress) * 2); }
}
```

## Filtros

```js
leaveClip.grayscale(progress).blur(Math.sin(progress * Math.PI) * 30).brightness(1 - progress * 0.5);
```
