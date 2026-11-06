// Viditor — API de transiciones, apiVersion 1
// Este archivo se carga en Monaco para dar autocompletado a los archivos .js de transiciones y es la fuente
// de la referencia generada (TypeDoc → docs/api/). Todo miembro lleva JSDoc en español con @example.

/**
 * Un color: texto CSS (`"#ff0000"`, `"rgb(255, 0, 0)"`, `"hsl(0, 100%, 50%)"`, `"red"`) o un objeto {@link Color}.
 *
 * @example
 * ```js
 * draw.fill("#000000");               // texto CSS
 * draw.fill(color.rgb(0, 0, 0, 0.5)); // objeto Color
 * ```
 */
type ColorLike = string | Color;

/**
 * Color RGBA devuelto por {@link ColorUtils}.
 *
 * @example
 * ```js
 * const c = color.rgb(255, 128, 0, 0.5); // { r: 255, g: 128, b: 0, a: 0.5 }
 * ```
 */
interface Color {
  /**
   * Rojo, de 0 a 255.
   * @example
   * ```js
   * const rojo = color.rgb(200, 0, 0).r; // 200
   * ```
   */
  r: number;
  /**
   * Verde, de 0 a 255.
   * @example
   * ```js
   * const verde = color.rgb(0, 200, 0).g; // 200
   * ```
   */
  g: number;
  /**
   * Azul, de 0 a 255.
   * @example
   * ```js
   * const azul = color.rgb(0, 0, 200).b; // 200
   * ```
   */
  b: number;
  /**
   * Opacidad, de 0 (transparente) a 1 (opaco).
   * @example
   * ```js
   * const medio = color.rgb(0, 0, 0, 0.5).a; // 0.5
   * ```
   */
  a: number;
}

/**
 * Tamaño y frecuencia del proyecto. Disponible como el global {@link screen}.
 *
 * @example
 * ```js
 * leaveClip.move(screen.width / 2, 0); // medio ancho de pantalla
 * ```
 */
interface Screen {
  /**
   * Ancho del cuadro del proyecto en píxeles.
   * @example
   * ```js
   * enterClip.move(-screen.width, 0); // empieza fuera de pantalla, a la izquierda
   * ```
   */
  readonly width: number;
  /**
   * Alto del cuadro del proyecto en píxeles.
   * @example
   * ```js
   * enterClip.move(0, screen.height); // empieza fuera de pantalla, abajo
   * ```
   */
  readonly height: number;
  /**
   * Fotogramas por segundo del proyecto.
   * @example
   * ```js
   * const frameSeconds = 1 / screen.fps;
   * ```
   */
  readonly fps: number;
  /**
   * Relación de aspecto: ancho ÷ alto.
   * @example
   * ```js
   * const esVertical = screen.aspect < 1;
   * ```
   */
  readonly aspect: number;
}

/**
 * Métodos de transformación comunes a capas, partes de clip y figuras. Todos devuelven el propio objeto para poder
 * encadenarlos. Cada frame empieza desde cero: las llamadas describen el estado de ese frame y no se acumulan entre frames.
 * Dentro de un mismo frame se componen en orden. El orden de aplicación es escala → volteo → rotación (sobre el pivote) → traslación.
 *
 * @typeParam T - Tipo concreto devuelto para encadenar llamadas.
 * @example
 * ```js
 * leaveClip.scale(0.8).rotate(10).move(100, 0).alpha(0.5);
 * ```
 */
interface Transformable<T> {
  /**
   * Traslada el elemento en píxeles. Varias llamadas en el mismo frame se suman.
   *
   * @param dx - Desplazamiento horizontal (positivo = a la derecha).
   * @param dy - Desplazamiento vertical (positivo = hacia abajo).
   * @returns El mismo elemento, para encadenar.
   * @example
   * ```js
   * leaveClip.move(progress * screen.width, 0); // sale hacia la derecha
   * ```
   */
  move(dx: number, dy: number): T;
  /**
   * Escala uniforme respecto al pivote (1 = tamaño original). Varias llamadas se multiplican.
   *
   * @param s - Factor de escala.
   * @returns El mismo elemento, para encadenar.
   * @example
   * ```js
   * leaveClip.scale(1 - progress); // se encoge hasta desaparecer
   * ```
   */
  scale(s: number): T;
  /**
   * Escala con factores distintos en cada eje.
   *
   * @param sx - Factor horizontal.
   * @param sy - Factor vertical.
   * @returns El mismo elemento, para encadenar.
   * @example
   * ```js
   * strip.scale(1, 1 - progress); // se aplasta solo en vertical
   * ```
   */
  scale(sx: number, sy: number): T;
  /**
   * Gira el elemento alrededor de su pivote. Varias llamadas se suman.
   *
   * @param deg - Ángulo en grados (positivo = sentido horario).
   * @returns El mismo elemento, para encadenar.
   * @example
   * ```js
   * enterClip.rotate(-90 * (1 - progress)); // llega girando
   * ```
   */
  rotate(deg: number): T;
  /**
   * Cambia el pivote de la escala y la rotación. Por defecto es el centro del elemento.
   *
   * @param px - Posición horizontal normalizada del pivote (0 = izquierda, 1 = derecha).
   * @param py - Posición vertical normalizada del pivote (0 = arriba, 1 = abajo).
   * @returns El mismo elemento, para encadenar.
   * @example
   * ```js
   * leaveClip.pivot(0, 0).rotate(progress * 90); // gira desde la esquina superior izquierda
   * ```
   */
  pivot(px: number, py: number): T;
  /**
   * Transparencia en este frame: 0 = invisible, 1 = opaco. Se multiplica con la opacidad base del clip (Inspector)
   * y, si se llama varias veces, los valores se multiplican entre sí. Los valores fuera de rango se limitan a 0–1.
   *
   * @param a - Opacidad de 0 a 1.
   * @returns El mismo elemento, para encadenar.
   * @example
   * ```js
   * leaveClip.alpha(1 - progress); // el saliente se desvanece
   * ```
   */
  alpha(a: number): T;
  /**
   * Alias de {@link Transformable.alpha}.
   *
   * @param a - Opacidad de 0 a 1.
   * @returns El mismo elemento, para encadenar.
   * @example
   * ```js
   * enterClip.opacity(progress);
   * ```
   */
  opacity(a: number): T;
  /**
   * Muestra u oculta el elemento en este frame.
   *
   * @param v - `false` para ocultarlo.
   * @returns El mismo elemento, para encadenar.
   * @example
   * ```js
   * if (progress < 0.5) enterClip.visible(false); // el entrante aparece en la segunda mitad
   * ```
   */
  visible(v: boolean): T;
  /**
   * Orden de dibujo: mayor = más adelante. Valores base: entrante 0, saliente 1, figuras 2.
   *
   * @param n - Posición en la pila.
   * @returns El mismo elemento, para encadenar.
   * @example
   * ```js
   * enterClip.z(2); // el entrante se dibuja por encima del saliente
   * ```
   */
  z(n: number): T;
}

/**
 * Volteo, máscaras y filtros de imagen, comunes a capas y partes de clip. Los valores de filtro de 1 significan «sin cambio»
 * (brillo, contraste, saturación) o van de 0 a 1 (escala de grises, inversión, sepia).
 *
 * @typeParam T - Tipo concreto devuelto para encadenar llamadas.
 * @example
 * ```js
 * leaveClip.grayscale(progress).blur(progress * 20);
 * ```
 */
interface Filterable<T> {
  /**
   * Voltea el elemento respecto a su pivote.
   *
   * @param h - Voltear horizontalmente.
   * @param v - Voltear verticalmente (opcional).
   * @returns El mismo elemento, para encadenar.
   * @example
   * ```js
   * enterClip.flip(progress < 0.5, false);
   * ```
   */
  flip(h: boolean, v?: boolean): T;
  /**
   * Usa una figura como máscara alfa: el elemento solo se ve dentro de ella. La figura deja de dibujarse.
   * La máscara está en coordenadas de pantalla.
   *
   * @param shape - Figura creada con {@link Draw}.
   * @param options - `invert` muestra lo de fuera; `feather` suaviza el borde (en píxeles).
   * @returns El mismo elemento, para encadenar.
   * @example
   * ```js
   * enterClip.z(2).mask(draw.circle(960, 540, progress * 1200), { feather: 12 });
   * ```
   */
  mask(shape: Shape, options?: { invert?: boolean; feather?: number }): T;
  /**
   * Brillo (1 = sin cambio, 0 = negro).
   *
   * @param v - Factor de brillo.
   * @returns El mismo elemento, para encadenar.
   * @example
   * ```js
   * leaveClip.brightness(1 - 0.5 * progress);
   * ```
   */
  brightness(v: number): T;
  /**
   * Contraste (1 = sin cambio).
   *
   * @param v - Factor de contraste.
   * @returns El mismo elemento, para encadenar.
   * @example
   * ```js
   * leaveClip.contrast(1 + progress);
   * ```
   */
  contrast(v: number): T;
  /**
   * Saturación (1 = sin cambio, 0 = gris).
   *
   * @param v - Factor de saturación.
   * @returns El mismo elemento, para encadenar.
   * @example
   * ```js
   * enterClip.saturation(progress);
   * ```
   */
  saturation(v: number): T;
  /**
   * Convierte a escala de grises.
   *
   * @param a - Cantidad de 0 (color) a 1 (gris).
   * @returns El mismo elemento, para encadenar.
   * @example
   * ```js
   * leaveClip.grayscale(progress);
   * ```
   */
  grayscale(a: number): T;
  /**
   * Invierte los colores.
   *
   * @param a - Cantidad de 0 (normal) a 1 (invertido).
   * @returns El mismo elemento, para encadenar.
   * @example
   * ```js
   * leaveClip.invert(progress);
   * ```
   */
  invert(a: number): T;
  /**
   * Tono sepia.
   *
   * @param a - Cantidad de 0 a 1.
   * @returns El mismo elemento, para encadenar.
   * @example
   * ```js
   * leaveClip.sepia(progress);
   * ```
   */
  sepia(a: number): T;
  /**
   * Mezcla el elemento con un color.
   *
   * @param color - Color de la mezcla.
   * @param amount - Cantidad de 0 (sin cambio) a 1 (color sólido).
   * @returns El mismo elemento, para encadenar.
   * @example
   * ```js
   * leaveClip.tint("#ff0000", progress * 0.6);
   * ```
   */
  tint(color: ColorLike, amount: number): T;
  /**
   * Desenfoque gaussiano.
   *
   * @param px - Radio en píxeles del proyecto.
   * @returns El mismo elemento, para encadenar.
   * @example
   * ```js
   * leaveClip.blur(Math.sin(progress * Math.PI) * 30);
   * ```
   */
  blur(px: number): T;
  /**
   * Pixelado.
   *
   * @param px - Tamaño del bloque en píxeles del proyecto.
   * @returns El mismo elemento, para encadenar.
   * @example
   * ```js
   * leaveClip.pixelate(1 + progress * 60);
   * ```
   */
  pixelate(px: number): T;
}

/**
 * Una capa completa: `leaveClip` (clip saliente) o `enterClip` (clip entrante). Ocupa todo el cuadro, ya con la
 * transformación base del clip aplicada (un clip reducido al 50 % es un rectángulo pequeño dentro de una capa
 * de pantalla completa transparente).
 *
 * @example
 * ```js
 * function render(leaveClip, enterClip, progress) {
 *   leaveClip.move(progress * screen.width, 0);
 * }
 * ```
 */
interface Layer extends Transformable<Layer>, Filterable<Layer> {
  /**
   * Ancho de la capa (igual al de la pantalla).
   * @example
   * ```js
   * leaveClip.move(leaveClip.width * progress, 0);
   * ```
   */
  readonly width: number;
  /**
   * Alto de la capa (igual al de la pantalla).
   * @example
   * ```js
   * leaveClip.move(0, leaveClip.height * progress);
   * ```
   */
  readonly height: number;
  /**
   * Divide la capa en `cols × rows` partes. La capa original deja de dibujarse y se dibujan sus partes.
   * Llámalo en `init` para reutilizar las partes en cada frame (máximo 4 096 partes por capa).
   *
   * @param cols - Número de columnas.
   * @param rows - Número de filas.
   * @returns Las partes, fila por fila de izquierda a derecha.
   * @example
   * ```js
   * let parts;
   * function init(leaveClip) { parts = leaveClip.splitGrid(4, 3); } // 12 partes
   * ```
   */
  splitGrid(cols: number, rows: number): ClipPart[];
  /**
   * Divide la capa en franjas.
   *
   * @param n - Número de franjas.
   * @param direction - `"horizontal"` = franjas horizontales (apiladas); `"vertical"` = franjas verticales.
   * @returns Las partes, en orden.
   * @example
   * ```js
   * const strips = leaveClip.splitStrips(8, "horizontal");
   * ```
   */
  splitStrips(n: number, direction: "horizontal" | "vertical"): ClipPart[];
}

/**
 * Una parte de una capa creada con {@link Layer.splitGrid} o {@link Layer.splitStrips}. Se transforma respecto a su
 * propio centro y hereda las transformaciones de su capa.
 *
 * @example
 * ```js
 * for (const part of parts) part.scale(1 - progress).rotate(part.index * 10);
 * ```
 */
interface ClipPart extends Transformable<ClipPart>, Filterable<ClipPart> {
  /**
   * Posición en el arreglo (fila por fila, de izquierda a derecha).
   * @example
   * ```js
   * part.alpha(1 - part.index / parts.length);
   * ```
   */
  readonly index: number;
  /**
   * Columna de la parte (empieza en 0).
   * @example
   * ```js
   * part.move(0, part.col % 2 === 0 ? 40 : -40);
   * ```
   */
  readonly col: number;
  /**
   * Fila de la parte (empieza en 0).
   * @example
   * ```js
   * part.move(part.row * 10 * progress, 0);
   * ```
   */
  readonly row: number;
  /**
   * Borde izquierdo original de la parte, en píxeles.
   * @example
   * ```js
   * const esMitadIzquierda = part.x < screen.width / 2;
   * ```
   */
  readonly x: number;
  /**
   * Borde superior original de la parte, en píxeles.
   * @example
   * ```js
   * const esMitadSuperior = part.y < screen.height / 2;
   * ```
   */
  readonly y: number;
  /**
   * Ancho original de la parte, en píxeles.
   * @example
   * ```js
   * part.scale(part.width / screen.width + progress);
   * ```
   */
  readonly width: number;
  /**
   * Alto original de la parte, en píxeles.
   * @example
   * ```js
   * part.scale(1, part.height / screen.height + progress);
   * ```
   */
  readonly height: number;
  /**
   * Centro horizontal original de la parte, en píxeles.
   * @example
   * ```js
   * part.move((part.cx - screen.width / 2) * progress, 0); // se aleja del centro
   * ```
   */
  readonly cx: number;
  /**
   * Centro vertical original de la parte, en píxeles.
   * @example
   * ```js
   * part.move(0, (part.cy - screen.height / 2) * progress);
   * ```
   */
  readonly cy: number;
}

/**
 * Degradado para el relleno de una figura.
 *
 * @example
 * ```js
 * draw.rect(0, 0, screen.width, screen.height, {
 *   gradient: { type: "linear", stops: [[0, "#000"], [1, "#fff"]], from: [0, 0], to: [screen.width, 0] }
 * });
 * ```
 */
interface Gradient {
  /**
   * Tipo de degradado: lineal o radial.
   * @example
   * ```js
   * const g = { type: "radial", stops: [[0, "#fff"], [1, "#000"]] };
   * ```
   */
  type: "linear" | "radial";
  /**
   * Paradas `[posición 0–1, color]`.
   * @example
   * ```js
   * const stops = [[0, "#ff0000"], [0.5, "#ffff00"], [1, "#00ff00"]];
   * ```
   */
  stops: [number, ColorLike][];
  /**
   * Punto inicial `[x, y]` en píxeles (centro del degradado radial). Por defecto, la caja de la figura.
   * @example
   * ```js
   * const from = [0, screen.height / 2];
   * ```
   */
  from?: [number, number];
  /**
   * Punto final `[x, y]` en píxeles (en el radial define el radio). Por defecto, la caja de la figura.
   * @example
   * ```js
   * const to = [screen.width, screen.height / 2];
   * ```
   */
  to?: [number, number];
}

/**
 * Estilo de una figura.
 *
 * @example
 * ```js
 * draw.rect(100, 100, 400, 200, { fill: "#ff0000", stroke: "#ffffff", strokeWidth: 4, radius: 16 });
 * ```
 */
interface ShapeStyle {
  /**
   * Color de relleno. Si no hay relleno, trazo ni degradado, la figura se rellena de blanco.
   * @example
   * ```js
   * draw.circle(960, 540, 200, { fill: "#ff8800" });
   * ```
   */
  fill?: ColorLike;
  /**
   * Color del trazo.
   * @example
   * ```js
   * draw.circle(960, 540, 200, { stroke: "#ffffff" });
   * ```
   */
  stroke?: ColorLike;
  /**
   * Grosor del trazo en píxeles.
   * @example
   * ```js
   * draw.line(0, 0, 400, 400, { stroke: "#fff", strokeWidth: 6 });
   * ```
   */
  strokeWidth?: number;
  /**
   * Opacidad de la figura, de 0 a 1.
   * @example
   * ```js
   * draw.rect(0, 0, 300, 300, { fill: "#000", opacity: 0.4 });
   * ```
   */
  opacity?: number;
  /**
   * Degradado de relleno (sustituye a `fill`).
   * @example
   * ```js
   * draw.circle(960, 540, 300, { gradient: { type: "radial", stops: [[0, "#fff"], [1, "#000"]] } });
   * ```
   */
  gradient?: Gradient;
  /**
   * Radio de las esquinas redondeadas (solo `draw.rect`).
   * @example
   * ```js
   * draw.rect(100, 100, 300, 200, { radius: 24 });
   * ```
   */
  radius?: number;
}

/**
 * Estilo de texto: amplía {@link ShapeStyle}.
 *
 * @example
 * ```js
 * draw.text("Hola", 960, 540, { size: 96, weight: "bold", align: "center", fill: "#fff" });
 * ```
 */
interface TextStyle extends ShapeStyle {
  /**
   * Familia tipográfica (por defecto `sans-serif`).
   * @example
   * ```js
   * draw.text("Hola", 100, 100, { font: "serif" });
   * ```
   */
  font?: string;
  /**
   * Tamaño en píxeles (por defecto 48).
   * @example
   * ```js
   * draw.text("Hola", 100, 100, { size: 120 });
   * ```
   */
  size?: number;
  /**
   * Grosor: número CSS (100–900), `"normal"` o `"bold"`.
   * @example
   * ```js
   * draw.text("Hola", 100, 100, { weight: "bold" });
   * ```
   */
  weight?: number | "normal" | "bold";
  /**
   * Alineación respecto a la posición `x`.
   * @example
   * ```js
   * draw.text("Hola", screen.width / 2, 100, { align: "center" });
   * ```
   */
  align?: "left" | "center" | "right";
}

/**
 * Una figura devuelta por {@link Draw}. Admite las transformaciones de {@link Transformable} y puede usarse
 * como máscara con `layer.mask(shape)`, en cuyo caso deja de dibujarse.
 *
 * @example
 * ```js
 * const estrella = draw.star(960, 540, 5, 200, 80, { fill: "#ffd24a" });
 * estrella.rotate(progress * 360).scale(progress);
 * ```
 */
interface Shape extends Transformable<Shape> {}

/**
 * Fábrica de figuras. Disponible como el global {@link draw}. Las figuras creadas en `init` duran toda la transición;
 * las creadas en `render` existen solo en ese frame (máximo 10 000 por frame).
 *
 * @example
 * ```js
 * draw.circle(960, 540, 100, { fill: "#ffffff" }).alpha(1 - progress);
 * ```
 */
interface Draw {
  /**
   * Rectángulo.
   *
   * @param x - Borde izquierdo.
   * @param y - Borde superior.
   * @param w - Ancho.
   * @param h - Alto.
   * @param style - Estilo (`style.radius` redondea las esquinas).
   * @returns La figura creada.
   * @example
   * ```js
   * draw.rect(0, 0, screen.width * progress, screen.height, { fill: "#000" });
   * ```
   */
  rect(x: number, y: number, w: number, h: number, style?: ShapeStyle): Shape;
  /**
   * Círculo.
   *
   * @param cx - Centro horizontal.
   * @param cy - Centro vertical.
   * @param r - Radio.
   * @param style - Estilo.
   * @returns La figura creada.
   * @example
   * ```js
   * draw.circle(screen.width / 2, screen.height / 2, progress * 800);
   * ```
   */
  circle(cx: number, cy: number, r: number, style?: ShapeStyle): Shape;
  /**
   * Elipse.
   *
   * @param cx - Centro horizontal.
   * @param cy - Centro vertical.
   * @param rx - Radio horizontal.
   * @param ry - Radio vertical.
   * @param style - Estilo.
   * @returns La figura creada.
   * @example
   * ```js
   * draw.ellipse(960, 540, 600 * progress, 300 * progress);
   * ```
   */
  ellipse(cx: number, cy: number, rx: number, ry: number, style?: ShapeStyle): Shape;
  /**
   * Línea (por defecto blanca de 2 px).
   *
   * @param x1 - X del primer punto.
   * @param y1 - Y del primer punto.
   * @param x2 - X del segundo punto.
   * @param y2 - Y del segundo punto.
   * @param style - Estilo (usa `stroke` y `strokeWidth`).
   * @returns La figura creada.
   * @example
   * ```js
   * draw.line(0, 0, screen.width * progress, screen.height, { stroke: "#fff", strokeWidth: 8 });
   * ```
   */
  line(x1: number, y1: number, x2: number, y2: number, style?: ShapeStyle): Shape;
  /**
   * Polígono cerrado.
   *
   * @param points - Vértices `[[x, y], …]`.
   * @param style - Estilo.
   * @returns La figura creada.
   * @example
   * ```js
   * draw.polygon([[0, 0], [screen.width * progress, 0], [0, screen.height]]);
   * ```
   */
  polygon(points: [number, number][], style?: ShapeStyle): Shape;
  /**
   * Trazado con la sintaxis `d` de SVG.
   *
   * @param svgPathData - Datos del trazado, p. ej. `"M 0 0 L 100 0 L 100 100 Z"`.
   * @param style - Estilo.
   * @returns La figura creada.
   * @example
   * ```js
   * draw.path("M 100 100 C 200 0 300 200 400 100", { stroke: "#fff", strokeWidth: 6 });
   * ```
   */
  path(svgPathData: string, style?: ShapeStyle): Shape;
  /**
   * Estrella.
   *
   * @param cx - Centro horizontal.
   * @param cy - Centro vertical.
   * @param points - Número de puntas.
   * @param rOuter - Radio exterior.
   * @param rInner - Radio interior.
   * @param style - Estilo.
   * @returns La figura creada.
   * @example
   * ```js
   * draw.star(960, 540, 5, 300 * progress, 120 * progress);
   * ```
   */
  star(cx: number, cy: number, points: number, rOuter: number, rInner: number, style?: ShapeStyle): Shape;
  /**
   * Texto.
   *
   * @param str - Texto a escribir.
   * @param x - Posición horizontal (según `align`).
   * @param y - Línea base vertical.
   * @param style - Estilo (`font`, `size`, `weight`, `align`).
   * @returns La figura creada.
   * @example
   * ```js
   * draw.text("Fin", screen.width / 2, screen.height / 2, { size: 120, align: "center" });
   * ```
   */
  text(str: string, x: number, y: number, style?: TextStyle): Shape;
  /**
   * Cubre toda la pantalla con un color.
   *
   * @param color - Color de relleno.
   * @returns La figura creada.
   * @example
   * ```js
   * draw.fill("#000000").alpha(progress * 2); // fundido a negro
   * ```
   */
  fill(color: ColorLike): Shape;
}

/**
 * Función de suavizado: recibe un progreso de 0 a 1 y devuelve el progreso suavizado.
 *
 * @example
 * ```js
 * const f = ease.inOutCubic;
 * const p = f(progress);
 * ```
 */
type EasingFn = (t: number) => number;

/**
 * Nombres de las curvas de suavizado disponibles en {@link ease}.
 *
 * @example
 * ```js
 * const p = ease[ctx.params.easing](progress); // el nombre llega desde un parámetro de tipo "easing"
 * ```
 */
type EasingName =
  | "linear" | "inQuad" | "outQuad" | "inOutQuad" | "inCubic" | "outCubic" | "inOutCubic"
  | "inQuart" | "outQuart" | "inOutQuart" | "inExpo" | "outExpo" | "inOutExpo"
  | "inBack" | "outBack" | "inOutBack" | "outBounce" | "outElastic";

/**
 * Utilidades matemáticas. Disponible como el global {@link math}.
 *
 * @example
 * ```js
 * const x = math.lerp(0, screen.width, ease.outCubic(progress));
 * ```
 */
interface MathUtils {
  /**
   * Interpolación lineal.
   *
   * @param a - Valor inicial.
   * @param b - Valor final.
   * @param t - Posición de 0 a 1.
   * @returns `a + (b − a)·t`.
   * @example
   * ```js
   * leaveClip.scale(math.lerp(1, 2, progress));
   * ```
   */
  lerp(a: number, b: number, t: number): number;
  /**
   * Limita un valor a un rango.
   *
   * @param v - Valor.
   * @param min - Mínimo.
   * @param max - Máximo.
   * @returns El valor dentro de `[min, max]`.
   * @example
   * ```js
   * const a = math.clamp(progress * 3, 0, 1);
   * ```
   */
  clamp(v: number, min: number, max: number): number;
  /**
   * Interpolación suave (curva en S) entre dos bordes.
   *
   * @param e0 - Borde inferior.
   * @param e1 - Borde superior.
   * @param x - Valor a evaluar.
   * @returns 0 por debajo de `e0`, 1 por encima de `e1` y una curva suave entre ambos.
   * @example
   * ```js
   * enterClip.alpha(math.smoothstep(0.3, 0.7, progress));
   * ```
   */
  smoothstep(e0: number, e1: number, x: number): number;
  /**
   * Convierte un valor de un rango a otro.
   *
   * @param v - Valor.
   * @param inMin - Inicio del rango de entrada.
   * @param inMax - Fin del rango de entrada.
   * @param outMin - Inicio del rango de salida.
   * @param outMax - Fin del rango de salida.
   * @returns El valor convertido (sin limitar).
   * @example
   * ```js
   * const x = math.map(progress, 0, 1, -screen.width, 0);
   * ```
   */
  map(v: number, inMin: number, inMax: number, outMin: number, outMax: number): number;
  /**
   * Grados a radianes.
   *
   * @param d - Ángulo en grados.
   * @returns Ángulo en radianes.
   * @example
   * ```js
   * const a = math.degToRad(90); // 1.5708…
   * ```
   */
  degToRad(d: number): number;
  /**
   * Radianes a grados.
   *
   * @param r - Ángulo en radianes.
   * @returns Ángulo en grados.
   * @example
   * ```js
   * const d = math.radToDeg(Math.PI); // 180
   * ```
   */
  radToDeg(r: number): number;
  /**
   * Progreso local de 0 a 1 del elemento `index` de `count` cuando se animan de forma escalonada.
   *
   * @param index - Posición del elemento.
   * @param count - Número total de elementos.
   * @param progress - Progreso global de 0 a 1.
   * @param overlap - Solape entre elementos: 0 = uno tras otro, 1 = todos a la vez (por defecto 0,5).
   * @returns Progreso de 0 a 1 de ese elemento.
   * @example
   * ```js
   * parts[i].scale(1 - math.stagger(i, parts.length, progress, 0.5));
   * ```
   */
  stagger(index: number, count: number, progress: number, overlap?: number): number;
}

/**
 * Utilidades de color. Disponible como el global {@link color}.
 *
 * @example
 * ```js
 * const c = color.mix("#ff0000", "#0000ff", progress);
 * ```
 */
interface ColorUtils {
  /**
   * Crea un color a partir de sus componentes RGB.
   *
   * @param r - Rojo, 0–255.
   * @param g - Verde, 0–255.
   * @param b - Azul, 0–255.
   * @param a - Opacidad, 0–1 (por defecto 1).
   * @returns El color.
   * @example
   * ```js
   * draw.fill(color.rgb(255, 0, 0, 0.5));
   * ```
   */
  rgb(r: number, g: number, b: number, a?: number): Color;
  /**
   * Crea un color a partir de tono, saturación y luminosidad.
   *
   * @param h - Tono en grados, 0–360.
   * @param s - Saturación, 0–1.
   * @param l - Luminosidad, 0–1.
   * @param a - Opacidad, 0–1 (por defecto 1).
   * @returns El color.
   * @example
   * ```js
   * draw.fill(color.hsl(progress * 360, 1, 0.5)); // recorre el arcoíris
   * ```
   */
  hsl(h: number, s: number, l: number, a?: number): Color;
  /**
   * Mezcla dos colores.
   *
   * @param c1 - Color inicial.
   * @param c2 - Color final.
   * @param t - Posición de 0 a 1.
   * @returns El color mezclado.
   * @example
   * ```js
   * draw.fill(color.mix("#000000", "#ffffff", progress));
   * ```
   */
  mix(c1: ColorLike, c2: ColorLike, t: number): Color;
}

/**
 * Contexto de la instancia que recibe `init` y `render`.
 *
 * @typeParam P - Forma de los parámetros definidos en `meta.params`.
 * @example
 * ```js
 * function render(leaveClip, enterClip, progress, ctx) {
 *   const p = ease[ctx.params.easing](progress);
 * }
 * ```
 */
interface TransitionContext<P = Record<string, any>> {
  /**
   * Valores de los parámetros definidos en `meta.params` (con su valor por defecto si el usuario no los cambió).
   * @example
   * ```js
   * const columnas = ctx.params.cols;
   * ```
   */
  readonly params: P;
  /**
   * Duración de la transición en segundos.
   * @example
   * ```js
   * const velocidad = screen.width / ctx.duration;
   * ```
   */
  readonly duration: number;
  /**
   * Índice del frame actual dentro de la transición (0 … totalFrames − 1).
   * @example
   * ```js
   * if (ctx.frame % 2 === 0) leaveClip.invert(1);
   * ```
   */
  readonly frame: number;
  /**
   * Número total de frames de la transición.
   * @example
   * ```js
   * const ultimo = ctx.frame === ctx.totalFrames - 1;
   * ```
   */
  readonly totalFrames: number;
  /**
   * Segundos transcurridos desde el inicio de la transición.
   * @example
   * ```js
   * leaveClip.rotate(ctx.time * 180);
   * ```
   */
  readonly time: number;
  /**
   * Semilla de la instancia (editable en el Inspector).
   * @example
   * ```js
   * log("semilla", ctx.seed);
   * ```
   */
  readonly seed: number;
  /**
   * `false` si la transición está al principio de un clip sin clip anterior (el saliente es transparente).
   * @example
   * ```js
   * if (!ctx.hasLeave) enterClip.alpha(progress);
   * ```
   */
  readonly hasLeave: boolean;
  /**
   * `false` si la transición está al final de un clip sin clip siguiente (el entrante es transparente).
   * @example
   * ```js
   * if (!ctx.hasEnter) leaveClip.alpha(1 - progress);
   * ```
   */
  readonly hasEnter: boolean;
  /**
   * Número pseudoaleatorio en [0, 1), determinista: la secuencia se reinicia en `init` y en cada `render`
   * (el mismo frame produce siempre los mismos números). `Math.random` está deshabilitado.
   *
   * @returns Un número en [0, 1).
   * @example
   * ```js
   * const angulo = ctx.random() * Math.PI * 2;
   * ```
   */
  random(): number;
}

/**
 * Definición de un parámetro editable de la transición: el Inspector genera el control según su `type`.
 *
 * @example
 * ```js
 * const meta = {
 *   apiVersion: 1, id: "ejemplo", name: "Ejemplo",
 *   params: {
 *     cols: { type: "int", label: "Columnas", default: 4, min: 1, max: 32 },
 *     direccion: { type: "enum", label: "Dirección", options: ["izquierda", "derecha"], default: "derecha" },
 *     centro: { type: "point", label: "Centro", default: [0.5, 0.5] }
 *   }
 * };
 * ```
 */
type ParamDef =
  | { type: "number" | "int"; label?: string; default: number; min?: number; max?: number; step?: number }
  | { type: "boolean"; label?: string; default: boolean }
  | { type: "color"; label?: string; default: string }
  | { type: "enum"; label?: string; options: string[]; default: string }
  | { type: "easing"; label?: string; default: EasingName }
  | { type: "angle"; label?: string; default: number }
  | { type: "point"; label?: string; default: [number, number] };

/**
 * Metadatos obligatorios de un archivo de transición: la constante `meta`.
 *
 * @example
 * ```js
 * const meta = {
 *   apiVersion: 1,
 *   id: "mi-transicion",
 *   name: "Mi transición",
 *   category: "Fundidos",
 *   defaultDuration: 1.0,
 *   audio: "crossfade"
 * };
 * ```
 */
interface TransitionMeta {
  /**
   * Versión de la API; hoy siempre `1`.
   * @example
   * ```js
   * const meta = { apiVersion: 1, id: "a", name: "A" };
   * ```
   */
  apiVersion: 1;
  /**
   * Identificador único en su carpeta: solo `a-z`, `0-9` y guiones. Debe coincidir con el nombre del archivo (sin `.js`).
   * @example
   * ```js
   * const meta = { apiVersion: 1, id: "slide-horizontal", name: "Deslizar" };
   * ```
   */
  id: string;
  /**
   * Nombre visible en el panel Transiciones.
   * @example
   * ```js
   * const meta = { apiVersion: 1, id: "a", name: "Fundido cruzado" };
   * ```
   */
  name: string;
  /**
   * Categoría que agrupa la transición en el panel (por defecto «Personalizadas»).
   * @example
   * ```js
   * const meta = { apiVersion: 1, id: "a", name: "A", category: "Deslizar" };
   * ```
   */
  category?: string;
  /**
   * Autor de la transición.
   * @example
   * ```js
   * const meta = { apiVersion: 1, id: "a", name: "A", author: "Pols" };
   * ```
   */
  author?: string;
  /**
   * Descripción corta.
   * @example
   * ```js
   * const meta = { apiVersion: 1, id: "a", name: "A", description: "El entrante empuja al saliente." };
   * ```
   */
  description?: string;
  /**
   * Duración por defecto en segundos (1 si se omite).
   * @example
   * ```js
   * const meta = { apiVersion: 1, id: "a", name: "A", defaultDuration: 0.5 };
   * ```
   */
  defaultDuration?: number;
  /**
   * Qué hace el audio durante la transición: `"crossfade"` (potencia constante, por defecto), `"cut"` (corte en el
   * punto medio) o `"none"` (cada clip conserva su volumen).
   * @example
   * ```js
   * const meta = { apiVersion: 1, id: "a", name: "A", audio: "cut" };
   * ```
   */
  audio?: "crossfade" | "cut" | "none";
  /**
   * Parámetros editables, por nombre. Sus valores llegan en `ctx.params`.
   * @example
   * ```js
   * const meta = { apiVersion: 1, id: "a", name: "A", params: { easing: { type: "easing", default: "inOutCubic" } } };
   * ```
   */
  params?: Record<string, ParamDef>;
}

/**
 * Tamaño y frecuencia del proyecto.
 *
 * @example
 * ```js
 * const centro = [screen.width / 2, screen.height / 2];
 * ```
 */
declare const screen: Screen;

/**
 * Fábrica de figuras (rectángulos, círculos, texto, rellenos…).
 *
 * @example
 * ```js
 * draw.fill("#000").alpha(progress);
 * ```
 */
declare const draw: Draw;

/**
 * Funciones de suavizado por nombre: `ease.inOutCubic(progress)`.
 *
 * @example
 * ```js
 * const p = ease.outBack(progress);
 * ```
 */
declare const ease: Record<EasingName, EasingFn>;

/**
 * Utilidades matemáticas (`lerp`, `clamp`, `smoothstep`, `map`, `stagger`…).
 *
 * @example
 * ```js
 * const x = math.lerp(0, 100, progress);
 * ```
 */
declare const math: MathUtils;

/**
 * Utilidades de color (`rgb`, `hsl`, `mix`).
 *
 * @example
 * ```js
 * const c = color.hsl(200, 0.8, 0.5);
 * ```
 */
declare const color: ColorUtils;

/**
 * Escribe en la consola del editor de transiciones (limitado a 200 líneas por segundo).
 *
 * @param args - Valores a mostrar.
 * @example
 * ```js
 * log("progress", progress.toFixed(2));
 * ```
 */
declare function log(...args: any[]): void;
