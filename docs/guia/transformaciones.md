# Transformaciones

Selecciona un clip de video o imagen y usa el **Inspector › Movimiento** o manipúlalo directamente en el monitor. Ambos editan los mismos valores.

## Orden de aplicación

**recorte → ajuste → escala → volteo → rotación (sobre el anclaje) → traslación → opacidad**

## Inspector

| Propiedad | Notas |
|-----------|-------|
| Ajuste | Ajustar, Rellenar, Estirar o Tamaño original |
| Posición X / Y | Píxeles desde el centro del cuadro |
| Ancho / Alto | Píxeles resultantes. El candado mantiene la proporción |
| Escala | Porcentaje uniforme (visible con la proporción bloqueada) |
| Rotación | Grados, sin límite |
| Voltear | Horizontal y vertical |
| Anclaje | Selector de 9 puntos o porcentajes. Mover el anclaje no mueve la imagen |
| Recorte | Píxeles del archivo fuente |
| Opacidad | 0–100 % |

Los números azules son *scrubby*: **arrastra** horizontalmente sobre ellos para cambiarlos (`Mayús` = fino, `Ctrl` = rápido) o haz **clic** para escribir un valor. El botón **↺** de cada grupo lo restablece. Un arrastre completo cuenta como un único paso de *Deshacer*.

## En el monitor

Con un clip seleccionado aparece una caja azul con 8 asas:

- Arrastra el **interior** para mover (aparecen guías rosas al centrar).
- Arrastra una **esquina** para escalar; con la proporción bloqueada es uniforme y `Mayús` lo libera. Los **lados** escalan un solo eje.
- Arrastra el **círculo superior** para rotar (`Mayús`: pasos de 15°).
- Arrastra el **punto de anclaje** (la cruz) para cambiar el pivote.
