# 07 · Diseño de interfaz

> **Brief para el Artifact de diseño.** Crear una maqueta interactiva (HTML) de Viditor con datos de ejemplo, fiel a este documento. No necesita reproducir video real: los monitores pueden mostrar degradados/imagenes de muestra y la línea de tiempo debe ser interactiva a nivel visual (seleccionar clips, mover el cabezal, arrastrar pistas, abrir diálogos, cambiar de espacio de trabajo).

## Sensación general

Inspirado en **Adobe Premiere Pro / After Effects** (sin copiar marcas, logos ni iconos de Adobe):

- Tema **oscuro** neutro, denso pero ordenado, paneles acoplados con pestañas, bordes de 1 px, esquinas casi rectas (2–4 px).
- Tipografía pequeña y nítida (11–12 px en paneles, 13 px en diálogos). Fuente: **Source Sans 3** con fallback `Segoe UI`, `Ubuntu`, sans-serif. Timecodes en **JetBrains Mono**. Ambas (licencia OFL) **empaquetadas en la app** como `.woff2`; nunca cargadas desde internet. (La maqueta del Artifact usa Google Fonts solo por comodidad de la vista previa.)
- Iconografía lineal monocroma de 16 px (**Lucide**, SVG empaquetados), gris claro; el acento solo para estados activos.
- Controles "scrubby": los valores numéricos azules se cambian arrastrando horizontalmente sobre ellos (cursor ↔), clic para editar.
- Ventana sin marco nativo: barra de título propia con menú, nombre del proyecto y botones de ventana (estilo Windows a la derecha; en Linux igual).

## Paleta (tokens)

| Token | Valor | Uso |
|-------|-------|-----|
| `--bg-app` | `#1B1B1B` | Fondo de la aplicación / huecos entre paneles |
| `--bg-panel` | `#232323` | Fondo de paneles |
| `--bg-panel-header` | `#2A2A2A` | Barra de pestañas de panel |
| `--bg-input` | `#1A1A1A` | Campos de texto, desplegables |
| `--bg-hover` | `#333333` | Hover |
| `--border` | `#121212` | Separadores entre paneles |
| `--border-subtle` | `#3A3A3A` | Bordes de controles |
| `--text` | `#D6D6D6` | Texto principal |
| `--text-dim` | `#8C8C8C` | Etiquetas secundarias |
| `--accent` | `#2D8CEB` | Selección, cabezal, valores scrubby, pestaña activa (subrayado) |
| `--accent-hover` | `#4AA3F5` | |
| `--clip-video` | `#7B76D6` | Clips de video (violeta-azulado) |
| `--clip-audio` | `#3FA37A` | Clips de audio (verde) |
| `--clip-image` | `#4AA9C9` | Imágenes fijas |
| `--transition` | `#C9B458` | Bloques de transición (con rayas diagonales) |
| `--marker` | `#E8B33A` | Marcadores |
| `--danger` | `#E5484D` | Errores, recorte de audio |
| `--warn` | `#F5A524` | Advertencias |
| `--ok` | `#46A758` | Medidores |

Clip seleccionado: borde blanco 1 px + brillo +10 %. Clip deshabilitado: 40 % opacidad y rayado.

## Estructura de la ventana

```
┌ Barra de título: [≡ logo] Archivo Editar Clip Secuencia Transiciones Ver Ventana Ayuda │ Vacaciones 2026 — Viditor │ _ □ ✕ ┐
├ Espacios de trabajo:            Edición · Transiciones · Audio · Exportar                    [🔍 buscar comando]┤
├───────────────────────┬──────────────────────────────────────────────┬────────────────────────┤
│ Proyecto | Transiciones│              Monitor del programa            │ Inspector              │
│ ─ bandejas y medios   │   [ cuadro 16:9 con caja de transformación ] │  Clip: playa.mp4       │
│   (cuadrícula/lista)  │   00:00:12:04  ◀◀ ◀ ▶ ▶▶  ⟲  ½ ▾   00:02:31:10│  ▸ Movimiento          │
│                       │   [ Master 🔊 ━━━━ ]                         │  ▸ Opacidad            │
│                       │                                              │  ▸ Audio               │
├───────────────────────┴──────────────────────────────────────────────┼────────────────────────┤
│ Línea de tiempo: Secuencia 1                                          │ Medidores │
│ [herramientas V C H] [imán] [vinculado]     regla 00:00 ─ 00:05 ─ …   │  L  R     │
│ V2 ⋮⋮ 👁 🔒 │      [clip]                                           │  ▮  ▮     │
│ V1 ⋮⋮ 👁 🔒 │ [clip A ][▨▨][clip B        ][clip C]                 │  ▮  ▮     │
│ ───────────────────────────────────────────────────────────────────── │  ▮  ▮     │
│ A1 ⋮⋮ M S 🔒│ [~~~~~ waveform ~~~~~]                                │ -6 -12 …  │
│ A2 ⋮⋮ M S 🔒│                                                       │           │
├ Barra de estado: 1920×1080 · 30 fps · 48 kHz │ Tareas: Generando proxy playa.mp4 ▓▓▓░ 62 % │ Autoguardado 12:41 ┤
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

- Todos los paneles se redimensionan arrastrando los separadores. Los paneles con pestañas permiten reordenar pestañas; se puede maximizar un panel con `` ` `` (acento grave), como en Premiere.
- **Espacios de trabajo** (pestañas superiores) reorganizan los paneles:
  - **Edición** — el layout de arriba.
  - **Transiciones** — izquierda: lista de transiciones; centro: editor de código Monaco; derecha arriba: vista previa de la transición con barra de `progress`; derecha abajo: parámetros; abajo: consola. Línea de tiempo contraída.
  - **Audio** — Mezclador de audio (canales por pista + Master con faders verticales, medidores, M/S) y línea de tiempo grande.
  - **Exportar** — formulario de exportación a la izquierda, vista previa a la derecha, cola/progreso abajo.

## Paneles en detalle

### Proyecto (medios)
- Barra: buscar, vista lista/cuadrícula, tamaño de miniaturas, nueva bandeja, importar.
- Cuadrícula de miniaturas con duración abajo-derecha e icono de tipo; hover scrub (mover el mouse sobre la miniatura recorre el video).
- Distintivo de **almacenamiento**: 📁 dentro del proyecto / 🔗 externo / ⚠ faltante.
- Lista: Nombre, Duración, Resolución, fps, Códec, Ubicación.

### Transiciones
- Agrupadas por categoría (Fundidos, Deslizar, Barridos, Formas, Geométricas, Personalizadas).
- Cada tarjeta: miniatura animada (al hover reproduce la transición con clips A/B de muestra), nombre, distintivo de origen (Integrada / Usuario / Proyecto), ⚠ si tiene error.
- Botones: **+ Nueva**, Abrir carpeta, Recargar. Menú: Editar código, Duplicar, Establecer como predeterminada, Copiar al proyecto.

### Monitor del programa
- Cuadro con el aspecto del proyecto sobre fondo `#0E0E0E`; con clip seleccionado, caja de transformación azul con 8 asas, asa de rotación y punto de anclaje.
- Timecode actual (azul, editable) a la izquierda y duración total a la derecha.
- Controles: marcar entrada/salida, ir a entrada, frame atrás, reproducir, frame adelante, ir a salida, bucle, calidad (Completa/½/¼), zoom del monitor (Ajustar/25–200 %), guías/zona segura, exportar frame.

### Inspector
Contenido contextual:
- **Clip seleccionado**: grupos plegables con "fx" a la izquierda y ↺ restablecer: *Movimiento* (Ajuste, Posición, Ancho/Alto con candado, Escala, Rotación, Voltear H/V, Anclaje con selector de 9 puntos, Recorte), *Opacidad*, *Audio* (Volumen % y dB, Silenciar, Fundido entrada/salida).
- **Transición seleccionada**: nombre + origen, Duración, Audio (crossfade/corte/ninguno), parámetros definidos en `meta.params` (controles generados por tipo), Semilla, botón **Editar código**.
- **Pista seleccionada**: nombre, color, volumen.
- **Nada**: ajustes del proyecto (resolución, fps, fondo, modo de importación).

### Línea de tiempo
- Ver 04 para comportamiento. Visual: regla con timecode, cabezal azul con línea vertical a través de todas las pistas, marcadores como banderines amarillos, zona de entrada/salida sombreada en la regla.
- Cabeceras de pista (≈170 px) con asa ⋮⋮, nombre, iconos de estado y mini-slider de volumen en audio; durante el arrastre de reordenamiento mostrar "fantasma" y línea de inserción azul.
- Barra de desplazamiento horizontal con asas de zoom en los extremos (estilo Premiere).
- Clips con miniaturas, nombre, forma de onda, goma de volumen (línea amarilla fina), asas de fundido.
- Transiciones como bloque con rayas diagonales doradas y nombre centrado.

### Mezclador de audio
Columnas por pista + Master: nombre, perilla de paneo (deshabilitada en v1, reservada), fader vertical con escala dB, medidor estéreo, botones M/S, valor numérico.

### Consola (espacio Transiciones)
Fondo `#161616`, monoespaciada, niveles con color (log gris, warn ámbar, error rojo), contador de ms por frame.

## Diálogos y pantallas a incluir en la maqueta

1. **Pantalla de inicio**: logo Viditor, botones *Nuevo proyecto* / *Abrir proyecto*, lista de recientes con miniatura, ruta y fecha.
2. **Nuevo proyecto** (campos de 03).
3. **Importar medios** — las tres opciones (dejar / copiar / mover) + "recordar mi elección" (ver 03).
4. **Medios faltantes / revincular**.
5. **Exportar** (ver 06) y **progreso de exportación**.
6. Menú contextual de clip (Dividir, Eliminar, Eliminar y cerrar hueco, Separar audio, Deshabilitar, Restablecer transformación, Mostrar en el explorador, Propiedades).

## Datos de ejemplo para la maqueta

Proyecto "Vacaciones 2026", 1920×1080, 30 fps. Medios: `playa.mp4` (0:42), `montaña.mov` (1:15), `cena.mp4` (0:28), `drone.mp4` (2:03, externo 🔗), `musica-fondo.mp3` (3:10), `logo.png`. Línea de tiempo: V1 playa → (Deslizar horizontal 1 s) → montaña → (Cuadrícula que se encoge 1 s) → cena; V2 logo.png encima de los primeros 5 s escalado al 20 % en la esquina inferior derecha; A1 musica-fondo con volumen 40 % y fundido de salida.

## Ayuda

- Botón **?** en la cabecera de cada panel (abre la sección correspondiente de la guía).
- Menú **Ayuda**: Documentación (F1), Referencia de la API de transiciones, Atajos de teclado, Acerca de Viditor (versión y licencias).
- Ventana de documentación con el mismo tema oscuro: índice lateral, búsqueda, contenido y "En esta página" a la derecha (ver 09).

## Accesibilidad y detalles

- Contraste mínimo AA en texto principal; foco visible (contorno azul 1 px).
- Tooltips con nombre + atajo tras 600 ms.
- Todas las acciones disponibles en menús y en la paleta de comandos (Ctrl+Shift+P).
- Escalado de interfaz 90–150 % (Preferencias).
