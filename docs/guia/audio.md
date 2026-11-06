# Audio y mezclador

![Espacio Audio con el mezclador y los medidores](/capturas/audio.png)


## Tres niveles de volumen

El volumen que se oye es el producto de tres niveles:

```
ganancia final = volumen del clip × volumen de la pista × volumen general (Master)
```

más los fundidos del clip.

| Nivel | Dónde |
|-------|-------|
| **Clip** (0–200 %, también en dB) | Inspector › Audio |
| **Pista** | Cabecera de pista (pistas de audio) y Mezclador |
| **General (Master)** | Control junto al monitor y Mezclador |

En el Inspector también puedes **silenciar** el clip y definir un **fundido de entrada y de salida** en segundos.

Las pistas de video contienen el audio de sus clips. **Silenciar** (M) apaga una pista; con **Solo** (S) en alguna pista, únicamente suenan las pistas en solo.

## Mezclador

El espacio de trabajo **Audio** muestra una columna por pista más el **Master**, con fader vertical, botones M y S, valor en dB y un medidor de nivel. El paneo está reservado para una versión futura.

## Medidores

El panel **Medidores** muestra el nivel estéreo del Master en dBFS (barra de nivel eficaz y marca de pico). Si la señal alcanza 0 dBFS se enciende un indicador rojo de **recorte**.
