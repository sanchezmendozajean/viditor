# Rediseño de modales

Maqueta aprobada: [`modales.html`](modales.html) (abrir en el navegador). Es la referencia visual; ante cualquier duda de medidas o colores, manda la maqueta.

> La maqueta carga Source Sans 3 y JetBrains Mono desde Google Fonts solo para la vista previa. En la app se siguen usando las fuentes empaquetadas (regla de autocontenido).

## Objetivo

Todos los diálogos de Viditor pasan a tener la misma estructura:

1. **Cabecera** en banda (`--bg-panel-header`) con línea superior de 2 px del color del tono.
2. **Ícono** de 28 px con fondo del tono al 16 % y borde al 35 %.
3. **Título** (13 px, semibold) y **subtítulo** opcional (11 px, `--text-dim`).
4. **Botón cerrar (X)** dentro de la cabecera, a la derecha, 26 × 26 px, con foco visible.
5. **Cuerpo** con padding de 16 px.
6. **Pie** en banda (borde superior `--border`, fondo `#1f1f1f`) con los botones a la derecha y una pista de teclado opcional a la izquierda.

## Tareas para Claude Code

### 1. `src/renderer/app/components/Modal.vue`

Reemplazar por la versión de la pestaña "components/Modal.vue" de la maqueta. API nueva:

| Prop | Tipo | Defecto | Uso |
|------|------|---------|-----|
| `title` | `string` | — | Título |
| `subtitle` | `string?` | — | Línea secundaria bajo el título |
| `icon` | `string?` | — | Nombre de ícono de `Icon.vue` |
| `tone` | `'accent' \| 'danger' \| 'warn' \| 'ok'` | `'accent'` | Color de la línea superior y del ícono |
| `width` | `number` | `440` | Ancho en px (máx. 90vw) |
| `closable` | `boolean` | `true` | Muestra la X |
| `hint` | `string?` | — | Texto del pie a la izquierda (`Esc cancelar`, `Enter crear`) |

Slots: por defecto (cuerpo) y `#footer` (botones). El pie solo se pinta si hay slot `#footer`.

Cuidado:

- Hoy `closable` vale `false` por defecto y el clic en el fondo cierra solo cuando no es `closable`. Con el cambio, la X aparece en todos los diálogos y **el clic en el fondo cierra siempre**. Revisar que `MediaPreviewDialog` siga comportándose igual.
- Mantener `data-testid="modal-close"`, `role="dialog"`, `aria-modal` y el cierre con `Escape`. Revisar los tests e2e que dependan de la X o del clic en el fondo.
- La animación de entrada (`pop`, 140 ms) se desactiva con `prefers-reduced-motion`.

### 2. `src/renderer/assets/base.css`

Añadir el botón destructivo junto a `.btn.primary`:

```css
button.btn.danger { background: var(--danger); border-color: var(--danger); color: #fff; }
button.btn.danger:hover { background: #f2676b; }
```

Si conviene, añadir `--danger-hover: #f2676b` en `tokens.css` y usarlo aquí.

### 3. Íconos

`Icon.vue` ya tiene `trash`, `folder-plus`, `film`, `alert`, `settings`, `upload` y `paste`. Añadir `check` (para el tono `ok`) solo cuando se use.

### 4. Migrar cada diálogo

Mover los botones de cada diálogo de su `<footer>` interno al slot `#footer` y eliminar los estilos de footer locales. Asignar:

| Diálogo | `icon` | `tone` | `subtitle` | `hint` | Botón principal |
|---------|--------|--------|------------|--------|-----------------|
| `DeleteMediaDialog` | `trash` | `danger` | Esta acción no se puede deshacer | `Esc cancelar` | **Eliminar del disco** (`.btn.danger`) |
| `NewProjectDialog` | `folder-plus` | `accent` | Configura la secuencia inicial | `Enter crear` | **Crear proyecto** |
| `CloseConfirmDialog` | `alert` | `warn` | — | `Esc cancelar` | Igual que ahora |
| `ImportDialog` | `upload` | `accent` | — | — | Igual que ahora |
| `PasteDialog` | `paste` | `accent` | — | — | Igual que ahora |
| `PreferencesDialog` | `settings` | `accent` | — | — | Igual que ahora |
| `MediaPreviewDialog` | `film` | `accent` | — | — | Sin pie |

`CommandPalette` no usa `Modal` y queda fuera.

#### `DeleteMediaDialog`

Seguir la pestaña "dialogs/DeleteMediaDialog.vue" de la maqueta:

- El nombre del recurso va en una caja de archivo (`.file`, fuente mono, ícono `film`).
- La advertencia de clips va en una nota tintada de rojo (`.note`, ícono `alert`).
- Conservar `data-testid="delete-media-dialog"` y `data-testid="delete-media-confirm"`.

#### `NewProjectDialog`

- Ancho 480.
- Agrupar campos bajo dos rótulos de sección: **General** (Nombre, Ubicación + Examinar…) y **Secuencia** (Resolución, Fotogramas por segundo, Frecuencia de audio en una fila 2fr/1fr/1fr; Color de fondo y Al importar medios en una fila 1fr/1fr).
- Rótulo de sección: 10.5 px, mayúsculas, `letter-spacing: .08em`, `--text-dim`, con línea `--border-subtle` que llena el resto del ancho.
- Inputs de 28 px de alto, foco con borde `--accent` y halo al 25 %.
- `Enter` crea el proyecto (si no lo hace ya).

## Criterios de aceptación

- [ ] Todos los diálogos que usan `Modal` muestran cabecera con ícono, línea de tono y X.
- [ ] Ningún diálogo tiene botones fuera de la banda del pie (salvo `MediaPreviewDialog`, que no tiene pie).
- [ ] Eliminar recurso usa tono rojo y botón "Eliminar del disco".
- [ ] `Escape`, la X y el clic en el fondo cierran el diálogo (resolviendo como "cancelar" donde aplique).
- [ ] La X y los botones tienen foco visible con teclado.
- [ ] Los tests unitarios y e2e pasan, incluido el test "sin red".
- [ ] Revisado en Windows y Linux.
