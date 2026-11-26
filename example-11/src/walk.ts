import type { Point } from './tracking'
const TAU = Math.PI * 2
export type WalkingFoot = Point & { planted: boolean }
type Foot = WalkingFoot & { start: number; target: number; plant: number; swinging: boolean }

// Footprints live in world coordinates. A stance foot does not slide with the hip.
export class GroundedWalk {
  private lastX: number | undefined
  private phase = Math.PI
  private feet: [Foot, Foot] | undefined
  private resting = 0
  reset() { this.lastX = undefined; this.phase = Math.PI; this.feet = undefined; this.resting = 0 }
  update(x: number, floor: number, unit: number, dt: number): { feet: [WalkingFoot, WalkingFoot]; moving: boolean; phase: number } {
    const step = Math.min(.05, Math.max(0, dt))
    if (!this.feet) this.feet = [-1, 1].map(side => ({ x: x + side * 19 * unit, y: floor, start: x + side * 19 * unit,
      target: x + side * 19 * unit, plant: x + side * 19 * unit, swinging: false, planted: true })) as [Foot, Foot]
    const dx = this.lastX === undefined ? 0 : x - this.lastX
    this.lastX = x
    const moving = step > 0 && Math.abs(dx) / step > 3 * unit
    if (moving) { this.phase += Math.abs(dx) / (72 * unit) * TAU; this.resting = 0 }
    else this.resting += step
    this.feet.forEach((foot, side) => {
      if (!moving) {
        foot.y += (floor - foot.y) * (1 - Math.exp(-step / .055))
        foot.plant = foot.x; foot.planted = Math.abs(floor - foot.y) < .25 * unit
        if (foot.planted) foot.y = floor
        return
      }
      const phase = ((this.phase + side * Math.PI) % TAU + TAU) % TAU
      if (phase < Math.PI) {
        if (!foot.swinging) { foot.start = foot.x; foot.target = x + Math.sign(dx) * 42 * unit + (side ? 13 : -13) * unit; foot.swinging = true }
        const p = phase / Math.PI, ease = p * p * (3 - 2 * p)
        foot.x = foot.start + (foot.target - foot.start) * ease
        const y = floor - Math.sin(phase) * 25 * unit
        foot.y += (y - foot.y) * (1 - Math.exp(-step / .025)); foot.planted = false
      } else {
        if (foot.swinging) foot.plant = foot.target
        foot.x = foot.plant; foot.y = floor; foot.swinging = false; foot.planted = true
      }
    })
    if (this.resting > .3 && this.feet.every(foot => foot.planted)) { this.phase = Math.PI; this.feet.forEach(foot => { foot.swinging = false; foot.plant = foot.x }) }
    return { feet: this.feet.map(foot => ({ x: foot.x, y: foot.y, planted: foot.planted })) as [WalkingFoot, WalkingFoot], moving, phase: this.phase }
  }
}
