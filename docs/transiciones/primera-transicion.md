# Tu primera transición

En Viditor las transiciones son archivos de JavaScript que **tú** escribes. En unos minutos tendrás una propia funcionando en la línea de tiempo.

![Espacio Transiciones: lista, editor de código, vista previa y consola](/capturas/transiciones.png)

## 1. Crear la transición

1. Abre el espacio de trabajo **Transiciones** (pestaña superior).
2. En el panel de la izquierda pulsa **+ Nueva**. Se crea `mi-transicion.js` en tu carpeta de transiciones y se abre en el editor.

La plantilla ya funciona: el clip saliente se desplaza a la izquierda y el entrante llega desde la derecha.

## 2. Editarla

Cambia la función `render`:

```js
function render(leaveClip, enterClip, progress, ctx) {
  const p = ease[ctx.params.easing](progress);

  leaveClip.alpha(1 - p);          // el saliente se desvanece
  enterClip.scale(0.5 + 0.5 * p);  // el entrante crece desde la mitad de su tamaño
}
```

`progress` va de **0** (primer frame del solape) a **1** (último frame). Cada vez que se dibuja un frame, Viditor llama a `render` con el `progress` de ese frame.

## 3. Ver el resultado

Pulsa `Ctrl+S`. La transición se **recarga en caliente** y la vista previa de la derecha la muestra con dos clips de muestra (A y B). Arrastra la barra de `progress` para recorrerla a mano.

- Los errores aparecen en la **consola** con su número de línea: un clic en la línea salta al editor.
- `log("progress", progress)` escribe en la consola.
- En el panel **Parámetros** puedes probar los valores que definiste en `meta.params`.

## 4. Aplicarla en la línea de tiempo

Vuelve al espacio **Edición**, pestaña **Transiciones** del panel izquierdo y **arrastra** tu transición a la unión entre dos clips. También puedes seleccionar los dos clips y pulsar `Ctrl+D` para usar la transición por defecto.

Al aplicarla, el segundo clip se desplaza hacia la izquierda para crear el **solape**; el bloque dorado con rayas muestra la transición y sus bordes se pueden arrastrar para cambiar la duración. Selecciónala para ajustar duración, audio y parámetros en el Inspector.

::: tip Siguiente paso
Lee [Anatomía de un archivo](./anatomia) y [La regla de oro](./regla-de-oro): son las dos ideas que lo explican todo.
:::
