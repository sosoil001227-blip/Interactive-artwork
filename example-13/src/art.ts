import { partMotion } from './animation.ts'
import type { MaskState } from './animation.ts'
import { centerOf, clamp, cross, ease, sub, unit } from './geometry.ts'
import type { Vec3 } from './geometry.ts'
import { resolveRig, sampleFrame } from './rig.ts'
import type { MaskKind, Material, ResolvedPart, ResolvedSurface } from './rig.ts'
import type { TrackingFrame } from './tracking.ts'
import { laserTarget } from './laser.ts'
import type { Pixel } from './laser.ts'
import { GoldCascade, MouthGesture } from './spirit.ts'
import { drawCompanions } from './companions.ts'
import { HandGesture } from './handGesture.ts'
import { GauntletEffects } from './gauntlet.ts'
import { MarioWorld } from './mario.ts'
import { ConanWorld } from './conan.ts'
import { ShinchanWorld } from './shinchan.ts'
import type { CrayonTool } from './shinchanGesture.ts'
import { CoralineWorld } from './coraline.ts'
import { BoWorld } from './bo.ts'

const finishes: Record<Exclude<Material, 'light'>, readonly string[]> = {
  rim: ['#50322f', '#2b1517', '#150c0d', '#41201c', '#130b0c'],
  gold: ['#f5df9b', '#ac843d', '#d4ae56', '#ffe5a1', '#6a4b23'],
  'gold-bevel': ['#fff2b3', '#bc9453', '#785726', '#e8c476', '#5e401c'],
  red: ['#ac5050', '#791b25', '#4b141d', '#933836', '#36151b'],
  'red-bevel': ['#d27764', '#8f3b35', '#5c1f23', '#bf5a4f', '#48201e'],
  seal: ['#372924', '#21181a', '#101215', '#3c2d25', '#171519'],
  etched: ['#46302c', '#2d1b1a', '#170f10', '#50302a', '#1e1112'],
  hood: ['#10101d', '#14111e', '#09080f', '#15111d', '#07070c'],
  porcelain: ['#fff8de', '#f4ead3', '#fff8e5', '#eee4ce', '#d8cdbc'],
  violet: ['#ae91ac', '#a083a1', '#927690', '#a689a6', '#876c8c'],
  ink: ['#282037', '#221a2a', '#171420', '#292236', '#13111a'],
  mouth: ['#261b2b', '#1a1422', '#0d0a13', '#241728', '#120d15'],
}
const stops = [0, .30, .56, .74, 1]
type Projection = (point: Vec3) => Vec3

function path(ctx: CanvasRenderingContext2D, points: Vec3[]) {
  ctx.beginPath()
  points.forEach((point, i) => i ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y))
  ctx.closePath()
}

export class MaskScene {
  private ctx: CanvasRenderingContext2D
  private width = 1
  private height = 1
  private ratio = 1
  private observer: ResizeObserver
  private preview = resolveRig(sampleFrame)
  private tracked: ResolvedPart[] = []
  private frame?: TrackingFrame
  private image?: ImageBitmap
  private received = -Infinity
  private imageReceived = -Infinity
  private imageTimestamp?: number
  private litCamera = document.createElement('canvas')
  private litSource?: CanvasImageSource
  private litTime?: number
  private paper = document.createElement('canvas')
  private live = false
  private kind: MaskKind = 'iron-man'
  private mouth = new MouthGesture()
  private gold = new GoldCascade()
  private hands = new HandGesture()
  private gauntlets = new GauntletEffects()
  private mario = new MarioWorld()
  private conan = new ConanWorld()
  private shinchan = new ShinchanWorld()
  private coraline = new CoralineWorld()
  private bo = new BoWorld()
  private lastDraw = 0
  private spiritStart?: number

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(canvas)
    this.resize()
  }

  setLive(live: boolean) {
    if (!live) this.mario.sound.silence()
    if (!live) this.conan.narration.silence()
    this.live = live
    this.invalidate()
  }

  select(kind: MaskKind) {
    if (kind === this.kind) return
    this.kind = kind
    if (kind !== 'mario') this.mario.sound.silence()
    if (kind !== 'conan') this.conan.narration.silence()
    this.invalidate()
    this.spiritStart = undefined
    this.preview = resolveRig(sampleFrame, kind)
    this.resize()
  }

  clearEffects(preserveExperience = false) { this.gold.clear(); this.mouth.reset(); this.clearHands(); if (!preserveExperience) { this.shinchan.reset(); this.coraline.reset(); this.bo.reset() } this.lastDraw = 0 }

  clearHands() { this.hands.clear(); this.gauntlets.clear(); this.mario.reset(); this.conan.reset(); this.shinchan.clearTracking(); this.coraline.clearTracking(); this.bo.clearTracking() }

  updateHands(frame: TrackingFrame, now: number, reduced: boolean) {
    if (this.kind === 'mario') this.mario.update(frame, now, reduced, this.imageTimestamp === frame.timestamp ? this.image : undefined)
    else if (this.kind === 'conan') this.conan.update(frame, now)
    else if (this.kind === 'shinchan') this.shinchan.update(frame, now)
    else this.hands.update(frame, now, reduced, this.image)
  }

  handStatus(now: number) { return this.hands.status(now) }

  marioStatus(now: number) { return this.mario.status(now) }
  demoMario(now: number, reduced: boolean) { this.mario.demo(now, reduced) }
  conanStatus(now: number) { return this.conan.status(now) }
  demoConan(now: number) { this.conan.demo(now) }
  triggerConan(now:number) {this.conan.trigger(now)}
  shinchanStatus(now: number) { return this.shinchan.status(now) }
  demoShinchan() { this.shinchan.demo() }
  selectCrayon(tool: CrayonTool) { this.shinchan.selectTool(tool) }
  clearShinchanDrawing() { this.shinchan.clearDrawing() }
  updateCoraline(frame: TrackingFrame, now: number) { this.coraline.update(frame, now) }
  coralineStatus(now: number) { return this.coraline.status(now) }
  demoCoraline(now: number) { this.coraline.demo(now) }
  updateBo(frame: TrackingFrame, now: number) { this.bo.update(frame, now) }
  boStatus(now: number) { return this.bo.status(now) }
  demoBo() { this.bo.demo() }
  unlockAudio() { if (this.kind === 'mario') this.mario.sound.unlock(); if (this.kind === 'conan') this.conan.narration.unlock() }
  silenceAudio() { this.mario.sound.silence(); this.conan.narration.silence() }
  toggleSound() { return this.kind === 'conan' ? this.conan.narration.toggle() : this.mario.sound.toggle() }
  soundEnabled() { return this.kind === 'conan' ? this.conan.narration.enabled : this.mario.sound.enabled }

  invalidate(preserveExperience = false) {
    this.image?.close()
    this.image = this.frame = undefined
    this.tracked = []
    this.received = -Infinity
    this.imageReceived = -Infinity
    this.imageTimestamp = undefined
    this.litCamera.width = this.litCamera.height = 1
    this.litSource = this.litTime = undefined
    this.clearEffects(preserveExperience)
  }

  ingest(image: ImageBitmap, frame: TrackingFrame, now: number, keepForHands = false) {
    const tracked = resolveRig(frame, this.kind)
    const hasFace = this.kind === 'mario' || this.kind === 'conan' || this.kind === 'shinchan' || this.kind === 'coraline' || this.kind === 'bo'
      ? frame.face.length >= 468 && [1, 10, 13, 234, 454].every(i => {
        const p = frame.face[i]!
        return [p.x, p.y, p.z].every(Number.isFinite)
      }) : tracked.length > 0
    if (hasFace || keepForHands || this.kind === 'conan' || this.kind === 'shinchan' || this.kind === 'coraline' || this.kind === 'bo') {
      this.image?.close()
      this.image = image
      this.imageReceived = now
      this.imageTimestamp = frame.timestamp
    } else image.close()
    if (!hasFace) return false
    this.frame = frame
    this.tracked = tracked
    this.received = now
    if (this.kind === 'no-face') this.mouth.update(frame)
    return true
  }

  visible(now: number) { return now - this.received < 390 }

  private resize() {
    const r = this.canvas.getBoundingClientRect()
    this.width = Math.max(1, r.width); this.height = Math.max(1, r.height)
    this.ratio = Math.min(1.75, window.devicePixelRatio || 1)
    this.canvas.width = this.paper.width = Math.round(this.width * this.ratio)
    this.canvas.height = this.paper.height = Math.round(this.height * this.ratio)
    const c = this.paper.getContext('2d')!, { width: w, height: h } = this
    c.setTransform(this.ratio, 0, 0, this.ratio, 0, 0)
    const field = c.createRadialGradient(w * .5, h * .47, h * .04, w * .5, h * .47, w * .72)
    if (this.kind === 'bo') {
      field.addColorStop(0, '#58363a'); field.addColorStop(.52, '#302330'); field.addColorStop(1, '#181722')
    } else if (this.kind === 'coraline') {
      field.addColorStop(0, '#2e416c'); field.addColorStop(.52, '#221e42'); field.addColorStop(1, '#0b1125')
    } else if (this.kind === 'shinchan') {
      field.addColorStop(0, '#51443b'); field.addColorStop(.52, '#302d34'); field.addColorStop(1, '#171d29')
    } else if (this.kind === 'conan') {
      field.addColorStop(0, '#263e60'); field.addColorStop(.52, '#14263f'); field.addColorStop(1, '#0b1424')
    } else if (this.kind === 'mario') {
      field.addColorStop(0, '#254958'); field.addColorStop(.52, '#142e40'); field.addColorStop(1, '#0d1929')
    } else if (this.kind === 'no-face') {
      field.addColorStop(0, '#58465e'); field.addColorStop(.52, '#281e33'); field.addColorStop(1, '#151421')
    } else {
      field.addColorStop(0, '#183039'); field.addColorStop(.52, '#111e27'); field.addColorStop(1, '#090e15')
    }
    c.fillStyle = field; c.fillRect(0, 0, w, h)
    const r0 = Math.min(w, h) * .39
    c.strokeStyle = this.kind === 'no-face' ? '#edc9ed36' : '#91c7c22b'; c.lineWidth = 1
    for (const r of [r0 * .77, r0, r0 * 1.14]) {
      c.beginPath(); c.arc(w / 2, h * .49, r, 0, 2 * Math.PI); c.stroke()
    }
    for (let i = 0; i < 64; i++) {
      const a = i * Math.PI / 32
      const end = r0 * (i % 8 ? 1.17 : 1.21)
      c.strokeStyle = i % 8 ? '#91c7c233' : '#9ee9d888'
      c.beginPath(); c.moveTo(w / 2 + Math.cos(a) * r0 * 1.15, h * .49 + Math.sin(a) * r0 * 1.15)
      c.lineTo(w / 2 + Math.cos(a) * end, h * .49 + Math.sin(a) * end); c.stroke()
    }
    c.strokeStyle = '#45677543'; c.setLineDash([3, 6])
    c.beginPath(); c.moveTo(w * .08, h * .49); c.lineTo(w * .92, h * .49)
    c.moveTo(w / 2, h * .1); c.lineTo(w / 2, h * .89); c.stroke()
  }

  draw(now: number, video: HTMLVideoElement, state: MaskState, elapsed: number, reduced: boolean, demoGold: boolean) {
    const c = this.ctx, { width: w, height: h } = this
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.drawImage(this.paper, 0, 0)
    c.setTransform(this.ratio, 0, 0, this.ratio, 0, 0)
    const dt = this.lastDraw ? Math.min(.05, (now - this.lastDraw) / 1000) : 0
    this.lastDraw = now
    const spirit = this.kind === 'no-face'
    if (spirit) this.spiritStart ??= now
    if (!this.live) {
      if (this.kind === 'bo') {
        this.bo.draw(c, now, w, h, this.ratio, reduced, true)
        return
      }
      if (this.kind === 'coraline') {
        this.coraline.draw(c, p => p, now, w, h, reduced, true)
        return
      }
      if (this.kind === 'shinchan') {
        this.shinchan.draw(c, now, w, h, reduced, true)
        return
      }
      if (this.kind === 'conan') {
        this.conan.draw(c, p => p, now, w, h, reduced, true)
        return
      }
      const mario = this.kind === 'mario'
      const scale = Math.min(w / 720, h / 720) * (mario ? .70 : .92)
      const project: Projection = p => ({ x: w / 2 + (360 - p.x) * scale, y: h / 2 + (mario ? h * .15 : 0) + (p.y - 360) * scale, z: p.z * scale })
      if (mario) {
        const cap = this.mario.drawFace(c, sampleFrame, project, state, elapsed, w, h, reduced)
        if (state === 'locked') this.mario.draw(c, project, now, w, h, reduced, true, cap)
        return
      }
      const mouth = this.drawMask(this.preview, project, state, elapsed, now, reduced, demoGold ? 1 : 0)
      if (spirit) this.drawSpirit(now, dt, demoGold && state === 'locked' ? mouth : undefined, reduced)
      return
    }

    const image = now - this.imageReceived < 390 ? this.image : undefined
    const aligned = state !== 'off' || this.kind === 'conan' || this.kind === 'shinchan' || this.kind === 'coraline' ? image : undefined
    const width = aligned?.width ?? video.videoWidth
    const height = aligned?.height ?? video.videoHeight
    if (!width || !height || (!aligned && video.readyState < 2)) {
      if (spirit) this.drawSpirit(now, dt, undefined, reduced)
      return
    }
    const source = this.lightCamera(aligned ?? video, width, height, aligned ? undefined : video.currentTime)
    const frame = this.visible(now) && this.frame?.timestamp === this.imageTimestamp ? this.frame : undefined
    const camera = { source, rect: { x: 0, y: 0, width: w, height: h }, ratio: this.ratio }
    if (this.kind === 'bo') {
      this.bo.draw(c, now, w, h, this.ratio, reduced, false, camera, !!aligned)
      return
    }
    c.save(); c.translate(w, 0); c.scale(-1, 1)
    c.drawImage(source, 0, 0, w, h)
    c.restore()
    if (this.kind === 'shinchan') {
      this.shinchan.draw(c, now, w, h, reduced, false, { ...camera, width, height, timestamp: aligned ? this.imageTimestamp : undefined })
      return
    }
    const project: Projection = point => ({
      x: (1 - point.x / width) * w, y: point.y / height * h, z: point.z / width * w,
    })
    if (this.kind === 'coraline') {
      this.coraline.draw(c, project, now, w, h, reduced, false, aligned ? camera : undefined)
      return
    }
    if (!aligned) {
      if (spirit) {
        if (!frame) this.mouth.reset()
        this.drawSpirit(now, dt, undefined, reduced)
      }
      return
    }
    if (this.kind === 'conan') {
      this.conan.draw(c, project, now, w, h, reduced, false, camera)
      return
    }
    if (this.kind === 'mario') {
      const cap = frame ? this.mario.drawFace(c, frame, project, state, elapsed, w, h, reduced) : undefined
      if (state === 'locked') this.mario.draw(c, project, now, w, h, reduced, false, cap)
      return
    }
    const mouth = frame
      ? this.drawMask(this.tracked, project, state, elapsed, now, reduced, Math.max(0, (this.mouth.value - .035) * 7))
      : undefined
    if (spirit) this.drawSpirit(now, dt, state === 'locked' && this.mouth.open ? mouth : undefined, reduced)
    else if (state === 'locked') this.gauntlets.draw(c, this.hands, project, now, w, h, reduced, this.imageTimestamp)
  }

  private lightCamera(source: CanvasImageSource, width: number, height: number, time?: number) {
    const camera = this.litCamera
    if (camera.width !== width || camera.height !== height) {
      camera.width = width
      camera.height = height
    } else if (this.litSource === source && this.litTime === time) {
      return camera
    }
    const c = camera.getContext('2d', { alpha: false })!
    c.drawImage(source, 0, 0, width, height)
    // Add five percent of each channel to lift exposure uniformly.
    c.save()
    c.globalCompositeOperation = 'lighter'
    c.globalAlpha = .05
    c.drawImage(source, 0, 0, width, height)
    c.restore()
    this.litSource = source
    this.litTime = time
    return camera
  }

  private drawSpirit(now: number, dt: number, origin: Vec3 | undefined, reduced: boolean) {
    this.gold.step(dt, origin, clamp(this.live ? this.mouth.value * 3 : .75), this.height)
    this.gold.draw(this.ctx)
    drawCompanions(this.ctx, this.width, this.height, now - (this.spiritStart ?? now), reduced)
  }

  private drawMask(parts: ResolvedPart[], project: Projection, state: MaskState, elapsed: number, now: number, reduced: boolean, opening: number) {
    if (state === 'off') return
    const c = this.ctx
    const assembled = state === 'locked'
    const lit = assembled ? (reduced ? 1 : .92 + .08 * Math.sin(now / 740)) : 0
    const emitters: { origin: Vec3; facing: Pixel }[] = []
    let mouth: Vec3 | undefined
    const ordered = [...parts].sort((a, b) => a.part.priority - b.part.priority || b.center.z - a.center.z)
    for (const item of ordered) {
      const { part, surfaces } = item
      const motion = partMotion(state, elapsed, part.delay, part.flight)
      if (!motion.visible) continue
      const center = project(item.center)
      // The preview is mirrored, so the left and right arrival lanes are mirrored too.
      const ax = -part.arrival[0], ay = part.arrival[1]
      const originX = ax < 0 ? -this.width * .40 : ax > 0 ? this.width * 1.40 : center.x
      const originY = ay <= -.7 ? -this.height * .38 : ay >= .7 ? this.height * 1.39 : center.y + ay * this.height
      const dx = (originX - center.x) * (1 - motion.approach)
      const dy = (originY - center.y) * (1 - motion.approach)
      const rotation = (ax || -ay * .6) * (1 - motion.approach) * .84
      const size = .57 + .43 * clamp(motion.approach)
      const position = (p: Vec3): Vec3 => {
        const world = project(p), x = (world.x - center.x) * size, y = (world.y - center.y) * size
        return { x: center.x + dx + x * Math.cos(rotation) - y * Math.sin(rotation),
          y: center.y + dy + x * Math.sin(rotation) + y * Math.cos(rotation), z: world.z }
      }
      if (motion.trail > .06) {
        const x = center.x + dx, y = center.y + dy, stretch = motion.trail * .16
        c.save()
        c.strokeStyle = '#90fbe2'; c.globalAlpha = motion.trail * .44; c.lineWidth = 1
        for (const j of [-9, 0, 9]) {
          c.beginPath(); c.moveTo(x + j, y + j * .43)
          c.lineTo(x + (originX - center.x) * stretch + j, y + (originY - center.y) * stretch + j * .43); c.stroke()
        }
        c.restore()
      }
      c.save()
      c.globalAlpha = state === 'releasing' ? clamp(motion.approach * 1.8) : 1
      for (const surface of surfaces) {
        if (surface.material === 'mouth') {
          const center = centerOf(surface.vertices)
          const stretch = 1 + clamp(opening, 0, 1.4) * 1.95
          const vertices = surface.vertices.map(p => ({ ...p, y: center.y + (p.y - center.y) * stretch }))
          this.surface({ ...surface, vertices }, position, 0)
          mouth = position(center)
          continue
        }
        this.surface(surface, position, lit || (motion.latch * .6))
        if (assembled && surface.material === 'light') {
          const eye = centerOf(surface.vertices)
          const origin = position(eye)
          const forward = position({ x: eye.x + item.forward.x, y: eye.y + item.forward.y, z: eye.z + item.forward.z })
          // Undo projection scale, preserving mirror and pitch/yaw direction.
          const scale = Math.abs(position({ ...eye, x: eye.x + 1 }).x - origin.x) || 1
          emitters.push({ origin, facing: { x: (forward.x - origin.x) / scale, y: (forward.y - origin.y) / scale } })
        }
      }
      if (motion.latch > .13) {
        const peak = 1 - motion.latch
        c.save(); c.globalAlpha = motion.latch * .68; c.strokeStyle = '#a7ffe4'; c.lineWidth = 1
        for (let i = 0; i < 6; i++) {
          const theta = i * 1.047 + part.delay * .018, radius = 7 + peak * 21
          c.beginPath(); c.moveTo(center.x + Math.cos(theta) * radius, center.y + Math.sin(theta) * radius)
          c.lineTo(center.x + Math.cos(theta) * (radius + 5), center.y + Math.sin(theta) * (radius + 5)); c.stroke()
        }
        c.restore()
      }
      c.restore()
    }
    for (const emitter of emitters) this.laser(emitter.origin, emitter.facing, now, reduced)
    if (state === 'assembling' && elapsed > 1200) {
      c.fillStyle = `rgba(140,255,223,${(1 - ease((elapsed - 1200) / 165)) * .10})`
      c.fillRect(0, 0, this.width, this.height)
    }
    return mouth
  }

  private laser(origin: Pixel, facing: Pixel, now: number, reduced: boolean) {
    const end = laserTarget(origin, facing, this.width, this.height)
    if (Math.hypot(end.x - origin.x, end.y - origin.y) < 2) return
    const c = this.ctx
    const phase = reduced ? .86 : .86 + .10 * Math.sin(now / 310)
    const width = clamp(Math.min(this.width, this.height) / 140, 2, 5)
    c.save()
    c.globalAlpha = phase
    c.lineCap = 'round'
    c.beginPath(); c.moveTo(origin.x, origin.y); c.lineTo(end.x, end.y)
    c.shadowColor = '#ff352b'; c.shadowBlur = 22
    c.lineWidth = width * 2.55; c.strokeStyle = '#ff3f2677'; c.stroke()
    c.shadowBlur = 9
    c.lineWidth = width; c.strokeStyle = '#ff5b42'; c.stroke()
    c.shadowBlur = 1
    c.lineWidth = Math.max(1.2, width * .32); c.strokeStyle = '#fff7e7'; c.stroke()
    c.shadowBlur = 13; c.shadowColor = '#ff5b42'
    c.beginPath(); c.arc(origin.x, origin.y, width * .88, 0, Math.PI * 2)
    c.fillStyle = '#fff5e9'; c.fill()
    c.restore()
  }

  private surface(surface: ResolvedSurface, project: Projection, lumens: number) {
    const c = this.ctx
    const points = surface.vertices.map(project)
    if (points.length < 3) return
    const center = centerOf(points)
    const xs = points.map(point => point.x), ys = points.map(point => point.y)
    const height = Math.max(1, Math.max(...ys) - Math.min(...ys))
    const width = Math.max(1, Math.max(...xs) - Math.min(...xs))
    const a = points[0]!, b = points[Math.floor(points.length / 3)]!, d = points[Math.floor(points.length * 2 / 3)]!
    const normal = unit(cross(sub(b, a), sub(d, a)))
    const sweep = normal.z < 0 ? -normal.x : normal.x
    const material = surface.material
    path(c, points)
    if (material === 'light') {
      const glow = clamp(lumens)
      c.save()
      c.shadowColor = '#61ffdc'; c.shadowBlur = glow * 22
      c.fillStyle = glow > .25 ? '#a4ffe7' : '#467d76'; c.fill()
      c.shadowBlur = glow * 9
      c.fillStyle = glow > .5 ? '#eefff6' : '#79beaf'; c.fill()
      c.restore()
      return
    }
    const gradient = c.createLinearGradient(center.x - width * (.38 + sweep * .15), center.y - height * .58, center.x + width * .34, center.y + height * .54)
    finishes[material].forEach((color, i) => gradient.addColorStop(stops[i]!, color))
    c.fillStyle = gradient; c.fill()
    c.lineWidth = material === 'rim' ? 1.3 : .7
    c.strokeStyle = material === 'porcelain' ? '#fef3daaa'
      : material === 'gold-bevel' ? '#f6db9490' : material === 'violet' ? '#92729033' : '#190c0d9c'
    c.stroke()
  }

  close() { this.observer.disconnect(); this.invalidate(); this.mario.close(); this.conan.close(); this.bo.close() }
}
