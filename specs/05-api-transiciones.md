# 05 · API de transiciones (apiVersion 1)

## Lenguaje: JavaScript

Se usa **JavaScript estándar (ES2022)**. Razones:
- Ya lo ejecuta el motor V8 de Electron, sin intérprete adicional.
- Sintaxis familiar y cercana a los ejemplos propuestos.
- Con un archivo de tipos (`viditor-transitions.d.ts`) Monaco ofrece **autocompletado y verificación** como si fuera TypeScript. Se PUEDE escribir en TypeScript (`.ts`) en una versión posterior (transpilado con esbuild en el worker).

Diferencias respecto al pseudocódigo original:
- Las funciones se declaran con `function`: `function render(leaveClip, enterClip, progress) { … }`.
- Los bucles usan `let`, no `int`: `for (let i = 0; i < parts.length; i++)` (o `for (const p of parts)`).

## Archivo de transición

Un archivo `.js` = una transición. Estructura:

```js
// Metadatos (obligatorio)
const meta = {
  apiVersion: 1,
  id: "slide-horizontal",          // único en su carpeta; [a-z0-9-]
  name: "Deslizamiento horizontal",
  category: "Deslizar",             // agrupa en el panel Transiciones
  author: "Pols",
  description: "El clip entrante empuja al saliente hacia la derecha.",
  defaultDuration: 1.0,             // segundos
  audio: "crossfade",               // crossfade | cut | none
  params: {                         // aparecen en el Inspector
    direction: { type: "enum", label: "Dirección", options: ["derecha", "izquierda"], default: "derecha" },
    easing:    { type: "easing", label: "Suavizado", default: "inOutCubic" }
  }
};

// Estado propio (opcional) — variables de nivel superior
let parts;

// Se llama una vez por instancia de transición (opcional)
function init(leaveClip, enterClip, ctx) { }

// Se llama en cada frame (obligatorio)
function render(leaveClip, enterClip, progress, ctx) { }
```

- `progress` va de **0** (primer frame del solape) a **1** (último frame), lineal. El suavizado lo aplica el autor: `const p = ease.inOutCubic(progress)` o `ease[ctx.params.easing](progress)`.
- Tipos de parámetro: `number` (`min`, `max`, `step`), `int`, `boolean`, `color`, `enum`, `easing`, `angle`, `point` (x,y normalizados).

## Ciclo de vida

1. **Carga**: el `TransitionRegistry` descubre los `.js`, el worker los evalúa y extrae `meta`, `init`, `render`. Errores de sintaxis o `meta` inválido → la transición aparece con ⚠ en el panel y su error en la consola.
2. **Instancia**: cada transición colocada en la línea de tiempo tiene su propia instancia (su propio estado de nivel superior). Al crearla o al cambiar duración/parámetros se llama `init(leaveClip, enterClip, ctx)`.
3. **Frame**: para cada frame dentro del solape se llama `render(leaveClip, enterClip, progress, ctx)`.
4. **Recarga en caliente**: al guardar el archivo, se re-evalúa y se vuelven a crear las instancias; la vista previa se actualiza.

### Regla de oro: cada frame empieza desde cero

Al comenzar cada llamada a `render`, **todas las capas, partes y figuras vuelven a su estado base** (transformación identidad, `alpha` 1, visibles, sin filtros). Las llamadas como `move()` o `scale()` describen **el estado de ese frame**, no se acumulan entre frames.

Por eso `leaveClip.move(progress * screen.width, 0)` funciona: en `progress = 0.5` el clip está desplazado media pantalla, sin importar si el frame anterior fue el 0.1 o el 0.9 (scrubbing).

Consecuencias:
- `render` DEBE ser **función pura de `progress`, `ctx` y el estado creado en `init`**. No usar contadores que se incrementen en cada frame.
- Lo que se crea en `init` (p. ej. `splitGrid`) se reutiliza en cada frame y también vuelve a su base cada frame.
- Lo que se crea dentro de `render` (p. ej. `draw.rect`) solo existe en ese frame.
- Dentro de un mismo frame, las llamadas **sí se componen** en el orden en que se invocan: `move(10,0).move(5,0)` = desplazar 15.
- Aleatoriedad: usar `ctx.random()` (determinista, sembrado por la instancia). `Math.random` y `Date` están deshabilitados.

## Vocabulario

| Término | Uso exclusivo |
|---------|---------------|
| **clip** | Un clip de video/imagen (`leaveClip`, `enterClip`, `ClipPart` = parte de un clip). Nunca se usa como verbo |
| **crop** | Quitar bordes del medio fuente; solo en la transformación base del clip (Inspector), no en la API de transiciones |
| **mask** | Visibilidad por región dentro de una transición, con borde duro o suave (`feather`) |
| **split** | Dividir una capa en piezas independientes (`splitGrid`, `splitStrips`) |

## Sistema de coordenadas

- Píxeles de la **resolución del proyecto**: origen arriba-izquierda, X a la derecha, Y hacia abajo. `screen.width`, `screen.height`.
- Ángulos en **grados**, positivo = horario.
- Cada capa (clip) ocupa todo el cuadro (ya con su transformación base aplicada: un clip reducido al 50 % es un rectángulo pequeño dentro de una capa de pantalla completa transparente).
- Pivote por defecto de capas, partes y figuras: su **centro**. Se cambia con `pivot(px, py)` en coordenadas normalizadas (0–1) del propio elemento.
- Orden de aplicación en un elemento: `scale → flip → rotate (sobre el pivote) → move`. El orden de las llamadas entre distintos tipos no altera este orden; llamadas del mismo tipo se acumulan.

## Orden de dibujo

Por defecto, de atrás hacia adelante: **enterClip**, **leaveClip**, figuras dibujadas (en orden de creación). Se cambia con `.z(n)` (mayor = más adelante; base enter=0, leave=1, figuras=2).

## Referencia de la API

### Objetos globales

| Global | Descripción |
|--------|-------------|
| `screen` | `{ width, height, fps, aspect }` |
| `draw` | Fábrica de figuras (ver abajo) |
| `ease` | Funciones de suavizado: `linear, inQuad, outQuad, inOutQuad, inCubic, outCubic, inOutCubic, inQuart, outQuart, inOutQuart, inExpo, outExpo, inOutExpo, inBack, outBack, inOutBack, outBounce, outElastic` |
| `math` | `lerp(a,b,t)`, `clamp(v,min,max)`, `smoothstep(e0,e1,x)`, `map(v,inMin,inMax,outMin,outMax)`, `degToRad`, `radToDeg`, `stagger(index, count, progress, overlap)` |
| `color` | `rgb(r,g,b,a?)`, `hsl(h,s,l,a?)`, `mix(c1,c2,t)` — también se aceptan strings CSS `"#ff0000"` |
| `log(...args)` | Escribe en la consola del editor de transiciones (limitado a 200 líneas/s) |

### `ctx` (contexto de la instancia)

| Propiedad | Descripción |
|-----------|-------------|
| `ctx.params` | Valores de los parámetros definidos en `meta.params` |
| `ctx.duration` | Duración en segundos |
| `ctx.frame` / `ctx.totalFrames` | Índice del frame actual (0…n−1) y total |
| `ctx.time` | Segundos transcurridos dentro de la transición |
| `ctx.random()` | Número pseudoaleatorio [0,1) determinista; la secuencia se reinicia en `init` y en cada `render` (mismo frame ⇒ mismos números) |
| `ctx.seed` | Semilla de la instancia (editable en el Inspector) |
| `ctx.hasLeave` / `ctx.hasEnter` | `false` si la transición está al inicio/fin de un clip sin vecino |

### `Layer` — `leaveClip`, `enterClip`

Todos los métodos de transformación devuelven el propio objeto (encadenables).

| Método | Descripción |
|--------|-------------|
| `move(dx, dy)` | Traslada en píxeles |
| `scale(s)` / `scale(sx, sy)` | Escala (1 = original) |
| `rotate(deg)` | Rota sobre el pivote |
| `pivot(px, py)` | Pivote normalizado (0–1) |
| `flip(h, v)` | Volteo horizontal/vertical (booleanos) |
| `alpha(a)` | Transparencia del elemento en ese frame: **0** = invisible, **1** = opaco. Se multiplica con la opacidad base del clip (Inspector) y, si se llama varias veces en el mismo frame, los valores se multiplican entre sí. Valores fuera de rango se limitan a 0–1. `opacity(a)` es un alias |
| `visible(bool)` | Muestra/oculta |
| `z(n)` | Orden de dibujo |
| `mask(shape, { invert = false, feather = 0 })` | Usa una figura como máscara alfa (la figura no se dibuja). Con `feather: 0` el borde es duro; para recortar a un rectángulo: `layer.mask(draw.rect(x, y, w, h))` |
| `brightness(v)` · `contrast(v)` · `saturation(v)` | 1 = sin cambio |
| `grayscale(a)` · `invert(a)` · `sepia(a)` | 0–1 |
| `tint(color, amount)` | Mezcla con un color |
| `blur(px)` | Desenfoque gaussiano |
| `pixelate(px)` | Tamaño del bloque |
| `splitGrid(cols, rows)` → `ClipPart[]` | Divide la capa en `cols × rows` partes. Mientras existan partes, la capa original no se dibuja; se dibujan sus partes |
| `splitStrips(n, "horizontal" \| "vertical")` → `ClipPart[]` | Atajo: franjas |
| `width` / `height` | Tamaño de la capa (= pantalla) |

### `ClipPart`

Hereda todos los métodos de transformación y filtro de `Layer` (excepto `splitGrid`/`splitStrips`). Propiedades de solo lectura:

| Propiedad | Descripción |
|-----------|-------------|
| `index` | Posición en el arreglo (fila por fila, de izquierda a derecha) |
| `col`, `row` | Columna y fila |
| `x`, `y`, `width`, `height` | Rectángulo original en pantalla |
| `cx`, `cy` | Centro original |

Las partes se transforman respecto a su propio centro (por defecto).

### `draw` — figuras

| Fábrica | Descripción |
|---------|-------------|
| `draw.rect(x, y, w, h, style?)` | `style.radius` para esquinas redondeadas |
| `draw.circle(cx, cy, r, style?)` | |
| `draw.ellipse(cx, cy, rx, ry, style?)` | |
| `draw.line(x1, y1, x2, y2, style?)` | |
| `draw.polygon(points, style?)` | `points = [[x,y], …]` |
| `draw.path(svgPathData, style?)` | Sintaxis `d` de SVG |
| `draw.star(cx, cy, points, rOuter, rInner, style?)` | |
| `draw.text(str, x, y, style?)` | `font`, `size`, `weight`, `align` |
| `draw.fill(color)` | Cubre toda la pantalla |

`style`: `{ fill, stroke, strokeWidth, opacity, gradient }` donde `gradient = { type: "linear"|"radial", stops: [[0,"#000"],[1,"#fff"]], from:[x,y], to:[x,y] }`.

Las figuras devuelven un `Shape` con los mismos métodos de transformación (`move`, `scale`, `rotate`, `pivot`, `alpha`, `z`, `visible`) y pueden usarse como máscara (`layer.mask(shape)`); al usarse como máscara dejan de dibujarse.

## Ejemplos

**Deslizamiento horizontal** (el del enunciado, corregido):
```js
const meta = { apiVersion: 1, id: "slide-h", name: "Deslizar horizontal", defaultDuration: 1 };

function render(leaveClip, enterClip, progress) {
  const p = ease.inOutCubic(progress);
  leaveClip.move(p * screen.width, 0);
  enterClip.move((p - 1) * screen.width, 0);
}
```

**Fundido cruzado** (uso de `alpha`):
```js
const meta = { apiVersion: 1, id: "crossfade", name: "Fundido cruzado", defaultDuration: 1 };

function render(leaveClip, enterClip, progress) {
  leaveClip.alpha(1 - progress); // el saliente se vuelve transparente
  enterClip.alpha(progress);     // el entrante aparece
}
```

**Cuadrícula que se encoge** (el del enunciado, corregido):
```js
const meta = { apiVersion: 1, id: "grid-shrink", name: "Cuadrícula que se encoge", defaultDuration: 1 };

let leaveParts;

function init(leaveClip, enterClip) {
  leaveParts = leaveClip.splitGrid(4, 3); // 12 partes: 4 columnas, 3 filas
}

function render(leaveClip, enterClip, progress) {
  for (let i = 0; i < leaveParts.length; i++) {
    leaveParts[i].scale(1 - progress);
  }
}
```

Más ejemplos en [`transiciones/ejemplos/`](transiciones/ejemplos/).

## Transiciones integradas (v1)

Todas escritas con esta API y ubicadas en `resources/transitions/` (sirven de documentación viva):

| id | Nombre |
|----|--------|
| `crossfade` | Fundido cruzado (por defecto) |
| `dip-to-black` | Fundido a negro |
| `dip-to-white` | Fundido a blanco |
| `slide-horizontal` | Deslizar (parámetro dirección) |
| `push` | Empujar (4 direcciones) |
| `wipe` | Barrido (ángulo, suavizado de borde) |
| `iris-circle` | Iris circular |
| `grid-shrink` | Cuadrícula que se encoge |
| `blinds` | Persianas |
| `zoom-in` | Acercamiento |
| `spin` | Giro |
| `pixel-dissolve` | Disolución pixelada |

## Ubicación de las transiciones

| Origen | Carpeta | Ref. |
|--------|---------|------|
| Integradas | `resources/transitions/` (solo lectura) | `builtin:<id>` |
| Del usuario | Windows: `%APPDATA%/Viditor/transitions/` · Linux: `~/.config/Viditor/transitions/` | `user:<id>` |
| Del proyecto | `<proyecto>/transitions/` | `project:<id>` |

Prioridad ante id repetido: proyecto > usuario > integrada. El panel Transiciones muestra un distintivo de origen. Acciones: **Nueva transición** (desde plantilla), **Duplicar para editar** (una integrada se copia a la carpeta del usuario), **Abrir carpeta**, **Copiar al proyecto** (para que el proyecto sea portable).

## Editor de transiciones (espacio de trabajo "Transiciones")

- Monaco con resaltado JS, tipos de `viditor-transitions.d.ts`, plantillas y fragmentos (`render`, `init`, `splitGrid`…). El hover muestra el JSDoc de cada método y **F1 sobre un símbolo** abre su página en la documentación local (ver 09).
- **Vista previa** a la derecha: usa la transición seleccionada en la línea de tiempo o dos clips de muestra incluidos (barras de color A/B con números grandes, útiles para ver el movimiento). Controles: reproducir en bucle, barra de `progress` arrastrable, velocidad, superposición de rejilla y de contornos de partes.
- **Parámetros** editables en vivo.
- **Consola**: salida de `log()`, errores con número de línea (clic → salta a la línea), tiempo medio de `render` en ms.
- Guardar (Ctrl+S) = recarga en caliente.

## Sandbox y seguridad

- Cada archivo se ejecuta en un **Web Worker dedicado** (uno por definición de transición; sus instancias comparten worker pero no estado: cada instancia se evalúa en su propio ámbito con `new Function`).
- Antes de evaluar el código se eliminan del ámbito global: `fetch`, `XMLHttpRequest`, `WebSocket`, `importScripts`, `indexedDB`, `caches`, `postMessage` propio, `Worker`, `Math.random`, `Date`, `performance.now` (se expone `ctx.time` en su lugar).
- CSP del worker: `default-src 'none'`.
- Límites: `init` 500 ms, `render` 50 ms en vista previa (si se excede 3 veces seguidas → la transición se desactiva hasta recargar y se muestra corte seco + aviso), 2 s en exportación (excederlo aborta la exportación con mensaje claro).
- Máximo de partes por capa: 4 096; figuras por frame: 10 000.

## Implementación (para Claude Code)

La API **no dibuja**: los métodos solo **registran** el estado. Al terminar `render`, el runtime serializa una **display list** y la envía al compositor:

```ts
type DisplayList = {
  frame: number;
  items: DisplayItem[];          // ya ordenados por z
};

type DisplayItem =
  | { kind: "layer"; source: "leave" | "enter"; rect?: Rect;       // rect = parte de la capa
      matrix: Mat3; opacity: number; filters: Filter[]; mask?: MaskRef; crop?: Rect }
  | { kind: "shape"; geometry: Geometry; style: ShapeStyle; matrix: Mat3; opacity: number }
  | { kind: "mask"; id: string; geometry: Geometry; matrix: Mat3; invert: boolean; feather: number };
```

- El compositor WebGL2 resuelve `layer` muestreando la textura de la capa correspondiente (el `rect` define las UV de la parte), aplica `matrix`, filtros (shaders encadenados) y máscara (stencil o textura alfa).
- Geometrías: teselado en CPU (p. ej. con `earcut`) y cacheado por hash de geometría.
- La misma display list se usa en vista previa y exportación ⇒ resultados idénticos.
- Versionado: `meta.apiVersion` permite cambiar la API sin romper transiciones antiguas (el runtime mantiene adaptadores por versión).

## Evolución prevista de la API (no v1)

`layer.shader(glslFragment, uniforms)` para efectos por píxel, `layer.displace(map)`, partículas (`draw.particles`), `splitShapes(shapes[])` (dividir la capa con figuras arbitrarias), muestreo de color (`layer.sampleColor(x,y)`), audio programable (`ctx.audio.leaveGain/enterGain`), y transiciones `.ts`.
