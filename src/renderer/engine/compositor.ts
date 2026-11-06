import type { DrawOp, Frame } from '@shared/render-model'

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

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/**
 * Compositor WebGL2 (specs/02). Dibuja las capas de un `Frame`; es el mismo para la vista previa y,
 * más adelante, la exportación. No sabe nada de clips: solo de operaciones de dibujo.
 */
export class Compositor {
  readonly gl: WebGL2RenderingContext
  private program: WebGLProgram
  private vao: WebGLVertexArrayObject
  private loc: Record<string, WebGLUniformLocation | null> = {}
  /** Una textura por clip (varios clips pueden usar el mismo medio a la vez) */
  private textures = new Map<string, WebGLTexture>()

  constructor(readonly canvas: HTMLCanvasElement) {
    // preserveDrawingBuffer: permite capturar el cuadro (exportar frame, pruebas) sin perderlo tras el compositing.
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true, premultipliedAlpha: true })
    if (!gl) throw new Error('WebGL2 no está disponible en este equipo.')
    this.gl = gl
    this.program = this.link(VERT, FRAG)
    for (const n of ['uRes', 'uM1', 'uM2', 'uUV', 'uTex', 'uOpacity']) this.loc[n] = gl.getUniformLocation(this.program, n)
    const vao = gl.createVertexArray()
    if (!vao) throw new Error('No se pudo crear el VAO.')
    this.vao = vao
    gl.bindVertexArray(vao)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(this.program, 'aPos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
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

  /** Cambia la resolución interna del lienzo (calidad ½, ¼). */
  resize(width: number, height: number): void {
    const w = Math.max(2, Math.round(width))
    const h = Math.max(2, Math.round(height))
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w
      this.canvas.height = h
    }
  }

  private textureFor(clipId: string): WebGLTexture {
    let t = this.textures.get(clipId)
    if (!t) {
      const gl = this.gl
      t = gl.createTexture() as WebGLTexture
      gl.bindTexture(gl.TEXTURE_2D, t)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
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

  /**
   * Dibuja el frame. `source(op)` devuelve el elemento con el contenido del clip o null si todavía no
   * está listo (esa capa se omite y se conserva el resto).
   */
  draw(frame: Frame, source: (op: DrawOp) => Source | null): void {
    const gl = this.gl
    const cw = this.canvas.width
    const ch = this.canvas.height
    gl.viewport(0, 0, cw, ch)
    const [r, g, b] = hexToRgb(frame.background)
    gl.clearColor(r, g, b, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(this.program)
    gl.bindVertexArray(this.vao)
    // Las coordenadas del frame están en píxeles del proyecto; el shader normaliza con su resolución.
    gl.uniform2f(this.loc.uRes ?? null, frame.width, frame.height)
    gl.uniform1i(this.loc.uTex ?? null, 0)
    gl.activeTexture(gl.TEXTURE0)
    for (const op of frame.ops) {
      const src = source(op)
      if (!src) continue
      const tex = this.textureFor(op.clipId)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src as TexImageSource)
      } catch {
        continue // fuente aún sin datos o con origen cruzado: se omite
      }
      const m = op.matrix
      gl.uniform4f(this.loc.uM1 ?? null, m[0], m[1], m[2], m[3])
      gl.uniform2f(this.loc.uM2 ?? null, m[4], m[5])
      gl.uniform4f(this.loc.uUV ?? null, op.uv[0], op.uv[1], op.uv[2], op.uv[3])
      gl.uniform1f(this.loc.uOpacity ?? null, op.opacity)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
  }
}
