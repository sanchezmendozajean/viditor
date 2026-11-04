// Viditor — API de transiciones, apiVersion 1
// Este archivo se carga en Monaco para dar autocompletado a los archivos .js de transiciones.

type ColorLike = string | Color;

interface Color { r: number; g: number; b: number; a: number; }

interface Screen {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly aspect: number;
}

interface Transformable<T> {
  move(dx: number, dy: number): T;
  scale(s: number): T;
  scale(sx: number, sy: number): T;
  rotate(deg: number): T;
  pivot(px: number, py: number): T;
  /** Transparencia en este frame: 0 = invisible, 1 = opaco. Se multiplica con la opacidad base del clip. */
  alpha(a: number): T;
  /** Alias de alpha(). */
  opacity(a: number): T;
  visible(v: boolean): T;
  z(n: number): T;
}

interface Filterable<T> {
  flip(h: boolean, v?: boolean): T;
  mask(shape: Shape, options?: { invert?: boolean; feather?: number }): T;
  brightness(v: number): T;
  contrast(v: number): T;
  saturation(v: number): T;
  grayscale(a: number): T;
  invert(a: number): T;
  sepia(a: number): T;
  tint(color: ColorLike, amount: number): T;
  blur(px: number): T;
  pixelate(px: number): T;
}

interface Layer extends Transformable<Layer>, Filterable<Layer> {
  readonly width: number;
  readonly height: number;
  /** Divide la capa en cols × rows partes. La capa original deja de dibujarse. */
  splitGrid(cols: number, rows: number): ClipPart[];
  /** Divide la capa en n franjas. */
  splitStrips(n: number, direction: "horizontal" | "vertical"): ClipPart[];
}

interface ClipPart extends Transformable<ClipPart>, Filterable<ClipPart> {
  readonly index: number;
  readonly col: number;
  readonly row: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly cx: number;
  readonly cy: number;
}

interface Gradient {
  type: "linear" | "radial";
  stops: [number, ColorLike][];
  from?: [number, number];
  to?: [number, number];
}

interface ShapeStyle {
  fill?: ColorLike;
  stroke?: ColorLike;
  strokeWidth?: number;
  opacity?: number;
  gradient?: Gradient;
  radius?: number;
}

interface TextStyle extends ShapeStyle {
  font?: string;
  size?: number;
  weight?: number | "normal" | "bold";
  align?: "left" | "center" | "right";
}

interface Shape extends Transformable<Shape> {}

interface Draw {
  rect(x: number, y: number, w: number, h: number, style?: ShapeStyle): Shape;
  circle(cx: number, cy: number, r: number, style?: ShapeStyle): Shape;
  ellipse(cx: number, cy: number, rx: number, ry: number, style?: ShapeStyle): Shape;
  line(x1: number, y1: number, x2: number, y2: number, style?: ShapeStyle): Shape;
  polygon(points: [number, number][], style?: ShapeStyle): Shape;
  path(svgPathData: string, style?: ShapeStyle): Shape;
  star(cx: number, cy: number, points: number, rOuter: number, rInner: number, style?: ShapeStyle): Shape;
  text(str: string, x: number, y: number, style?: TextStyle): Shape;
  fill(color: ColorLike): Shape;
}

type EasingFn = (t: number) => number;
type EasingName =
  | "linear" | "inQuad" | "outQuad" | "inOutQuad" | "inCubic" | "outCubic" | "inOutCubic"
  | "inQuart" | "outQuart" | "inOutQuart" | "inExpo" | "outExpo" | "inOutExpo"
  | "inBack" | "outBack" | "inOutBack" | "outBounce" | "outElastic";

interface MathUtils {
  lerp(a: number, b: number, t: number): number;
  clamp(v: number, min: number, max: number): number;
  smoothstep(e0: number, e1: number, x: number): number;
  map(v: number, inMin: number, inMax: number, outMin: number, outMax: number): number;
  degToRad(d: number): number;
  radToDeg(r: number): number;
  /** Progreso local [0,1] del elemento `index` de `count`, con solape `overlap` (0–1). */
  stagger(index: number, count: number, progress: number, overlap?: number): number;
}

interface ColorUtils {
  rgb(r: number, g: number, b: number, a?: number): Color;
  hsl(h: number, s: number, l: number, a?: number): Color;
  mix(c1: ColorLike, c2: ColorLike, t: number): Color;
}

interface TransitionContext<P = Record<string, any>> {
  readonly params: P;
  readonly duration: number;
  readonly frame: number;
  readonly totalFrames: number;
  readonly time: number;
  readonly seed: number;
  readonly hasLeave: boolean;
  readonly hasEnter: boolean;
  random(): number;
}

type ParamDef =
  | { type: "number" | "int"; label?: string; default: number; min?: number; max?: number; step?: number }
  | { type: "boolean"; label?: string; default: boolean }
  | { type: "color"; label?: string; default: string }
  | { type: "enum"; label?: string; options: string[]; default: string }
  | { type: "easing"; label?: string; default: EasingName }
  | { type: "angle"; label?: string; default: number }
  | { type: "point"; label?: string; default: [number, number] };

interface TransitionMeta {
  apiVersion: 1;
  id: string;
  name: string;
  category?: string;
  author?: string;
  description?: string;
  defaultDuration?: number;
  audio?: "crossfade" | "cut" | "none";
  params?: Record<string, ParamDef>;
}

declare const screen: Screen;
declare const draw: Draw;
declare const ease: Record<EasingName, EasingFn>;
declare const math: MathUtils;
declare const color: ColorUtils;
declare function log(...args: any[]): void;
