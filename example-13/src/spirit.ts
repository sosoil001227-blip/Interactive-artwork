import { clamp, mix } from './geometry.ts'
import type { TrackingFrame } from './tracking.ts'

export class MouthGesture {
  value = 0
  open = false
  private previous?: number

  update(frame: TrackingFrame) {
    const { face, width, height, timestamp } = frame
    const upper = face[13], lower = face[14], left = face[33], right = face[263]
    if (!upper || !lower || !left || !right) { this.reset(); return }
    const eyeDistance = Math.hypot((right.x - left.x) * width, (right.y - left.y) * height, (right.z - left.z) * width)
    if (eyeDistance < 5) { this.reset(); return }
    const gap = Math.hypot((lower.x - upper.x) * width, (lower.y - upper.y) * height, (lower.z - upper.z) * width)
    const ratio = gap / eyeDistance
    const dt = this.previous === undefined ? 100 : clamp(timestamp - this.previous, 0, 120)
    this.previous = timestamp
    this.value = mix(this.value, ratio, 1 - Math.exp(-dt / 48))
    this.open = this.value > (this.open ? .059 : .091)
  }

  reset() { this.value = 0; this.open = false; this.previous = undefined }
}

interface Nugget {
  x: number; y: number; vx: number; vy: number; spin: number
  rotation: number; size: number; age: number; coin: boolean
}
interface Origin { x: number; y: number }

export class GoldCascade {
  private nuggets: Nugget[] = []
  private carry = 0

  clear() { this.nuggets = []; this.carry = 0 }

  step(dt: number, origin: Origin | undefined, intensity: number, edge: number) {
    if (origin) {
      this.carry += dt * (21 + 21 * intensity)
      while (this.carry >= 1 && this.nuggets.length < 100) {
        this.carry--
        const size = 4 + Math.random() * 9
        this.nuggets.push({
          x: origin.x + (Math.random() - .5) * 24, y: origin.y,
          vx: (Math.random() - .5) * 165, vy: -22 + Math.random() * 95,
          spin: (Math.random() - .5) * 10, rotation: Math.random() * 5,
          size, age: 0, coin: Math.random() > .55,
        })
      }
      this.carry = Math.min(this.carry, 1)
    } else {
      this.carry = 0
    }
    this.nuggets = this.nuggets.filter(p => {
      p.age += dt
      p.x += p.vx * dt; p.y += p.vy * dt
      p.vy += 445 * dt; p.rotation += p.spin * dt
      return p.y < edge + 24 && p.age < 2.4
    })
  }

  draw(c: CanvasRenderingContext2D) {
    for (const { x, y, rotation, size, age, coin } of this.nuggets) {
      c.save()
      c.translate(x, y); c.rotate(rotation)
      c.globalAlpha = 1 - clamp((age - 1.6) * 1.25)
      const s = size
      const flash = Math.abs(Math.sin(rotation * 1.3))
      c.fillStyle = flash > .65 ? '#ffdf77' : '#dca144'
      c.strokeStyle = '#95621b'; c.lineWidth = 1
      c.beginPath()
      if (coin) {
        c.ellipse(0, 0, s * (.28 + flash * .58), s * .76, 0, 0, Math.PI * 2)
      } else {
        c.moveTo(-s * .9, -s * .27)
        c.lineTo(-s * .38, -s * .76); c.lineTo(s * .62, -s * .55)
        c.lineTo(s * .94, .1 * s); c.lineTo(s * .3, s * .54); c.lineTo(-s * .71, s * .42)
      }
      c.closePath(); c.fill(); c.stroke()
      c.beginPath()
      c.strokeStyle = '#fff3b2'; c.lineWidth = 1.3
      c.moveTo(-s * .34, -.34 * s); c.lineTo(s * .3, -.29 * s); c.stroke()
      if (flash > .92 && age < .35) {
        c.strokeStyle = '#fff6bd'; c.lineWidth = .8
        c.beginPath(); c.moveTo(0, -s * 1.4); c.lineTo(0, -s * .46)
        c.moveTo(-s * .5, -s * .96); c.lineTo(s * .5, -s * .96); c.stroke()
      }
      c.restore()
    }
  }
}
