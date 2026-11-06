# Crear y abrir proyectos

![Pantalla de inicio de Viditor con los proyectos recientes](/capturas/inicio.png)


## Nuevo proyecto

Elige **Archivo › Nuevo proyecto…** (`Ctrl+N`) o el botón de la pantalla de inicio. Define nombre, ubicación, resolución, fotogramas por segundo, frecuencia de audio, color de fondo y qué hacer al importar medios.

Al crear el proyecto se genera esta estructura:

```
<Ubicación>/<Nombre>/
├─ <Nombre>.vdproj        ← archivo de definición (JSON)
├─ media/                 ← medios copiados o movidos al proyecto
├─ transitions/           ← transiciones propias del proyecto
├─ renders/               ← destino por defecto de las exportaciones
└─ .viditor/
   ├─ cache/              ← miniaturas, waveforms, proxies (se puede borrar)
   └─ backups/            ← autoguardados rotativos (últimos 10)
```

Si la carpeta ya existe y no está vacía, Viditor te pedirá otro nombre o ubicación.

## Abrir y guardar

- **Abrir**: `Ctrl+O`, o doble clic en un proyecto reciente.
- **Guardar**: `Ctrl+S`. El guardado es atómico: nunca queda un archivo a medias.
- **Autoguardado**: cada 2 minutos, si hay cambios, en `.viditor/backups/`.

## El archivo `.vdproj`

Es JSON legible con un campo `formatVersion` para poder migrar proyectos antiguos. Las rutas de medios son **relativas** al `.vdproj` cuando están dentro de la carpeta del proyecto y **absolutas** cuando están fuera; siempre usan `/` como separador.
