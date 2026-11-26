export interface Touch {
  x: number
  y: number
  previousX: number
  previousY: number
  force: number
  radius: number
}

const vertex = `#version 300 es
out vec2 uv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

// R = current height, G = previous height. The wave equation lets wakes
// travel, overlap and decay after a finger has left the camera frame.
const simulation = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 result;
uniform sampler2D state;
uniform vec2 texel;
uniform float aspect;
uniform vec4 touches[11];
uniform vec2 forces[11];
float segmentDistance(vec2 p, vec2 a, vec2 b) {
  vec2 v = b - a;
  float t = clamp(dot(p - a, v) / max(dot(v, v), .0000001), 0., 1.);
  return length(p - a - v * t);
}
void main() {
  vec2 h = texture(state, uv).rg;
  float neighbors = texture(state, uv + vec2(texel.x, 0)).r
    + texture(state, uv - vec2(texel.x, 0)).r
    + texture(state, uv + vec2(0, texel.y)).r
    + texture(state, uv - vec2(0, texel.y)).r;
  float next = (neighbors * .5 - h.g) * .992;
  vec2 metric = vec2(aspect, 1.);
  for (int i = 0; i < 11; ++i) {
    if (forces[i].x <= 0.) continue;
    float d = segmentDistance(uv * metric, touches[i].xy * metric, touches[i].zw * metric);
    float r = max(forces[i].y, .003);
    // A depressed contact and raised shoulder form the two sides of a wake.
    float core = exp(-d * d / (r * r));
    float shoulder = exp(-pow((d - r * 1.9) / (r * .85), 2.));
    next += (shoulder * .28 - core) * forces[i].x;
  }
  float edge = min(min(uv.x, 1. - uv.x), min(uv.y, 1. - uv.y));
  float absorption = mix(.90, 1., smoothstep(0., .045, edge));
  result = vec4(clamp(next * absorption, -.75, .75), h.r * absorption, 0., 1.);
}`

const surface = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 color;
uniform sampler2D state;
uniform sampler2D camera;
uniform vec2 texel;
uniform vec2 screen;
uniform vec2 videoSize;
uniform float time;
uniform float strength;
uniform bool live;
vec3 quietWater(vec2 p) {
  vec2 q = (p - .5) * vec2(screen.x / screen.y, 1.);
  float light = exp(-length(q - vec2(.1, .04)) * 2.);
  float caustic = sin(q.x * 19. + sin(q.y * 13. + time * .14) * 2. + time * .13)
    * sin(q.y * 17. + sin(q.x * 12. - time * .11) * 2.);
  return mix(vec3(.018, .105, .139), vec3(.115, .32, .33), light)
    + pow(max(caustic, 0.), 8.) * .018;
}
vec2 cameraUV(vec2 p) {
  float screenAspect = screen.x / screen.y;
  float videoAspect = videoSize.x / videoSize.y;
  vec2 cover = vec2(min(1., screenAspect / videoAspect), min(1., videoAspect / screenAspect));
  vec2 c = (p - .5) * cover + .5;
  // Webcam is mirrored horizontally, Y is flipped from texture to video space.
  return vec2(1. - c.x, 1. - c.y);
}
void main() {
  float l = texture(state, uv - vec2(texel.x, 0)).r;
  float r = texture(state, uv + vec2(texel.x, 0)).r;
  float b = texture(state, uv - vec2(0, texel.y)).r;
  float t = texture(state, uv + vec2(0, texel.y)).r;
  vec2 gradient = vec2(r - l, t - b);
  vec2 displaced = uv + gradient * vec2(screen.y / screen.x, 1.) * strength * .30;
  vec3 image;
  if (live) {
    vec2 source = clamp(cameraUV(displaced), vec2(.002), vec2(.998));
    // Small chromatic separation at steep wave fronts suggests real refraction.
    vec2 fringe = gradient * strength * .008;
    image = vec3(texture(camera, clamp(source + fringe, .002, .998)).r,
      texture(camera, source).g, texture(camera, clamp(source - fringe, .002, .998)).b);
  } else {
    image = quietWater(displaced);
  }
  vec3 normal = normalize(vec3(-gradient * 7., .65));
  float highlight = pow(max(dot(normal, normalize(vec3(-.4, .7, .65))), 0.), 24.);
  float crest = min(length(gradient) * 1.4, .17) * strength;
  image += vec3(.69, .94, .90) * (highlight * .20 + crest);
  image -= min(length(gradient) * .5, .07);
  color = vec4(image, 1.);
}`

type Pass = { program: WebGLProgram; uniforms: Map<string, WebGLUniformLocation> }
type Target = { texture: WebGLTexture; framebuffer: WebGLFramebuffer }

export class WaterSurface {
  private readonly gl: WebGL2RenderingContext
  private readonly step: Pass
  private readonly surface: Pass
  private readonly camera: WebGLTexture
  private readonly vao: WebGLVertexArrayObject
  private readonly positions = new Float32Array(44)
  private readonly forces = new Float32Array(22)
  private readonly noForces = new Float32Array(22)
  private targets: Target[] = []
  private current = 0
  private gridWidth = 0
  private gridHeight = 0
  private pending: Touch[] = []
  private lastTime = 0
  private accumulator = 0
  private hasCamera = false
  private lastVideoTime = -1
  private cameraWidth = 1
  private cameraHeight = 1
  strength = .75

  constructor(private readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false })
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) {
      throw new Error('이 브라우저에서 물결 효과를 실행할 수 없어요. 최신 Chrome이나 Safari에서 열어 주세요.')
    }
    this.gl = gl
    this.step = this.makePass(simulation)
    this.surface = this.makePass(surface)
    this.camera = this.texture()
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([8, 32, 40, 255]))
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    this.vao = gl.createVertexArray()!
    gl.bindVertexArray(this.vao)
    this.resize()
  }

  private makePass(fragment: string): Pass {
    const gl = this.gl
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const reason = gl.getShaderInfoLog(shader)
        gl.deleteShader(shader)
        throw new Error(`Water shader: ${reason}`)
      }
      return shader
    }
    const program = gl.createProgram()!
    const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment)
    gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program)
    gl.deleteShader(vs); gl.deleteShader(fs)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Shader link failed')
    return { program, uniforms: new Map() }
  }

  private uniform(pass: Pass, name: string) {
    let uniform = pass.uniforms.get(name)
    if (!uniform) {
      uniform = this.gl.getUniformLocation(pass.program, name)!
      pass.uniforms.set(name, uniform)
    }
    return uniform
  }

  private texture() {
    const gl = this.gl, texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return texture
  }

  resize() {
    const gl = this.gl, dpr = Math.min(devicePixelRatio || 1, 1.75)
    const width = Math.round(innerWidth * dpr), height = Math.round(innerHeight * dpr)
    if (this.canvas.width === width && this.canvas.height === height && this.targets.length) return
    this.canvas.width = width; this.canvas.height = height
    const scale = 420 / Math.max(innerWidth, innerHeight)
    this.gridWidth = Math.max(100, Math.round(innerWidth * scale))
    this.gridHeight = Math.max(100, Math.round(innerHeight * scale))
    this.targets.forEach(t => { gl.deleteTexture(t.texture); gl.deleteFramebuffer(t.framebuffer) })
    this.targets = Array.from({ length: 2 }, () => {
      const texture = this.texture(), framebuffer = gl.createFramebuffer()!
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, this.gridWidth, this.gridHeight, 0, gl.RG, gl.HALF_FLOAT, null)
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('물결 시뮬레이션을 준비하지 못했어요.')
      return { texture, framebuffer }
    })
    this.reset()
    // These uniforms change only with the render targets, not every frame.
    gl.useProgram(this.step.program)
    gl.uniform1i(this.uniform(this.step, 'state'), 0)
    gl.uniform2f(this.uniform(this.step, 'texel'), 1 / this.gridWidth, 1 / this.gridHeight)
    gl.uniform1f(this.uniform(this.step, 'aspect'), this.canvas.width / this.canvas.height)
    gl.useProgram(this.surface.program)
    gl.uniform1i(this.uniform(this.surface, 'state'), 0)
    gl.uniform1i(this.uniform(this.surface, 'camera'), 1)
    gl.uniform2f(this.uniform(this.surface, 'texel'), 1 / this.gridWidth, 1 / this.gridHeight)
    gl.uniform2f(this.uniform(this.surface, 'screen'), this.canvas.width, this.canvas.height)
  }

  reset() {
    const gl = this.gl
    gl.clearColor(0, 0, 0, 0)
    this.targets.forEach(t => { gl.bindFramebuffer(gl.FRAMEBUFFER, t.framebuffer); gl.clear(gl.COLOR_BUFFER_BIT) })
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    this.pending = []; this.accumulator = 0; this.lastTime = 0
  }

  touch(touches: Touch[]) {
    // There are at most ten tracked fingertips and one optional pointer.
    this.pending = touches.length > 11 ? touches.slice(0, 11) : touches
  }

  render(now: number, video?: HTMLVideoElement) {
    const gl = this.gl
    const elapsed = this.lastTime ? Math.min((now - this.lastTime) / 1000, .05) : 1 / 60
    this.lastTime = now; this.accumulator += elapsed
    let injected = false
    // A fixed 60 Hz solver keeps the water speed independent of display FPS.
    if (this.accumulator >= 1 / 60) {
      gl.useProgram(this.step.program)
      gl.viewport(0, 0, this.gridWidth, this.gridHeight)
      this.positions.fill(0); this.forces.fill(0)
      this.pending.forEach((p, i) => {
        const offset = i * 4
        this.positions[offset] = p.x; this.positions[offset + 1] = 1 - p.y
        this.positions[offset + 2] = p.previousX; this.positions[offset + 3] = 1 - p.previousY
        this.forces[i * 2] = p.force; this.forces[i * 2 + 1] = p.radius
      })
      gl.uniform4fv(this.uniform(this.step, 'touches[0]'), this.positions)
    }
    while (this.accumulator >= 1 / 60) {
      gl.uniform2fv(this.uniform(this.step, 'forces[0]'), injected ? this.noForces : this.forces)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.targets[this.current]!.texture)
      this.current = 1 - this.current
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.targets[this.current]!.framebuffer)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      this.accumulator -= 1 / 60; injected = true
    }
    if (injected) this.pending = []

    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.camera)
    if (video && video.readyState >= 2 && video.currentTime !== this.lastVideoTime) {
      if (this.cameraWidth !== video.videoWidth || this.cameraHeight !== video.videoHeight) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)
        this.cameraWidth = video.videoWidth; this.cameraHeight = video.videoHeight
      } else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, video)
      this.lastVideoTime = video.currentTime; this.hasCamera = true
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.useProgram(this.surface.program)
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.targets[this.current]!.texture)
    gl.uniform2f(this.uniform(this.surface, 'videoSize'), video?.videoWidth || 1280, video?.videoHeight || 720)
    gl.uniform1f(this.uniform(this.surface, 'time'), now / 1000)
    gl.uniform1f(this.uniform(this.surface, 'strength'), this.strength)
    gl.uniform1i(this.uniform(this.surface, 'live'), Number(Boolean(video) && this.hasCamera))
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  clearCamera() { this.hasCamera = false; this.lastVideoTime = -1 }

  close() {
    const gl = this.gl
    this.targets.forEach(target => { gl.deleteTexture(target.texture); gl.deleteFramebuffer(target.framebuffer) })
    this.targets = []; this.pending = []
    gl.deleteTexture(this.camera); gl.deleteVertexArray(this.vao)
    gl.deleteProgram(this.step.program); gl.deleteProgram(this.surface.program)
  }
}
