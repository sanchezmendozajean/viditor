# Coordenadas, pivote y orden de dibujo

## Sistema de coordenadas

- Las unidades son **píxeles de la resolución del proyecto**: el origen está **arriba a la izquierda**, X crece hacia la derecha e Y hacia abajo. `screen.width` y `screen.height` dan el tamaño.
- Los ángulos se miden en **grados**; un ángulo positivo gira en sentido **horario**.
- Cada capa (`leaveClip`, `enterClip`) ocupa **todo el cuadro**, ya con la transformación base del clip aplicada. Un clip reducido al 50 % es un rectángulo pequeño dentro de una capa de pantalla completa transparente.

## Pivote

El pivote por defecto de capas, partes y figuras es su **centro**. Se cambia con `pivot(px, py)` en coordenadas **normalizadas** (0–1) del propio elemento:

```js
leaveClip.pivot(0, 0).rotate(progress * 90); // gira desde la esquina superior izquierda
```

## Orden de aplicación

Dentro de un elemento: **escala → volteo → rotación (sobre el pivote) → traslación**. El orden de las llamadas entre distintos tipos no altera este orden; las llamadas del mismo tipo se acumulan (los desplazamientos se suman, las escalas se multiplican, las rotaciones se suman).

```js
// Es lo mismo escribirlo de cualquier manera:
leaveClip.move(100, 0).rotate(45).scale(0.5);
leaveClip.scale(0.5).rotate(45).move(100, 0);
```

## Orden de dibujo

Por defecto, de atrás hacia delante: **`enterClip`**, **`leaveClip`** y las **figuras** dibujadas (en orden de creación). Se cambia con `.z(n)`: mayor = más adelante. Los valores base son entrante 0, saliente 1 y figuras 2.

```js
enterClip.z(2);                 // el entrante pasa por encima del saliente
draw.circle(960, 540, 100).z(5); // y esta figura por encima de todo
```

Las partes de una capa (`splitGrid`) heredan el `z` de su capa.
