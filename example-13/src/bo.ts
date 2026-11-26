import { clamp, ease } from './geometry.ts'
import { BoGesture, initialBo } from './boGesture.ts'
import type { BoStatus } from './boGesture.ts'
import { boChannels, boFaceOutline, liveBoFit, morphBoFit, morphBoOutline, targetBoFit } from './boMorph.ts'
import type { BoFit } from './boMorph.ts'
import { drawBoFaceWarp, traceBoOutline } from './boFaceWarp.ts'
import { drawBo } from './boCharacter.ts'
import { BoVideo } from './boVideo.ts'
import type { TrackingFrame } from './tracking.ts'
import type { CameraLayer } from './personLayers.ts'

export class BoWorld {
  readonly gesture = new BoGesture()
  private video = new BoVideo()
  private frame?: TrackingFrame
  private received = -Infinity
  private visual = 0
  private blush = 0
  private lastFit?: BoFit
  private faceVideo?: HTMLCanvasElement
  private morphedFace?: HTMLCanvasElement
  private last?: number
  private clock = 0
  private demoStart?: number
  private spiral?: HTMLCanvasElement
  private spiralKey = ''

  reset() { this.gesture.reset(); this.clearTracking(); this.visual = this.blush = this.clock = 0; this.demoStart = undefined }
  clearTracking() {
    this.frame = undefined; this.received = -Infinity; this.last = undefined; this.lastFit = undefined
    this.gesture.clearTracking(); this.video.clear()
    for (const canvas of [this.faceVideo, this.morphedFace]) if (canvas) canvas.width = canvas.height = 1
  }
  update(frame: TrackingFrame, now: number) { this.frame = frame; this.received = now; this.gesture.update(frame, now) }
  demo() { this.reset(); this.demoStart = 0 }
  status(now: number): BoStatus {
    if (this.demoStart === undefined) return this.gesture.status(now)
    const p = clamp((this.clock - 900) / 3600)
    return { ...initialBo, stage: p >= 1 ? 'bo' : p > .43 ? 'transforming' : p > .01 ? 'blushing' : 'ready',
      tracked: true, progress: Math.round(p * 100), puff: p > 0 ? 90 : 0 }
  }

  draw(c: CanvasRenderingContext2D, now: number, w: number, h: number, ratio: number, reduced: boolean,
    preview: boolean, camera?: CameraLayer, aligned = true) {
    const dt = this.last === undefined ? 0 : Math.min(50, Math.max(0, now - this.last))
    this.last = now; this.clock += dt
    const status = this.status(now)
    const target = preview && this.demoStart === undefined ? 1 : status.tracked || status.stage === 'bo' ? status.progress / 100 : 0
    const smoothing = 1 - Math.exp(-dt / 85)
    this.visual += (target - this.visual) * smoothing
    this.blush += (clamp((status.puff / 100 - .13) / .49) - this.blush) * smoothing
    if (Math.abs(this.visual - target) < .002) this.visual = target
    const requested = preview && this.demoStart === undefined ? 1 : this.visual
    const frame = aligned && now - this.received < 350 ? this.frame : undefined
    c.save()
    c.fillStyle = '#171c25'; c.fillRect(0, 0, w, h)
    const destination = targetBoFit(w, h)
    const project = (point: { x: number; y: number; z: number }) => ({
      x: camera!.rect.x + (1 - point.x / frame!.width) * camera!.rect.width,
      y: camera!.rect.y + point.y / frame!.height * camera!.rect.height, z: point.z,
    })
    const live = frame && camera ? liveBoFit(frame, project) : undefined
    const outline = live && frame ? boFaceOutline(frame, project) : undefined
    const p = preview || outline || status.stage === 'bo' ? requested : Math.min(requested, .24)
    const channels = boChannels(p)
    if (live && p < .91) this.lastFit = live
    const anchor = this.lastFit ?? live ?? destination
    const fit = morphBoFit(anchor, destination, p)
    this.background(c, w, h, ratio, channels.background, reduced)

    const liveMorph = camera && frame && outline && live && p > .24 && p < .97 && !reduced
    if (camera && p < .97) {
      const blush = Math.max(channels.blush, this.blush * .52 * (1 - channels.cartoon))
      const puff = reduced ? 0 : Math.max(channels.puff, this.blush * .07) * (1 - channels.contour)
      if (liveMorph) {
        this.drawLiveMorph(c, camera, frame, outline, fit, channels, blush, puff, w, h)
      } else {
        c.save()
        c.globalAlpha = channels.video
        if (frame && live && (p > .005 || blush > .015)) {
          this.video.draw(c, camera.source, frame, camera.rect, w, h, ratio, { blush, puff, flatten: channels.flatten })
        } else {
          c.translate(camera.rect.x + camera.rect.width, camera.rect.y); c.scale(-1, 1)
          c.drawImage(camera.source, 0, 0, camera.rect.width, camera.rect.height)
        }
        c.restore()
      }
    }
    if (preview && this.demoStart !== undefined && p < .30) {
      c.save(); c.fillStyle = '#e8c59e38'; c.beginPath(); c.ellipse(destination.x, destination.y, destination.width / 2, destination.height / 2, 0, 0, Math.PI * 2); c.fill(); c.restore()
    }
    if (!liveMorph && (preview || status.stage === 'bo' || reduced && !!live)) {
      const fade = reduced ? ease((p - .45) / .48) : channels.cartoon
      drawBo(c, reduced ? destination : fit, fade, Math.min(fade, channels.body), channels.blush, this.clock, reduced, reduced ? 1 : channels.body)
    }
    c.restore()
  }

  private drawLiveMorph(c: CanvasRenderingContext2D, camera: CameraLayer, frame: TrackingFrame,
    outline: NonNullable<ReturnType<typeof boFaceOutline>>, fit: BoFit, channels: ReturnType<typeof boChannels>,
    blush: number, puff: number, w: number, h: number) {
    const scale = Math.min(1, 920 / Math.max(w, h))
    const width = Math.ceil(w * scale), height = Math.ceil(h * scale)
    this.faceVideo ??= document.createElement('canvas')
    this.morphedFace ??= document.createElement('canvas')
    for (const layer of [this.faceVideo, this.morphedFace]) {
      if (layer.width !== width || layer.height !== height) { layer.width = width; layer.height = height }
    }
    const video = this.faceVideo.getContext('2d')!
    video.setTransform(scale, 0, 0, scale, 0, 0); video.clearRect(0, 0, w, h)
    this.video.draw(video, camera.source, frame, camera.rect, w, h, scale, { blush, puff, flatten: channels.flatten })

    // The original face is cut out of the fading camera scene and continued in the deformation pass.
    if (channels.video > 0) {
      c.save(); c.globalAlpha = channels.video
      c.beginPath(); c.rect(0, 0, w, h); traceBoOutline(c, outline.edge); c.clip('evenodd')
      c.drawImage(this.faceVideo, 0, 0, width / scale, height / scale); c.restore()
    }
    const target = morphBoOutline(outline, fit, channels.contour)
    if (channels.body > 0) drawBo(c, fit, 0, channels.body, channels.blush, this.clock, false, channels.body)
    if (channels.cartoon > 0) {
      c.save()
      if (channels.contour < .96) {
        c.beginPath(); traceBoOutline(c, target.edge); c.clip()
      }
      drawBo(c, fit, channels.cartoon, 0, channels.blush, this.clock, false)
      c.restore()
    }
    if (channels.cartoon < 1) {
      const warped = this.morphedFace.getContext('2d')!
      warped.setTransform(scale, 0, 0, scale, 0, 0); warped.clearRect(0, 0, w, h)
      drawBoFaceWarp(warped, this.faceVideo, scale, outline, target)
      c.save(); c.globalAlpha = 1 - channels.cartoon
      c.drawImage(this.morphedFace, 0, 0, width / scale, height / scale); c.restore()
    }
  }

  private background(c: CanvasRenderingContext2D, w: number, h: number, ratio: number, opacity: number, reduced: boolean) {
    if (opacity < .001) return
    c.save(); c.globalAlpha = opacity; c.fillStyle = '#d14642'; c.fillRect(0, 0, w, h)
    const size = Math.ceil(Math.hypot(w, h) * 1.13), pixelRatio = Math.min(1.5, ratio)
    const key = `${size}:${pixelRatio}`
    if (this.spiralKey !== key) {
      this.spiral ??= document.createElement('canvas')
      this.spiral.width = this.spiral.height = Math.ceil(size * pixelRatio)
      const s = this.spiral.getContext('2d')!
      s.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0); s.translate(size / 2, size / 2)
      s.strokeStyle = '#fff7dc'; s.lineWidth = Math.max(.9, w / 850)
      for (let line = 0; line < 37; line++) {
        const radius = size * (.14 + line / 37 * .59), skew = line * 1.618
        s.beginPath()
        for (let i = 0; i <= 100; i++) {
          const angle = i / 100 * Math.PI * 2, r = radius * (1 + .055 * Math.sin(angle * 3 + skew) + .025 * Math.cos(angle * 7 + skew))
          const x = Math.cos(angle + skew) * r * (1 + .10 * Math.sin(skew)), y = Math.sin(angle + skew) * r
          if (i) s.lineTo(x, y); else s.moveTo(x, y)
        }
        s.stroke()
      }
      this.spiralKey = key
    }
    c.globalAlpha *= .78; c.translate(w / 2, h / 2); if (!reduced) c.rotate(this.clock * .00016)
    c.drawImage(this.spiral!, -size / 2, -size / 2, size, size); c.restore()
  }
  close() { this.reset(); this.video.close(); if (this.spiral) this.spiral.width = this.spiral.height = 1; this.spiral = undefined }
}
