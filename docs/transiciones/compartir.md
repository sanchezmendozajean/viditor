# Compartir transiciones

Una transición es un único archivo `.js`: se comparte copiándolo.

## Dónde viven

| Origen | Carpeta | Referencia |
|--------|---------|------------|
| Integradas | Incluidas con la aplicación (solo lectura) | `builtin:<id>` |
| Usuario | Windows: `%APPDATA%\Viditor\transitions\` · Linux: `~/.config/Viditor/transitions/` | `user:<id>` |
| Proyecto | `<proyecto>/transitions/` | `project:<id>` |

El panel Transiciones muestra un distintivo del origen de cada una. Si el mismo `id` existe en varias carpetas, la prioridad es **proyecto > usuario > integrada**; cada referencia (`user:wipe`, `builtin:wipe`…) sigue siendo distinta y se puede aplicar por separado.

## Acciones

- **Nueva**: crea un archivo en tu carpeta a partir de una plantilla.
- **Duplicar para editar**: copia una transición (por ejemplo una integrada) a tu carpeta con un `id` nuevo.
- **Copiar al proyecto**: copia el archivo a `<proyecto>/transitions/` para que el proyecto sea **portable** (se lleva sus transiciones consigo).
- **Abrir carpeta** y **Recargar**.

## Recarga en caliente

Viditor vigila las tres carpetas: si guardas el archivo desde cualquier editor, la transición se recarga sola y la vista previa se actualiza. Las transiciones ya colocadas en la línea de tiempo se vuelven a crear con el código nuevo.

## Transiciones que faltan

Si un proyecto usa una transición que ya no existe (se borró el archivo o abriste el proyecto en otro equipo), el bloque se muestra en **rojo** y se renderiza como corte seco, con un aviso. Copiar la transición al proyecto evita este problema.

## `apiVersion`

`meta.apiVersion` permite que la API evolucione sin romper tus transiciones antiguas: la aplicación mantiene adaptadores para cada versión.
