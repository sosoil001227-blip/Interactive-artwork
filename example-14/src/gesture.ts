import { visible } from './dance.ts'
import type { Landmark, Point } from './dance.ts'
import type { PersonMask, PoseFrame } from './pose.ts'
import type { Box } from './avatar.ts'

const threshold = 149
const flashTime = 290

// Pose masks use camera coordinates. The visible feed and reticle are mirrored.
export function maskAt(mask: PersonMask, point: Point) {
  if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return 0
  const x = Math.min(mask.width - 1, Math.floor((1 - point.x) * mask.width))
  const y = Math.min(mask.height - 1, Math.floor(point.y * mask.height))
  return mask.confidence[y * mask.width + x] ?? 0
}

interface HandSample { relative: Point; aim: Point; at: number }
interface Target { mask: PersonMask; center: Point; from: number }
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

function center(pose: Landmark[]): Point | undefined {
  const a = pose[11], b = pose[12], c = pose[23], d = pose[24]
  if (!visible(a, .5) || !visible(b, .5) || !visible(c, .44) || !visible(d, .44)) return
  return { x: 1 - (a.x + b.x + c.x + d.x) / 4, y: (a.y + b.y + c.y + d.y) / 4 }
}

export class SwingEffect {
  private hands = new Map<number, HandSample>()
  private target?: Target
  private triggered = -Infinity
  private lastAim?: { point: Point; at: number }
  pointer?: Point
  private layer = document.createElement('canvas')
  private layerContext = this.layer.getContext('2d')!
  private rendered?: PersonMask

  reset() { this.hands.clear(); this.target = this.lastAim = undefined; this.triggered = -Infinity; this.pointer = undefined }

  update(frame: PoseFrame, slots: Landmark[][], aspect: number, now: number) {
    const { at, masks, landmarks } = frame
    if (this.target && now - this.target.from >= flashTime) this.target = undefined
    const targets = landmarks.flatMap((pose, index) => {
      const mask = masks?.[index], point = center(pose)
      return mask && point ? [{ mask, center: point }] : []
    })
    if (this.target && masks) {
      const hit = this.target
      const tracked = targets.reduce<(typeof targets)[number] | undefined>((best, current) => {
        const offset = distance(current.center, hit.center)
        return offset < .23 && (!best || offset < distance(best.center, hit.center)) ? current : best
      }, undefined)
      this.target = tracked ? { ...tracked, from: hit.from } : undefined
    }
    let fastest: { aim: Point; speed: number; travel: number } | undefined
    const samples = new Map<number, HandSample>()
    slots.forEach((pose, slot) => {
      const a = pose[11], b = pose[12]
      if (!visible(a, .53) || !visible(b, .53)) return
      const scale = Math.max(.095, Math.hypot((a.x - b.x) * aspect, a.y - b.y))
      for (const [shoulder, elbow, wrist] of [[11, 13, 15], [12, 14, 16]]) {
        const s = pose[shoulder!], e = pose[elbow!], w = pose[wrist!]
        if (!visible(s, .53) || !visible(e, .55) || !visible(w, .55)) continue
        const aim = { x: (slot + 1 - (w.x * .88 + e.x * .12)) / slots.length, y: w.y * .88 + e.y * .12 }
        const relative = { x: (s.x - w.x) * aspect / scale, y: (w.y - s.y) / scale }
        const key = slot * 2 + wrist! - 15
        const before = this.hands.get(key)
        samples.set(key, { relative, aim, at })
        if (!before || at - before.at < 25 || at - before.at > 210) continue
        const travel = distance(relative, before.relative)
        const speed = travel * 1000 / (at - before.at)
        if (!fastest || speed > fastest.speed) fastest = { aim, speed, travel }
      }
    })
    this.hands = samples
    const fallback = samples.values().next().value?.aim
    const aim = fastest?.aim ?? fallback
    if (aim) this.lastAim = { point: aim, at: now }
    const point = this.pointer ?? aim
    if (!point || !fastest || fastest.speed < 3.1 || fastest.travel < .16 || now - this.triggered < 410) return
    const target = targets.reduce<(typeof targets)[number] | undefined>((best, candidate) => {
      const coverage = maskAt(candidate.mask, point)
      return coverage >= threshold && (!best || coverage > maskAt(best.mask, point)) ? candidate : best
    }, undefined)
    if (target) {
      this.target = { ...target, from: now }
      this.triggered = now
    }
  }

  draw(c: CanvasRenderingContext2D, box: Box, now: number, reduced: boolean) {
    const target = this.target
    if (target && now - target.from < flashTime) {
      if (this.rendered !== target.mask) {
        const { width, height, confidence } = target.mask
        this.layer.width = width
        this.layer.height = height
        const pixels = this.layerContext.createImageData(width, height)
        confidence.forEach((value, i) => {
          if (value < threshold) return
          const px = i * 4
          pixels.data[px] = 255
          pixels.data[px + 1] = 38
          pixels.data[px + 2] = 68
          pixels.data[px + 3] = Math.min(255, (value - threshold + 18) * 6)
        })
        this.layerContext.putImageData(pixels, 0, 0)
        this.rendered = target.mask
      }
      c.save()
      c.translate(box.x + box.width, box.y); c.scale(-1, 1)
      c.imageSmoothingEnabled = false
      c.globalAlpha = (reduced ? .38 : .76) * (1 - (now - target.from) / flashTime)
      c.drawImage(this.layer, 0, 0, box.width, box.height)
      c.restore()
    }
    const aim = this.pointer ?? (this.lastAim && now - this.lastAim.at < 280 ? this.lastAim.point : undefined)
    if (!aim || aim.x < 0 || aim.x > 1 || aim.y < 0 || aim.y > 1) return
    const x = box.x + aim.x * box.width, y = box.y + aim.y * box.height
    c.save()
    c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2)
    c.moveTo(x - 9, y); c.lineTo(x - 3, y); c.moveTo(x + 3, y); c.lineTo(x + 9, y)
    c.moveTo(x, y - 9); c.lineTo(x, y - 3); c.moveTo(x, y + 3); c.lineTo(x, y + 9)
    c.strokeStyle = '#10102d'; c.lineWidth = 3; c.stroke()
    c.strokeStyle = target && now - target.from < flashTime ? '#ff6b89' : '#dbfff0'; c.lineWidth = 1; c.stroke()
    c.restore()
  }
}
