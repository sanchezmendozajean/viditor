import type { DrawOp, Frame, TransitionOp } from '@shared/render-model'
import type { DisplayItem, DisplayList, Filters, LayerItem, Mat, MaskItem, ShapeItem } from '@shared/display-list'
import { parseColor } from '../../transition-runtime/colors'
import { rasterizeShape } from './shape-raster'

export type Source = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | ImageBitmap

const VERT = `#version 300 es
in vec2 aPos;
uniform vec2 uRes;
uniform vec4 uM1;   // a, b, c, d
uniform vec2 uM2;   // e, f
uniform vec4 uUV;   // u0, v0, u1, v1
out vec2 vUV;
void main() {
  vec2 p = vec2(uM1.x * aPos.x + uM1.z * aPos.y + uM2.x, uM1.y * aPos.x + uM1.w * aPos.y + uM2.y);
  vec2 clip = vec2(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
  vUV = vec2(mix(uUV.x, uUV.z, aPos.x), mix(uUV.y, uUV.w, aPos.y));
}`

const FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform float uOpacity;
out vec4 outColor;
void main() {
  vec4 c = texture(uTex, vUV);
  outColor = c * uOpacity; // premultiplicado
}`

/** Capas de una transición: textura con filtros (brillo, contraste, desenfoque…), máscara alfa y color sólido. */
const LAYER_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform sampler2D uMask;
uniform float uOpacity;
uniform float uFlipY;      // 1 = textura de un FBO (origen abajo)
uniform vec2 uProj;        // tamaño del proyecto (px)
uniform vec2 uCanvas;      // tamaño del lienzo (px)
uniform float uUseMask;
uniform vec4 uMaskRect;    // rectángulo que cubre la máscara en px del lienzo (origen arriba-izquierda)
uniform float uMaskInvert;
uniform vec4 uF1;          // brillo, contraste, saturación, escala de grises
uniform vec4 uF2;          // inversión, sepia, desenfoque (px proyecto), pixelado (px proyecto)
uniform vec4 uTint;        // rgb, cantidad
uniform float uSolidMode;
uniform vec4 uSolid;       // color sólido premultiplicado
out vec4 outColor;

vec4 fetch(vec2 uv) {
  uv.y = mix(uv.y, 1.0 - uv.y, uFlipY);
  return texture(uTex, uv);
}

void main() {
  vec2 uv = vUV;
  if (uF2.w > 1.0) {
    vec2 sp = uv * uProj;
    sp = (floor(sp / uF2.w) + 0.5) * uF2.w;
    uv = sp / uProj;
  }
  vec4 c;
  if (uSolidMode > 0.5) {
    c = uSolid;
  } else if (uF2.z > 0.4) {
    c = vec4(0.0);
    const int N = 24;
    for (int i = 0; i < N; i++) {
      float r = sqrt((float(i) + 0.5) / float(N)) * uF2.z;
      float a = float(i) * 2.399963;
      c += fetch(uv + vec2(cos(a), sin(a)) * r / uProj);
    }
    c /= float(N);
  } else {
    c = fetch(uv);
  }
  float a = c.a;
  vec3 rgb = a > 0.0001 ? c.rgb / a : vec3(0.0);
  rgb *= uF1.x;
  rgb = (rgb - 0.5) * uF1.y + 0.5;
  float g = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  rgb = mix(vec3(g), rgb, uF1.z);
  rgb = mix(rgb, vec3(dot(rgb, vec3(0.2126, 0.7152, 0.0722))), uF1.w);
  rgb = mix(rgb, 1.0 - rgb, uF2.x);
  vec3 sep = vec3(dot(rgb, vec3(0.393, 0.769, 0.189)), dot(rgb, vec3(0.349, 0.686, 0.168)), dot(rgb, vec3(0.272, 0.534, 0.131)));
  rgb = mix(rgb, min(sep, 1.0), uF2.y);
  rgb = mix(rgb, uTint.rgb, uTint.a);
  rgb = clamp(rgb, 0.0, 1.0);
  c = vec4(rgb * a, a) * uOpacity;
  if (uUseMask > 0.5) {
    vec2 cp = vec2(gl_FragCoord.x, uCanvas.y - gl_FragCoord.y);
    float m = texture(uMask, (cp - uMaskRect.xy) / uMaskRect.zw).r;
    if (uMaskInvert > 0.5) m = 1.0 - m;
    c *= m;
  }
  outColor = c;
}`

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

const mulMat = (a: Mat, b: Mat): Mat => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5]
]

interface Target {
  fbo: WebGLFramebuffer
  tex: WebGLTexture
  w: number
  h: number
}

type Locs = Record<string, WebGLUniformLocation | null>

/** Función que entrega la display list de una transición (o null si no está lista / falló). */
export type TransitionProvider = (op: TransitionOp) => DisplayList | null

/**
 * Compositor WebGL2 (specs/02). Dibuja las capas de un `Frame`; es el mismo para la vista previa y la exportación.
 * No sabe de clips ni de archivos de transición: solo de operaciones de dibujo y display lists.
 */
export class Compositor {
  readonly gl: WebGL2RenderingContext
  private clipProg: WebGLProgram
  private layerProg: WebGLProgram
  private clipLoc: Locs = {}
  private layerLoc: Locs = {}
  private vao: WebGLVertexArrayObject
  /** Una textura por clip (varios clips pueden usar el mismo medio a la vez) */
  private textures = new Map<string, WebGLTexture>()
  private targets: { leave: Target | null; enter: Target | null } = { leave: null, enter: null }
  private shapeCanvas: HTMLCanvasElement
  private shapeTex: WebGLTexture
  private maskCanvas: HTMLCanvasElement
  private maskTextures: WebGLTexture[] = []
  private emptyTex: WebGLTexture
  private frameW = 1920
  private frameH = 1080

  constructor(readonly canvas: HTMLCanvasElement) {
    // preserveDrawingBuffer: permite capturar el cuadro (exportar frame, pruebas) sin perderlo tras el compositing.
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true, premultipliedAlpha: true })
    if (!gl) throw new Error('WebGL2 no está disponible en este equipo.')
    this.gl = gl
    this.clipProg = this.link(VERT, FRAG)
    this.layerProg = this.link(VERT, LAYER_FRAG)
    for (const n of ['uRes', 'uM1', 'uM2', 'uUV', 'uTex', 'uOpacity']) this.clipLoc[n] = gl.getUniformLocation(this.clipProg, n)
    for (const n of ['uRes', 'uM1', 'uM2', 'uUV', 'uTex', 'uMask', 'uOpacity', 'uFlipY', 'uProj', 'uCanvas', 'uUseMask', 'uMaskRect', 'uMaskInvert', 'uF1', 'uF2', 'uTint', 'uSolidMode', 'uSolid']) {
      this.layerLoc[n] = gl.getUniformLocation(this.layerProg, n)
    }
    const vao = gl.createVertexArray()
    if (!vao) throw new Error('No se pudo crear el VAO.')
    this.vao = vao
    gl.bindVertexArray(vao)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW)
    for (const p of [this.clipProg, this.layerProg]) {
      const aPos = gl.getAttribLocation(p, 'aPos')
      gl.enableVertexAttribArray(aPos)
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
    }
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    this.shapeCanvas = document.createElement('canvas')
    this.maskCanvas = document.createElement('canvas')
    this.shapeTex = this.newTexture()
    this.emptyTex = this.newTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.emptyTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]))
  }

  private link(vs: string, fs: string): WebGLProgram {
    const gl = this.gl
    const compile = (type: number, src: string): WebGLShader => {
      const sh = gl.createShader(type)
      if (!sh) throw new Error('No se pudo crear el shader.')
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'Error de shader')
      return sh
    }
    const p = gl.createProgram()
    if (!p) throw new Error('No se pudo crear el programa.')
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs))
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs))
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'Error de enlace')
    return p
  }

  private newTexture(): WebGLTexture {
    const gl = this.gl
    const t = gl.createTexture() as WebGLTexture
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return t
  }

  /** Cambia la resolución interna del lienzo (calidad ½, ¼). */
  resize(width: number, height: number): void {
    const w = Math.max(2, Math.round(width))
    const h = Math.max(2, Math.round(height))
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
      this.disposeTargets()
    }
  }

  private disposeTargets(): void {
    for (const k of ['leave', 'enter'] as const) {
      const t = this.targets[k]
      if (t) {
        this.gl.deleteFramebuffer(t.fbo)
        this.gl.deleteTexture(t.tex)
        this.targets[k] = null
      }
    }
  }

  private target(k: 'leave' | 'enter'): Target {
    const have = this.targets[k]
    if (have && have.w === this.canvas.width && have.h === this.canvas.height) return have
    const gl = this.gl
    const w = this.canvas.width
    const h = this.canvas.height
    const tex = this.newTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    const fbo = gl.createFramebuffer() as WebGLFramebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    const t = { fbo, tex, w, h }
    this.targets[k] = t
    return t
  }

  private textureFor(clipId: string): WebGLTexture {
    let t = this.textures.get(clipId)
    if (!t) {
      t = this.newTexture()
      this.textures.set(clipId, t)
    }
    return t
  }

  /** Libera las texturas de clips que ya no están en uso. */
  prune(keep: Set<string>): void {
    for (const [id, t] of this.textures) {
      if (!keep.has(id)) {
        this.gl.deleteTexture(t)
        this.textures.delete(id)
      }
    }
  }

  // ───────── Dibujo de clips ─────────

  private drawClipOp(op: DrawOp, src: Source): void {
    const gl = this.gl
    const tex = this.textureFor(op.clipId)
    gl.useProgram(this.clipProg)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src as TexImageSource)
    } catch {
      return // fuente aún sin datos o con origen cruzado: se omite
    }
    gl.uniform2f(this.clipLoc.uRes ?? null, this.frameW, this.frameH)
    gl.uniform1i(this.clipLoc.uTex ?? null, 0)
    const m = op.matrix
    gl.uniform4f(this.clipLoc.uM1 ?? null, m[0], m[1], m[2], m[3])
    gl.uniform2f(this.clipLoc.uM2 ?? null, m[4], m[5])
    gl.uniform4f(this.clipLoc.uUV ?? null, op.uv[0], op.uv[1], op.uv[2], op.uv[3])
    gl.uniform1f(this.clipLoc.uOpacity ?? null, op.opacity)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  /**
   * Dibuja el frame. `source(op)` devuelve el elemento con el contenido del clip o null si todavía no
   * está listo (esa capa se omite y se conserva el resto). `transition(op)` entrega la display list de
   * una transición; si devuelve null se dibuja un corte seco (saliente antes de la mitad, entrante después).
   */
  draw(frame: Frame, source: (op: DrawOp) => Source | null, transition?: TransitionProvider): void {
    const gl = this.gl
    this.frameW = frame.width
    this.frameH = frame.height
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    const [r, g, b] = hexToRgb(frame.background)
    gl.clearColor(r, g, b, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.bindVertexArray(this.vao)
    for (const op of frame.ops) {
      if (op.kind === 'transition') {
        const dl = transition?.(op) ?? null
        if (dl) this.drawTransition(op, dl, source)
        else {
          const cut = op.progress < 0.5 ? op.leave : op.enter
          const src = cut ? source(cut) : null
          if (cut && src) this.drawClipOp(cut, src)
        }
      } else {
        const src = source(op)
        if (src) this.drawClipOp(op, src)
      }
    }
  }

  // ───────── Transiciones ─────────

  private renderLayer(k: 'leave' | 'enter', op: DrawOp | null, source: (op: DrawOp) => Source | null): void {
    const gl = this.gl
    const t = this.target(k)
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo)
    gl.viewport(0, 0, t.w, t.h)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    const src = op ? source(op) : null
    if (op && src) this.drawClipOp(op, src)
  }

  private drawTransition(op: TransitionOp, dl: DisplayList, source: (op: DrawOp) => Source | null): void {
    const gl = this.gl
    this.renderLayer('leave', op.leave, source)
    this.renderLayer('enter', op.enter, source)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)

    const masks = new Map<string, { tex: WebGLTexture; margin: number }>()
    dl.masks.forEach((m, i) => masks.set(m.id, this.rasterizeMask(m, i)))
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.useProgram(this.layerProg)

    for (const item of dl.items) {
      if (item.kind === 'layer') this.drawLayerItem(item, masks)
      else this.drawShapeItem(item)
    }
  }

  private setFilters(f: Filters): void {
    const gl = this.gl
    const L = this.layerLoc
    gl.uniform4f(L.uF1 ?? null, f.brightness ?? 1, f.contrast ?? 1, f.saturation ?? 1, f.grayscale ?? 0)
    gl.uniform4f(L.uF2 ?? null, f.invert ?? 0, f.sepia ?? 0, f.blur ?? 0, f.pixelate ?? 0)
    if (f.tint) gl.uniform4f(L.uTint ?? null, f.tint.color.r / 255, f.tint.color.g / 255, f.tint.color.b / 255, f.tint.amount)
    else gl.uniform4f(L.uTint ?? null, 0, 0, 0, 0)
  }

  private beginLayerDraw(matrix: Mat, uv: [number, number, number, number], opacity: number, flipY: boolean, tex: WebGLTexture): void {
    const gl = this.gl
    const L = this.layerLoc
    gl.useProgram(this.layerProg)
    gl.uniform2f(L.uRes ?? null, this.frameW, this.frameH)
    gl.uniform2f(L.uProj ?? null, this.frameW, this.frameH)
    gl.uniform2f(L.uCanvas ?? null, this.canvas.width, this.canvas.height)
    gl.uniform4f(L.uM1 ?? null, matrix[0], matrix[1], matrix[2], matrix[3])
    gl.uniform2f(L.uM2 ?? null, matrix[4], matrix[5])
    gl.uniform4f(L.uUV ?? null, uv[0], uv[1], uv[2], uv[3])
    gl.uniform1f(L.uOpacity ?? null, opacity)
    gl.uniform1f(L.uFlipY ?? null, flipY ? 1 : 0)
    gl.uniform1i(L.uTex ?? null, 0)
    gl.uniform1i(L.uMask ?? null, 1)
    gl.uniform1f(L.uSolidMode ?? null, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex)
  }

  private drawLayerItem(item: LayerItem, masks: Map<string, { tex: WebGLTexture; margin: number }>): void {
    const gl = this.gl
    const L = this.layerLoc
    const t = this.targets[item.source]
    if (!t) return
    const W = this.frameW
    const H = this.frameH
    const r = item.rect ?? { x: 0, y: 0, w: W, h: H }
    const quad = mulMat(item.matrix, [r.w, 0, 0, r.h, r.x, r.y])
    this.beginLayerDraw(quad, [r.x / W, r.y / H, (r.x + r.w) / W, (r.y + r.h) / H], item.opacity, true, t.tex)
    this.setFilters(item.filters)
    this.bindMask(item.mask ? masks.get(item.mask) : undefined, item.mask ? this.maskInvert.get(item.mask) === true : false, L)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  private maskInvert = new Map<string, boolean>()

  private bindMask(m: { tex: WebGLTexture; margin: number } | undefined, invert: boolean, L: Locs): void {
    const gl = this.gl
    if (!m) {
      gl.uniform1f(L.uUseMask ?? null, 0)
      return
    }
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, m.tex)
    gl.activeTexture(gl.TEXTURE0)
    const cw = this.canvas.width
    const ch = this.canvas.height
    gl.uniform1f(L.uUseMask ?? null, 1)
    gl.uniform1f(L.uMaskInvert ?? null, invert ? 1 : 0)
    gl.uniform4f(L.uMaskRect ?? null, -m.margin, -m.margin, cw + 2 * m.margin, ch + 2 * m.margin)
  }

  /** Rasteriza la figura de una máscara en una textura (con margen para que el suavizado no se corte en los bordes). */
  private rasterizeMask(m: MaskItem, index: number): { tex: WebGLTexture; margin: number } {
    const gl = this.gl
    const cw = this.canvas.width
    const ch = this.canvas.height
    const scale = cw / this.frameW
    const sigma = (m.feather * scale) / 2
    const margin = m.feather > 0 ? Math.ceil(sigma * 3) + 2 : 0
    const c = this.maskCanvas
    c.width = cw + 2 * margin
    c.height = ch + 2 * margin
    const ctx = c.getContext('2d') as CanvasRenderingContext2D
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.filter = sigma > 0.3 ? `blur(${sigma}px)` : 'none'
    const style = { fill: 'rgb(255,255,255)', ...m.style }
    rasterizeShape(ctx, m.geometry, style, m.matrix, scale, { width: this.frameW, height: this.frameH }, { offsetX: margin, offsetY: margin })
    ctx.filter = 'none'
    let tex = this.maskTextures[index]
    if (!tex) {
      tex = this.newTexture()
      this.maskTextures[index] = tex
    }
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.activeTexture(gl.TEXTURE0)
    this.maskInvert.set(m.id, m.invert)
    return { tex, margin }
  }

  private drawShapeItem(item: ShapeItem): void {
    const gl = this.gl
    const L = this.layerLoc
    const W = this.frameW
    const H = this.frameH
    const solid = item.geometry.type === 'fill' && item.style.fill && !item.style.gradient
    if (solid) {
      // Relleno liso de toda la pantalla: no hace falta lienzo 2D
      const c = parseColor(item.style.fill)
      const a = c.a * (item.style.opacity ?? 1)
      const quad = mulMat(item.matrix, [W, 0, 0, H, 0, 0])
      this.beginLayerDraw(quad, [0, 0, 1, 1], item.opacity, false, this.emptyTex)
      this.setFilters({})
      gl.uniform1f(L.uUseMask ?? null, 0)
      gl.uniform1f(L.uSolidMode ?? null, 1)
      gl.uniform4f(L.uSolid ?? null, (c.r / 255) * a, (c.g / 255) * a, (c.b / 255) * a, a)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      return
    }
    const cw = this.canvas.width
    const ch = this.canvas.height
    const c = this.shapeCanvas
    if (c.width !== cw || c.height !== ch) {
      c.width = cw
      c.height = ch
    }
    const ctx = c.getContext('2d') as CanvasRenderingContext2D
    ctx.clearRect(0, 0, cw, ch)
    rasterizeShape(ctx, item.geometry, item.style, item.matrix, cw / W, { width: W, height: H })
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.shapeTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c)
    // La figura ya viene transformada: el cuadro es la pantalla completa
    this.beginLayerDraw([W, 0, 0, H, 0, 0], [0, 0, 1, 1], item.opacity, false, this.shapeTex)
    this.setFilters({})
    gl.uniform1f(L.uUseMask ?? null, 0)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
}

export type { DisplayItem }
