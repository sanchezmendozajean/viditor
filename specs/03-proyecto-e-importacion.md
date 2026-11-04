# 03 · Proyecto e importación

## Crear un proyecto

Diálogo **Nuevo proyecto**:

| Campo | Valor por defecto |
|-------|-------------------|
| Nombre | `Proyecto sin título` |
| Ubicación (carpeta padre) | Última usada / `Documentos/Viditor` |
| Resolución | 1920 × 1080 (presets: 3840×2160, 2560×1440, 1280×720, 1080×1920 vertical, 1080×1080 cuadrado, personalizada) |
| Fotogramas por segundo | 30 (23.976, 24, 25, 29.97, 30, 50, 59.94, 60) |
| Frecuencia de audio | 48 000 Hz |
| Color de fondo | Negro |
| Al importar medios | Preguntar siempre (o: dejar / copiar / mover) |

Al confirmar se crea:

```
<Ubicación>/<Nombre>/
├─ <Nombre>.vdproj        ← archivo de definición (JSON)
├─ media/                 ← medios copiados o movidos al proyecto
├─ transitions/           ← transiciones propias del proyecto (opcional)
├─ renders/               ← destino por defecto de las exportaciones
└─ .viditor/
   ├─ cache/              ← miniaturas, waveforms, proxies (se puede borrar)
   └─ backups/            ← autoguardados rotativos (últimos 10)
```

- Si la carpeta ya existe y no está vacía → error amable, sugerir otro nombre.
- El nombre se sanea para el sistema de archivos (caracteres prohibidos en Windows: `<>:"/\|?*`).
- Abrir proyecto = abrir el `.vdproj` (doble clic desde el explorador gracias a la asociación de archivos del instalador, o menú **Archivo › Abrir**). Pantalla de inicio con **proyectos recientes**.

## Archivo `.vdproj`

JSON legible, con `formatVersion` para migraciones. Rutas de medios **relativas al .vdproj** cuando están dentro de la carpeta del proyecto y **absolutas** cuando están fuera. Separador `/` siempre (se normaliza al leer en Windows).

```jsonc
{
  "formatVersion": 1,
  "app": "viditor",
  "name": "Vacaciones 2026",
  "settings": {
    "width": 1920, "height": 1080,
    "fps": { "num": 30, "den": 1 },
    "sampleRate": 48000,
    "background": "#000000",
    "importMode": "ask",              // ask | reference | copy | move
    "masterVolume": 1.0
  },
  "media": [
    {
      "id": "m_01HF...",               // ULID
      "path": "media/playa.mp4",       // relativa o absoluta
      "storage": "project",            // project | external
      "kind": "video",                 // video | audio | image
      "probe": {                       // caché de ffprobe
        "duration": 42.5, "width": 1920, "height": 1080,
        "fps": { "num": 30000, "den": 1001 }, "hasAudio": true,
        "videoCodec": "h264", "audioCodec": "aac", "rotation": 0
      },
      "proxy": ".viditor/cache/proxies/m_01HF.mp4"   // opcional
    }
  ],
  "tracks": [
    { "id": "t_v2", "kind": "video", "name": "V2", "color": "#8F7FD9",
      "hidden": false, "locked": false, "height": 64 },
    { "id": "t_v1", "kind": "video", "name": "V1", "hidden": false, "locked": false, "height": 64,
      "volume": 1.0, "muted": false, "solo": false },
    { "id": "t_a1", "kind": "audio", "name": "A1", "locked": false, "height": 48,
      "volume": 1.0, "muted": false, "solo": false }
  ],
  "clips": [
    {
      "id": "c_01HF...", "mediaId": "m_01HF...", "trackId": "t_v1",
      "start": 0,            // posición en la línea de tiempo (s)
      "in": 3.2,             // punto de entrada en el medio fuente (s)
      "out": 12.0,           // punto de salida en el medio fuente (s)
      "speed": 1.0,          // reservado (v1 siempre 1.0)
      "name": "playa.mp4",
      "color": null,
      "enabled": true,
      "transform": {
        "fit": "fit",        // fit | fill | stretch | none
        "x": 0, "y": 0,      // desplazamiento desde el centro, px
        "scaleX": 1, "scaleY": 1, "lockAspect": true,
        "rotation": 0,       // grados
        "flipH": false, "flipV": false,
        "anchorX": 0.5, "anchorY": 0.5,
        "opacity": 1,
        "crop": { "left": 0, "top": 0, "right": 0, "bottom": 0 }   // px del fuente
      },
      "audio": { "volume": 1.0, "muted": false, "fadeIn": 0, "fadeOut": 0 },
      "keyframes": {}        // reservado para fase 6
    }
  ],
  "transitions": [
    {
      "id": "x_01HF...", "trackId": "t_v1",
      "leaveClipId": "c_A", "enterClipId": "c_B",
      "transitionRef": "builtin:slide-horizontal",   // builtin: | user: | project:
      "duration": 1.0,
      "params": { "direction": "left" },
      "audio": "crossfade"   // crossfade | cut | none — sobreescribe meta.audio
    }
  ],
  "markers": [ { "time": 12.4, "label": "Inicio coro", "color": "#E8B33A" } ],
  "view": { "zoom": 80, "scroll": 0, "playhead": 0, "workspace": "edit" }
}
```

Reglas:
- Orden de `tracks`: **de arriba hacia abajo** tal como se ven en la línea de tiempo. Las pistas de video se componen de abajo (fondo) hacia arriba (frente).
- Guardado **atómico** (escribir `.tmp` y renombrar). Autoguardado cada 2 min en `.viditor/backups/` si hay cambios.
- Al abrir, si un medio no existe → panel **Medios faltantes** con opción de **Revincular** (buscar archivo; si se revincula uno, buscar el resto en la misma carpeta).
- Las referencias de transición: `builtin:<id>` (incluidas con la app), `user:<id>` (carpeta del usuario), `project:<id>` (carpeta `transitions/` del proyecto). Si falta una transición → se muestra en rojo y se renderiza como corte seco con aviso.

## Importar medios (arrastrar y soltar)

Fuentes de importación: arrastrar archivos/carpetas desde el explorador al **panel Proyecto**, al **monitor** o directamente a la **línea de tiempo**; o **Archivo › Importar…** (Ctrl+I).

Si `settings.importMode = "ask"`, aparece el diálogo **Importar medios**:

```
┌ Importar 3 archivos ─────────────────────────────────────────┐
│ ¿Qué hacer con los archivos?                                  │
│                                                               │
│  ◉ Dejar en su ubicación actual                               │
│     El proyecto hará referencia al archivo original.          │
│  ○ Copiar a la carpeta del proyecto                           │
│     Se copia a  media/ . El original no se toca.              │
│  ○ Mover a la carpeta del proyecto                            │
│     El archivo se traslada a  media/ .                        │
│                                                               │
│  ☐ Recordar mi elección para este proyecto                    │
│                                         [Cancelar] [Importar] │
└───────────────────────────────────────────────────────────────┘
```

- Si un archivo ya está dentro de la carpeta del proyecto, no se pregunta: se referencia.
- Copiar/mover: conservar el nombre; en conflicto, agregar sufijo ` (2)`, ` (3)`… Mover entre unidades distintas = copiar + verificar tamaño + borrar original.
- Copias grandes muestran progreso en la **barra de tareas en segundo plano** (parte inferior) y el clip ya es utilizable apuntando al origen hasta que termine; luego se reapunta.
- Carpetas arrastradas: se importan recursivamente los archivos soportados y se crea una **bandeja (bin)** con el nombre de la carpeta en el panel Proyecto.
- Tras importar: ffprobe → miniatura → waveform → (si hace falta) proxy, en una cola de trabajos con concurrencia 2.
- Soltar en la línea de tiempo: el clip se coloca donde se soltó (con imán); soltar varios los coloca en secuencia en el orden de selección.
- **Mover** se puede deshacer (Ctrl+Z devuelve el archivo a su ruta original si sigue disponible).
