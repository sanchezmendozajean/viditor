# Anatomía de un archivo

Un archivo `.js` es **una** transición. Todo se escribe con JavaScript estándar (ES2022).

```js
// 1. Metadatos (obligatorio)
const meta = {
  apiVersion: 1,
  id: "slide-horizontal",          // igual que el nombre del archivo, solo a-z, 0-9 y guiones
  name: "Deslizar horizontal",
  category: "Deslizar",            // agrupa la transición en el panel
  author: "Pols",
  description: "El clip entrante empuja al saliente.",
  defaultDuration: 1.0,            // segundos
  audio: "crossfade",              // crossfade | cut | none
  params: {                        // aparecen en el Inspector
    direction: { type: "enum", label: "Dirección", options: ["derecha", "izquierda"], default: "derecha" },
    easing: { type: "easing", label: "Suavizado", default: "inOutCubic" }
  }
};

// 2. Estado propio (opcional): variables de nivel superior
let parts;

// 3. init: una vez por instancia (opcional)
function init(leaveClip, enterClip, ctx) { }

// 4. render: en cada frame (obligatorio)
function render(leaveClip, enterClip, progress, ctx) { }
```

## `meta`

| Campo | Notas |
|-------|-------|
| `apiVersion` | Siempre `1` |
| `id` | Debe coincidir con el nombre del archivo (`slide-horizontal.js`) |
| `name` | Nombre visible |
| `category` | Fundidos, Deslizar, Barridos, Formas, Geométricas o la tuya |
| `defaultDuration` | Duración al aplicarla (segundos) |
| `audio` | Qué pasa con el sonido: fundido cruzado de potencia constante, corte en el punto medio o nada |
| `params` | Controles editables (ver abajo) |

### Tipos de parámetro

| Tipo | Control | Ejemplo |
|------|---------|---------|
| `number` | Número arrastrable (`min`, `max`, `step`) | `{ type: "number", default: 0.5, min: 0, max: 1 }` |
| `int` | Entero | `{ type: "int", default: 4, min: 1, max: 32 }` |
| `boolean` | Casilla | `{ type: "boolean", default: true }` |
| `color` | Selector de color | `{ type: "color", default: "#000000" }` |
| `enum` | Lista desplegable | `{ type: "enum", options: ["a", "b"], default: "a" }` |
| `easing` | Lista de curvas de suavizado | `{ type: "easing", default: "inOutCubic" }` |
| `angle` | Grados | `{ type: "angle", default: 45 }` |
| `point` | Punto `[x, y]` normalizado (0–1) | `{ type: "point", default: [0.5, 0.5] }` |

Los valores llegan a `render` e `init` en `ctx.params`, ya con su valor por defecto y limitados a su rango.

## `init` y `render`

- **`init(leaveClip, enterClip, ctx)`** se llama una vez por transición colocada en la línea de tiempo, y de nuevo si cambias su duración o parámetros. Es el sitio para crear las partes con `splitGrid()`.
- **`render(leaveClip, enterClip, progress, ctx)`** se llama en cada frame. Debe ser una función pura de `progress`, `ctx` y lo creado en `init`.

Cada instancia tiene su **propio estado**: dos transiciones iguales en la línea de tiempo no comparten las variables de nivel superior.
