import { clamp, ease } from './geometry.ts'
import { boCameraUV } from './boMorph.ts'
import type { TrackingFrame } from './tracking.ts'
import type { CameraLayer } from './personLayers.ts'

type CameraRect = CameraLayer['rect']

export interface BoVideoFace { x: number; y: number; width: number; height: number }
export function boVideoFace(frame: TrackingFrame): BoVideoFace {
  const f = frame.face, top = f[10]!, chin = f[152]!, a = f[234]!, b = f[454]!
  return { x: (top.x + chin.x) / 2, y: (top.y + chin.y) / 2,
    width: Math.max(.035, Math.abs(b.x - a.x)), height: Math.max(.045, Math.abs(chin.y - top.y)) }
}
const vertex = `
attribute vec2 a_uv;
varying vec2 v_uv;
void main(){v_uv=a_uv;gl_Position=vec4(a_uv.x*2.0-1.0,1.0-a_uv.y*2.0,0.0,1.0);}`
const fragment = `
precision mediump float;
uniform sampler2D u_camera;
uniform vec2 u_size;
uniform vec2 u_pixel;
uniform vec4 u_rect;
uniform vec4 u_face;
uniform vec3 u_effect;
varying vec2 v_uv;
float luma(vec3 color){return dot(color,vec3(.2126,.7152,.0722));}
void main(){
 vec2 local=(v_uv*u_size-u_rect.xy)/u_rect.zw;
 if(local.x<0.0||local.y<0.0||local.x>1.0||local.y>1.0){gl_FragColor=vec4(0.0);return;}
 vec2 uv=vec2(1.0-local.x,local.y);
 vec2 q=(uv-u_face.xy)/u_face.zw;
 float cheek=exp(-((abs(q.x)-.28)*(abs(q.x)-.28)/.065+(q.y-.16)*(q.y-.16)/.13))
  *(1.0-smoothstep(.44,.72,abs(q.x)));
 uv.x=u_face.x+(uv.x-u_face.x)/(1.0+u_effect.y*cheek);
 vec3 color=texture2D(u_camera,uv).rgb;
 float mask=1.0-smoothstep(.43,.63,length(q));
 color=mix(color,vec3(.92,.19,.17),u_effect.x*cheek*.33);
 float levels=mix(30.0,7.0,u_effect.z);
 vec3 flat=floor(color*levels+.5)/levels;
 float dx=luma(texture2D(u_camera,uv+vec2(u_pixel.x,0.0)).rgb)-luma(texture2D(u_camera,uv-vec2(u_pixel.x,0.0)).rgb);
 float dy=luma(texture2D(u_camera,uv+vec2(0.0,u_pixel.y)).rgb)-luma(texture2D(u_camera,uv-vec2(0.0,u_pixel.y)).rgb);
 flat*=1.0-min(.35,length(vec2(dx,dy))*2.1)*u_effect.z;
 color=mix(color,flat,u_effect.z*mask);
 gl_FragColor=vec4(color,1.0);
}`

/** Changes the user's own pixels before the whole live scene dissolves into the drawn character. */
export class BoVideo {
  private canvas?: HTMLCanvasElement
  private gl?: WebGLRenderingContext
  private program?: WebGLProgram
  private texture?: WebGLTexture
  private buffer?: WebGLBuffer
  private source?: CanvasImageSource
  private sourceTimestamp?: number
  private fallback = false
  private stamp = ''
  private locations = new Map<string, WebGLUniformLocation | null>()

  private initialize() {
    if (this.canvas) return
    this.canvas = document.createElement('canvas')
    const gl = this.fallback ? null : this.canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false })
    if (gl) {
      try {
        this.gl = gl
        const program = gl.createProgram()
        if (!program) throw new Error('Bo video program')
        this.program = program
        for (const [type, code] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
          const shader = gl.createShader(type)
          if (!shader) throw new Error('Bo video shader')
          gl.shaderSource(shader, code); gl.compileShader(shader)
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); throw new Error('Bo video compilation') }
          gl.attachShader(program, shader); gl.deleteShader(shader)
        }
        gl.linkProgram(program)
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Bo video linking')
        gl.useProgram(program)
        this.buffer = gl.createBuffer() ?? undefined
        this.texture = gl.createTexture() ?? undefined
        if (!this.buffer || !this.texture) throw new Error('Bo video resources')
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW)
        const attribute = gl.getAttribLocation(program, 'a_uv')
        gl.enableVertexAttribArray(attribute); gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 0, 0)
        gl.bindTexture(gl.TEXTURE_2D, this.texture)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        for (const name of ['u_size', 'u_rect', 'u_face', 'u_effect', 'u_pixel', 'u_camera']) this.locations.set(name, gl.getUniformLocation(program, name))
        gl.uniform1i(this.locations.get('u_camera')!, 0)
        this.canvas.addEventListener('webglcontextlost', this.lost)
        return
      } catch { this.release() }
    }
    this.fallback = true; this.canvas = document.createElement('canvas')
  }
  private lost = (event: Event) => { event.preventDefault(); this.release(); this.fallback = true }

  draw(c: CanvasRenderingContext2D, source: CanvasImageSource, frame: TrackingFrame, rect: CameraRect,
    w: number, h: number, ratio: number, effect: { blush: number; puff: number; flatten: number }) {
    this.initialize()
    const canvas = this.canvas!, gl = this.gl, face = boVideoFace(frame)
    if (gl && this.program && this.texture) {
      const width = Math.max(1, Math.round(w * Math.min(1.5, ratio))), height = Math.max(1, Math.round(h * Math.min(1.5, ratio)))
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
      gl.viewport(0, 0, width, height); gl.useProgram(this.program); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT)
      gl.uniform2f(this.locations.get('u_size')!, w, h)
      gl.uniform4f(this.locations.get('u_rect')!, rect.x, rect.y, rect.width, rect.height)
      gl.uniform4f(this.locations.get('u_face')!, face.x, face.y, face.width, face.height)
      gl.uniform3f(this.locations.get('u_effect')!, effect.blush, effect.puff, effect.flatten)
      gl.uniform2f(this.locations.get('u_pixel')!, 1 / frame.width, 1 / frame.height)
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texture)
      if (this.source !== source || this.sourceTimestamp !== frame.timestamp) {
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource)
        this.source = source; this.sourceTimestamp = frame.timestamp
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      c.drawImage(canvas, 0, 0, w, h)
    } else {
      this.drawFallback(source, frame, face, effect)
      c.save(); c.translate(rect.x + rect.width, rect.y); c.scale(-1, 1); c.drawImage(canvas, 0, 0, rect.width, rect.height); c.restore()
    }
  }

  private drawFallback(source: CanvasImageSource, frame: TrackingFrame, face: BoVideoFace, effect: { blush: number; puff: number; flatten: number }) {
    const key = `${Math.round(effect.blush * 40)}:${Math.round(effect.puff * 40)}:${Math.round(effect.flatten * 40)}`
    if (this.source === source && this.sourceTimestamp === frame.timestamp && key === this.stamp) return
    const canvas = this.canvas!, scale = Math.min(1, 480 / Math.max(frame.width, frame.height))
    const width = Math.max(1, Math.round(frame.width * scale)), height = Math.max(1, Math.round(frame.height * scale))
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
    const c = canvas.getContext('2d', { willReadFrequently: true })!
    c.drawImage(source, 0, 0, width, height)
    try {
      const image = c.getImageData(0, 0, width, height), original = image.data.slice(), out = image.data
      const left = Math.max(0, Math.floor((face.x - face.width * .8) * width)), right = Math.min(width, Math.ceil((face.x + face.width * .8) * width))
      const top = Math.max(0, Math.floor((face.y - face.height * .7) * height)), bottom = Math.min(height, Math.ceil((face.y + face.height * .7) * height))
      const levels = 30 - effect.flatten * 23
      for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
        const u = x / width, v = y / height, qx = (u - face.x) / face.width, qy = (v - face.y) / face.height
        const uv = boCameraUV(u, v, face, effect.puff), sx = Math.round(uv.u * (width - 1)), sy = Math.round(uv.v * (height - 1))
        const from = (sy * width + sx) * 4, to = (y * width + x) * 4
        const cheek = Math.exp(-((Math.abs(qx) - .28) ** 2 / .065 + (qy - .16) ** 2 / .13))
        const mask = 1 - ease((Math.hypot(qx, qy) - .43) / .20)
        for (let channel = 0; channel < 3; channel++) {
          const sourceColor = original[from + channel]! / 255, red = [.92, .19, .17][channel]!
          const color = sourceColor + (red - sourceColor) * effect.blush * cheek * .33
          const flat = Math.floor(color * levels + .5) / levels
          out[to + channel] = clamp(color + (flat - color) * effect.flatten * mask) * 255
        }
      }
      c.putImageData(image, 0, 0)
    } catch { /* The live camera and full-scene dissolve remain available if readback is blocked. */ }
    this.source = source; this.sourceTimestamp = frame.timestamp; this.stamp = key
  }
  clear() {
    this.source = this.sourceTimestamp = undefined; this.stamp = ''
    if (this.gl && this.texture) {
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture)
      this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, 1, 1, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, new Uint8Array(4))
    }
    if (this.canvas) this.canvas.width = this.canvas.height = 1
  }
  private release() {
    this.canvas?.removeEventListener('webglcontextlost', this.lost)
    const gl = this.gl
    if (gl) { if (this.buffer) gl.deleteBuffer(this.buffer); if (this.texture) gl.deleteTexture(this.texture); if (this.program) gl.deleteProgram(this.program) }
    this.gl = this.program = this.texture = this.buffer = undefined
    this.locations.clear(); this.canvas = undefined; this.source = this.sourceTimestamp = undefined
  }
  close() { this.release() }
}
