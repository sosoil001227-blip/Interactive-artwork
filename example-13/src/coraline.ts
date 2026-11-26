import { clamp, ease } from './geometry.ts'
import { fitBody, projectBodyFit, projectedFaceOutline } from './conanFit.ts'
import type { BodyFit, Projection } from './conanFit.ts'
import { PersonLayers, restoreTrackedHands } from './personLayers.ts'
import type { CameraLayer } from './personLayers.ts'
import { coralineEyes, CoralineGesture, initialCoraline, outfitMs } from './coralineGesture.ts'
import type { CoralineStatus } from './coralineGesture.ts'
import { drawButton, drawDoll, drawFallingObjects, drawRaincoat, drawTunnel } from './coralineArt.ts'
import type { TrackingFrame } from './tracking.ts'

const previewButtonAt = 3700
const freshMs = 390

function facePoint(frame: TrackingFrame, index: number, project: Projection) {
  const p = frame.face[index]
  if (!p || ![p.x, p.y, p.z].every(Number.isFinite)) return
  return project({ x: p.x * frame.width, y: p.y * frame.height, z: p.z * frame.width })
}

function setLayerSize(layer: HTMLCanvasElement, width: number, height: number) {
  if (layer.width !== width || layer.height !== height) {
    layer.width = width
    layer.height = height
  }
}

export class CoralineWorld {
  private gesture = new CoralineGesture()
  private frame?: TrackingFrame
  private received = -Infinity
  private body?: BodyFit
  private layers = new PersonLayers()
  private tunnel = document.createElement('canvas')
  private tunnelStamp = ''
  private demoElapsed?: number
  private demoTick?: number

  reset() {
    this.gesture.reset()
    this.clearTracking()
    this.demoElapsed = this.demoTick = undefined
    this.tunnelStamp = ''
    this.tunnel.width = this.tunnel.height = 1
  }

  clearTracking() {
    this.gesture.clearTracking()
    this.frame = this.body = undefined
    this.received = -Infinity
    this.layers.reset()
  }

  update(frame: TrackingFrame, now: number) {
    this.frame = frame
    this.received = now
    this.body = fitBody(frame, p => p)
    this.gesture.update(frame, now)
  }

  demo(now: number) {
    this.reset()
    this.demoElapsed = 0
    this.demoTick = now
  }

  status(now: number): CoralineStatus {
    const t = this.demoElapsed
    if (t === undefined) return this.gesture.status(now)
    if (t < 750) return initialCoraline
    if (t < 750 + outfitMs) return { ...initialCoraline, stage: 'outfit' }
    if (t < previewButtonAt) return { ...initialCoraline, stage: 'rings', hands: 'ready', rings: t > 3050 ? 2 : 0,
      progress: Math.round(clamp((t - 3050) / (previewButtonAt - 3050)) * 100) }
    return { ...initialCoraline, stage: 'buttons', hands: 'ready', rings: 2, progress: 100 }
  }

  draw(c: CanvasRenderingContext2D, project: Projection, now: number, w: number, h: number,
    reduced: boolean, preview: boolean, camera?: CameraLayer) {
    if (preview) {
      this.preview(c, now, w, h, reduced)
      return
    }
    const { outfitAt, buttonsAt } = this.gesture
    if (outfitAt === undefined) return

    const frame = camera && now - this.received < freshMs ? this.frame : undefined
    const top = frame && facePoint(frame, 10, project), chin = frame && facePoint(frame, 152, project)
    const cx = top && chin ? clamp((top.x + chin.x) / 2, w * .28, w * .72) : w / 2
    const cy = top && chin ? clamp((top.y + chin.y) / 2, h * .25, h * .57) : h * .44
    const elapsed = buttonsAt === undefined ? -1 : now - buttonsAt
    const alpha = reduced ? 1 : ease((now - outfitAt) / outfitMs)
    const foreground = frame && camera ? this.layers.prepare(frame, camera, w, h) : false

    if (elapsed >= 0) {
      const reveal = ease(elapsed / (reduced ? 180 : 740))
      const tunnel = this.tunnelFrame(w, h, reduced ? 0 : elapsed, cx, cy)
      c.save()
      if (!foreground) {
        c.beginPath(); c.rect(0, 0, w, h)
        c.moveTo(cx + w * .26, cy + h * .20)
        c.ellipse(cx, cy + h * .20, w * .26, h * .77, 0, 0, Math.PI * 2)
        c.clip('evenodd')
      }
      c.globalAlpha = reveal * (foreground ? 1 : .82)
      c.drawImage(tunnel, 0, 0, w, h)
      c.restore()
      if (foreground && camera) this.layers.restore(c, camera, w, h)
    }

    if (frame && camera && this.body) {
      const body = projectBodyFit(this.body, project)
      this.layers.garment(c, camera, w, h, projectedFaceOutline(frame, project), alpha,
        layer => drawRaincoat(layer, body, alpha))
      restoreTrackedHands(c, frame, project, camera)
    }

    const eyes = frame && coralineEyes(frame)
    if (eyes) {
      const points = eyes.map(eye => ({ point: project(eye.center),
        radius: Math.abs(project({ ...eye.center, x: eye.center.x + eye.width }).x - project(eye.center).x) * .63 }))
      const a = points[0]!.point, b = points[1]!.point
      const roll = Math.atan2(b.y - a.y, b.x - a.x) + (b.x < a.x ? Math.PI : 0)
      if (elapsed >= 0) {
        const progress = reduced ? 1 : ease(elapsed / 410)
        const limit = Math.hypot(b.x - a.x, b.y - a.y) * .43
        c.save(); c.globalAlpha = progress
        for (const { point, radius } of points) {
          const buttonRadius = Math.min(radius * 1.35, limit)
          drawButton(c, point.x, point.y, Math.max(2, buttonRadius * (.46 + .54 * progress)), '#553a6c', roll - (1 - progress) * 1.6, .90)
        }
        c.restore()
      } else if (alpha > .90) {
        const status = this.gesture.status(now)
        c.save()
        c.lineWidth = Math.max(1.25, Math.min(w, h) * .0028)
        c.strokeStyle = status.rings === 2 ? '#ffe681dc' : '#9cc9f6a0'
        for (const { point, radius } of points) {
          c.beginPath()
          c.arc(point.x, point.y, Math.max(3, radius * 1.46), -Math.PI / 2,
            -Math.PI / 2 + Math.PI * 2 * (status.progress ? status.progress / 100 : 1))
          if (!status.progress) c.setLineDash([3, 5])
          c.stroke()
        }
        c.restore()
      }
    }
    drawFallingObjects(c, w, h, elapsed, reduced)
  }

  private tunnelFrame(w: number, h: number, time: number, cx: number, cy: number) {
    const scale = Math.min(1, 900 / Math.max(w, h)), tick = Math.floor(time / 34)
    const stamp = `${w}:${h}:${Math.round(cx)}:${Math.round(cy)}:${tick}`
    if (this.tunnelStamp === stamp) return this.tunnel
    setLayerSize(this.tunnel, Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)))
    const c = this.tunnel.getContext('2d', { alpha: false })!
    c.setTransform(this.tunnel.width / w, 0, 0, this.tunnel.height / h, 0, 0)
    drawTunnel(c, w, h, tick * 34, 1, cx, cy)
    this.tunnelStamp = stamp
    return this.tunnel
  }

  private preview(c: CanvasRenderingContext2D, now: number, w: number, h: number, reduced: boolean) {
    if (this.demoElapsed !== undefined && this.demoTick !== undefined) {
      this.demoElapsed += Math.min(70, Math.max(0, now - this.demoTick))
      this.demoTick = now
    }
    const t = this.demoElapsed, transformed = t !== undefined && t >= previewButtonAt
    if (transformed) {
      const elapsed = t - previewButtonAt
      const tunnel = this.tunnelFrame(w, h, reduced ? 0 : elapsed, w / 2, h * .46)
      c.save(); c.globalAlpha = ease(elapsed / 500)
      c.drawImage(tunnel, 0, 0, w, h); c.restore()
    }
    const hero = Math.min(w * .62, h * .84)
    const glow = c.createRadialGradient(w * .5, h * .40, hero * .12, w * .5, h * .44, hero * .61)
    glow.addColorStop(0, '#5b568b65'); glow.addColorStop(1, '#17224600')
    c.fillStyle = glow; c.fillRect(0, 0, w, h)
    drawDoll(c, w / 2, h * .49, hero, 0, transformed)
    if (transformed) drawFallingObjects(c, w, h, t - previewButtonAt, reduced)
  }
}
