import type { HandPose, Point } from './tracking'
import { GroundedWalk } from './walk.ts'
import { TIPS } from './tracking.ts'

export type PuppetPose = {
  head: Point; neck: Point; hip: Point; shoulders: [Point, Point]; hips: [Point, Point]
  elbows: [Point, Point]; wrists: [Point, Point]; knees: [Point, Point]; ankles: [Point, Point]
  anchors?: Point[]; attachments: Point[]; scale: number; tilt: number; bodyTilt: number; walking: boolean; planted: boolean[]; tensions: number[]
}
type Spring = { value: number; velocity: number }
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

export function jointBetween(start: Point, end: Point, upper: number, lower: number, bend: number): Point {
  const dx = end.x - start.x, dy = end.y - start.y, raw = Math.hypot(dx, dy)
  const distance = clamp(raw || .0001, Math.abs(upper - lower) + .0001, upper + lower - .0001)
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance)
  const outward = Math.sqrt(Math.max(0, upper * upper - along * along)) * bend
  const x = raw ? dx / raw : 0, y = raw ? dy / raw : 1
  return { x: start.x + x * along - y * outward, y: start.y + y * along + x * outward }
}

export class MarionetteRig {
  private neutral: { center: number; fingers: number[] } | undefined
  private lastHandTime = 0
  private targets = [0, 0, 0, 0, 0, 0]
  private springs: Spring[] = Array.from({ length: 6 }, () => ({ value: 0, velocity: 0 }))
  private walk = new GroundedWalk()
  private lastWidth = 0
  private lastHeight = 0

  reset() { this.neutral = undefined; this.lastHandTime = 0; this.targets.fill(0); this.walk.reset(); for (const spring of this.springs) spring.value = spring.velocity = 0 }
  calibrate() { this.neutral = undefined }

  update(hand: HandPose | undefined, dt: number, width: number, height: number): PuppetPose {
    const unit = Math.min(height / 760, width / 500, 1.45)
    if (this.lastWidth && (width !== this.lastWidth || height !== this.lastHeight)) {
      const ratio = width / this.lastWidth
      this.springs[0]!.value *= ratio; this.springs[0]!.velocity *= ratio; this.targets[0]! *= ratio
      this.walk.reset(); this.neutral = undefined
    }
    this.lastWidth = width; this.lastHeight = height
    if (hand) {
      const fingers = TIPS.map(index => {
        const p = hand.points[index]!
        return (p.y - hand.center.y + (p.z - hand.points[0]!.z) * .45) / hand.size
      })
      if (!this.neutral || hand.seen - this.lastHandTime > 400) {
        this.neutral = { center: hand.center.x - this.springs[0]!.value / .8,
          fingers: fingers.map((value, i) => value + this.springs[i + 1]!.value) }
      }
      this.lastHandTime = hand.seen
      this.targets[0] = clamp((hand.center.x - this.neutral.center) * .8, -width * .25, width * .22)
      fingers.forEach((value, i) => { this.targets[i + 1] = clamp(this.neutral!.fingers[i]! - value, -1, 1) })
    }
    // Missing hands retain the last pose. Reacquisition calibrates at that pose.
    let remaining = Math.min(.05, Math.max(0, dt))
    while (remaining > .000001) {
      const step = Math.min(remaining, 1 / 120); remaining -= step
      this.springs.forEach((spring, i) => {
        spring.velocity += ((this.targets[i]! - spring.value) * 170 - spring.velocity * 24) * step
        spring.value += spring.velocity * step
      })
    }
    const v = this.springs.map(spring => spring.value)
    const margin = Math.min(width * .44, width * .16 + 83 * unit)
    const x = clamp(width * .47 + v[0]!, margin, width - margin)
    const y = height * .84 - 273 * unit + Math.max(0, v[5]!) * 6 * unit
    const bodyTilt = v[4]! * .13, headTilt = v[3]! * .19
    const point = (px: number, py: number): Point => ({ x: x + (px * Math.cos(bodyTilt) - (py - 64) * Math.sin(bodyTilt)) * unit,
      y: y + (64 + px * Math.sin(bodyTilt) + (py - 64) * Math.cos(bodyTilt)) * unit })
    const neck = point(0, -37), hip = point(0, 64), tilt = bodyTilt + headTilt
    const head = { x: neck.x + Math.sin(tilt) * 36 * unit, y: neck.y - Math.cos(tilt) * 36 * unit }
    const shoulders: [Point, Point] = [point(-34, -26), point(34, -26)]
    const hips: [Point, Point] = [point(-16, 64), point(16, 64)]
    const wrists: [Point, Point] = [point(-57 - v[1]! * 44, 94 - v[1]! * 118), point(57 + v[2]! * 44, 94 - v[2]! * 118)]
    const gait = this.walk.update(x, height * .84 - 31 * unit, unit, dt)
    const ankles: [Point, Point] = gait.feet.map(p => ({ x: p.x, y: p.y })) as [Point, Point]
    const reachable = (root: Point, end: Point, length: number) => {
      const dx = end.x - root.x, dy = end.y - root.y, d = Math.hypot(dx, dy)
      if (d > length) { end.x = root.x + dx / d * length; end.y = root.y + dy / d * length }
    }
    wrists.forEach((p, i) => reachable(shoulders[i]!, p, 126 * unit))
    ankles.forEach((p, i) => reachable(hips[i]!, p, 195 * unit))
    const elbows: [Point, Point] = [jointBetween(shoulders[0], wrists[0], 64 * unit, 64 * unit, 1), jointBetween(shoulders[1], wrists[1], 64 * unit, 64 * unit, -1)]
    const knees: [Point, Point] = [jointBetween(hips[0], ankles[0], 98 * unit, 98 * unit, -1), jointBetween(hips[1], ankles[1], 98 * unit, 98 * unit, 1)]
    return { head, neck, hip, shoulders, hips, elbows, wrists, knees, ankles, scale: unit, tilt, bodyTilt,
      walking: gait.moving, planted: gait.feet.map(p => p.planted),
      tensions: [v[1]!, v[2]!, v[3]!, v[4]!, v[5]!].map(value => Math.min(1, Math.abs(value) * 1.6 + .35)),
      anchors: hand ? TIPS.map(index => hand.points[index]!) : undefined,
      attachments: [wrists[0], wrists[1], { x: head.x + Math.sin(tilt) * 53 * unit, y: head.y - Math.cos(tilt) * 53 * unit }, shoulders[1], ankles[0]] }
  }
}
