# Importar medios

Arrastra archivos o carpetas al panel **Proyecto**, o usa **Archivo › Importar…** (`Ctrl+I`).

## Dejar, copiar o mover

Cuando un archivo está fuera de la carpeta del proyecto, Viditor pregunta qué hacer:

| Opción | Efecto |
|--------|--------|
| **Dejar en su ubicación actual** | El proyecto hace referencia al archivo original. |
| **Copiar a la carpeta del proyecto** | Se copia a `media/`. El original no se toca. |
| **Mover a la carpeta del proyecto** | El archivo se traslada a `media/`. |

Marca **Recordar mi elección para este proyecto** para no volver a preguntar; puedes cambiarlo en el Inspector, en los ajustes del proyecto.

Si el nombre ya existe en `media/`, se agrega un sufijo: `clip (2).mp4`, `clip (3).mp4`…

## Carpetas

Las carpetas se importan recursivamente y crean una **bandeja** con su nombre en el panel Proyecto.

## Tras importar

Viditor analiza cada archivo con FFprobe y genera su miniatura en segundo plano; el progreso aparece en la barra de estado.
