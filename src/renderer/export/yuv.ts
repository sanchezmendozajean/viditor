/**
 * Conversión RGB → YUV 4:2:0 (I420) en la GPU, con la matriz BT.709 y rango limitado, justo antes de leer los píxeles.
 * Mueve 1,5 bytes por píxel en lugar de 4 (2,7× menos datos por IPC) y evita el escalado/conversión de color en
 * la CPU del codificador. El resultado son los bytes de un frame `yuv420p` crudo (plano Y, plano U, plano V),
 * con la imagen ya del derecho (se voltean las filas de WebGL aquí).
 *
 * Los bytes se calculan en un fragment shader y se empaquetan de cuatro en cuatro en un texel RGBA8, así que la
 * lectura con `readPixels(RGBA, UNSIGNED_BYTE)` es válida en cualquier GPU y no impone alineaciones al tamaño.
 */
const VERT = `#version 300 es
void main() {
  // Triángulo que cubre toda la pantalla, sin buffers
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

const FRAG = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D src;
uniform ivec2 size;   // ancho y alto de la imagen
uniform ivec2 tex;    // ancho y alto de la textura de salida (texels de 4 bytes)
out vec4 o;

vec3 rgb(int x, int y) { return texelFetch(src, ivec2(x, size.y - 1 - y), 0).rgb; }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

float byteAt(int i) {
  int ny = size.x * size.y;
  int cw = size.x / 2;
  int nc = cw * (size.y / 2);
  if (i < ny) {
    return (16.0 + 219.0 * luma(rgb(i % size.x, i / size.x))) / 255.0;
  }
  if (i < ny + 2 * nc) {
    int j = i - ny;
    bool isV = j >= nc;
    if (isV) j -= nc;
    int cx = j % cw;
    int cy = j / cw;
    vec3 c = (rgb(2 * cx, 2 * cy) + rgb(2 * cx + 1, 2 * cy) + rgb(2 * cx, 2 * cy + 1) + rgb(2 * cx + 1, 2 * cy + 1)) * 0.25;
    float d = isV ? (c.r - luma(c)) / 1.5748 : (c.b - luma(c)) / 1.8556;
    return (128.0 + 224.0 * d) / 255.0;
  }
  return 0.0;
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  int t = (p.y * tex.x + p.x) * 4;
  o = vec4(byteAt(t), byteAt(t + 1), byteAt(t + 2), byteAt(t + 3));
}`

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const s = gl.createShader(type) as WebGLShader
  gl.shaderSource(s, source)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Shader YUV: ${gl.getShaderInfoLog(s)}`)
  return s
}

export class YuvConverter {
  /** Bytes de un frame yuv420p */
  readonly byteLength: number
  /** Bytes de la textura de salida (≥ byteLength) */
  readonly bufferLength: number
  private readonly program: WebGLProgram
  private readonly srcTex: WebGLTexture
  private readonly outTex: WebGLTexture
  private readonly fbo: WebGLFramebuffer
  private readonly vao: WebGLVertexArrayObject
  private readonly texW: number
  private readonly texH: number

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly width: number,
    private readonly height: number
  ) {
    if (width % 2 || height % 2) throw new Error('El tamaño de salida debe ser par para YUV 4:2:0.')
    this.byteLength = (width * height * 3) / 2
    const texels = Math.ceil(this.byteLength / 4)
    this.texW = Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number)
    this.texH = Math.ceil(texels / this.texW)
    this.bufferLength = this.texW * this.texH * 4

    const prog = gl.createProgram() as WebGLProgram
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`Programa YUV: ${gl.getProgramInfoLog(prog)}`)
    this.program = prog

    // El lienzo no tiene alfa: copyTexSubImage2D solo admite texturas con los mismos componentes (RGB8), no RGBA8
    const tex = (w: number, h: number, format: number = gl.RGBA8): WebGLTexture => {
      const t = gl.createTexture() as WebGLTexture
      gl.bindTexture(gl.TEXTURE_2D, t)
      gl.texStorage2D(gl.TEXTURE_2D, 1, format, w, h)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      return t
    }
    this.srcTex = tex(width, height, gl.RGB8)
    this.outTex = tex(this.texW, this.texH)
    this.fbo = gl.createFramebuffer() as WebGLFramebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.outTex, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.bindTexture(gl.TEXTURE_2D, null)
    this.vao = gl.createVertexArray() as WebGLVertexArrayObject
  }

  /**
   * Convierte lo que hay ahora en el framebuffer por defecto (el frame recién compuesto) y deja el resultado en el
   * framebuffer de salida, listo para `readPixels` tras `bindOutput()`.
   */
  convert(): void {
    const gl = this.gl
    const blend = gl.isEnabled(gl.BLEND)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.activeTexture(gl.TEXTURE7)
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex)
    gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, this.width, this.height)

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
    gl.viewport(0, 0, this.texW, this.texH)
    gl.disable(gl.BLEND)
    gl.useProgram(this.program)
    gl.uniform1i(gl.getUniformLocation(this.program, 'src'), 7)
    gl.uniform2i(gl.getUniformLocation(this.program, 'size'), this.width, this.height)
    gl.uniform2i(gl.getUniformLocation(this.program, 'tex'), this.texW, this.texH)
    gl.bindVertexArray(this.vao)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // Se deja el estado como lo espera el compositor
    gl.bindVertexArray(null)
    if (blend) gl.enable(gl.BLEND)
    gl.bindTexture(gl.TEXTURE_2D, null)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.width, this.height)
  }

  /** Inicia la lectura asíncrona del resultado hacia el PBO que esté enlazado en PIXEL_PACK_BUFFER. */
  readInto(): void {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
    gl.readPixels(0, 0, this.texW, this.texH, gl.RGBA, gl.UNSIGNED_BYTE, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }
}
