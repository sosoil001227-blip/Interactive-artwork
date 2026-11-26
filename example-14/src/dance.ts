export type Direction = 'left' | 'up' | 'down' | 'right'
export type Judgement = 'PERFECT' | 'GREAT' | 'BAD'
export interface Point { x: number; y: number }
export interface Landmark extends Point { z: number; visibility?: number; presence?: number }
export interface Floor { x: number; y: number; dx: number; dy: number }
export interface Step { direction: Direction; at: number }
export interface Foot { side: 'left' | 'right'; point: Point; tile?: Direction; centered?: boolean }
export interface Tracking {
  phase: 'searching' | 'framing' | 'centering' | 'ready' | 'partial'
  floor?: Floor
  feet: Foot[]
  motion: number
  steps: Step[]
}

export const directions: readonly Direction[] = ['left', 'up', 'down', 'right']
export const offsets: Record<Direction, readonly [number, number]> = {
  left: [-1, 0], up: [0, -1], down: [0, 1], right: [1, 0],
}
export const symbols: Record<Direction, string> = { left: '←', up: '↑', down: '↓', right: '→' }
export const defaultFloor: Floor = { x: .5, y: .79, dx: .114, dy: .077 }
export const beatMs = 500
const phrase: readonly Direction[] = ['left', 'up', 'right', 'down', 'left', 'right', 'up', 'down',
  'right', 'up', 'left', 'down', 'up', 'right', 'down', 'left']
export const cueAt = (beat: number) => phrase[((beat % phrase.length) + phrase.length) % phrase.length]!

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
const mix = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

export function tileAt(point: Point, floor: Floor): Direction | undefined {
  const x = (point.x - floor.x) / floor.dx, y = (point.y - floor.y) / floor.dy
  return directions.find(direction => {
    const [cx, cy] = offsets[direction]
    return Math.abs(x - cx) < .43 && Math.abs(y - cy) < .41
  })
}

export function visible(p: Landmark | undefined, minimum: number): p is Landmark {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
    (p.visibility ?? 1) >= minimum && (p.presence ?? 1) >= minimum
}

const mirrored = (p: Point) => ({ x: 1 - p.x, y: p.y })

function observeFeet(pose: Landmark[]): Foot[] {
  const foot = (side: Foot['side'], ankle: number, heel: number, toe: number): Foot[] => {
    const a = pose[ankle], h = pose[heel], t = pose[toe]
    if (!visible(a, .37) || (!visible(h, .35) && !visible(t, .35))) return []
    const sole = visible(h, .35) && visible(t, .35) ? mix(h, t, .56) : visible(h, .35) ? h : t!
    const point = mirrored(mix(a, sole, .78))
    if (point.x < .02 || point.x > .98 || point.y < .18 || point.y > .986) return []
    return [{ side, point }]
  }
  return [...foot('left', 27, 29, 31), ...foot('right', 28, 30, 32)]
}

interface FootState extends Foot { candidate?: Direction; since: number; armed: boolean }

export class DanceTracker {
  private floor?: Floor
  private origin?: { center: Point; since: number }
  private feet: FootState[] = []
  private previousBody?: Point[]
  private last = -Infinity
  private motion = 0

  reset() {
    this.floor = undefined
    this.loseTrack()
  }

  loseTrack() {
    this.origin = this.previousBody = undefined
    this.feet = []
    this.motion = 0
    this.last = -Infinity
  }

  update(pose: Landmark[], at: number, aspect: number): Tracking {
    if (at <= this.last) return { phase: this.floor ? this.feet.length === 2 ? 'ready' : 'partial' : 'centering',
      floor: this.floor, feet: this.feet, motion: this.motion, steps: [] }
    if (at - this.last > 300) this.loseTrack()
    const feet = observeFeet(pose)
    if (!feet.length || (!this.floor && feet.length < 2) || ![0, 11, 12, 23, 24].every(i => visible(pose[i], .36))) {
      this.loseTrack()
      return { phase: 'searching', floor: this.floor, feet, motion: 0, steps: [] }
    }
    const dt = clamp(at - this.last, 16, 125)
    this.last = at
    const hips = mirrored(mix(pose[23]!, pose[24]!, .5))
    const motionPoints = [11, 12, 15, 16, 23, 24].map(i => visible(pose[i], .35) ? mirrored(pose[i]!) : hips)
    const movement = this.previousBody ? motionPoints.reduce((sum, point, i) => sum + distance(point, this.previousBody![i]!), 0) / motionPoints.length : 0
    this.previousBody = motionPoints
    this.motion += (clamp(movement * 440 / dt, 0, 1) - this.motion) * .3

    if (!this.floor) {
      const left = feet[0]!.point, right = feet[1]!.point
      const center = mix(left, right, .5), height = center.y - pose[0]!.y
      const neutral = height >= .28 && center.x > .23 && center.x < .77 && center.y > .46 && center.y < .90
        && Math.abs(left.y - right.y) < height * .085
      if (!neutral) {
        this.origin = undefined
        return { phase: 'framing', feet, motion: this.motion, steps: [] }
      }
      if (!this.origin || distance(center, this.origin.center) > .023) this.origin = { center, since: at }
      else this.origin.center = mix(this.origin.center, center, .15)
      if (at - this.origin.since < 630) return { phase: 'centering', feet, motion: this.motion, steps: [] }
      const xLimit = Math.min(center.x, 1 - center.x) / 1.57
      const yLimit = Math.min(center.y, 1 - center.y) / 1.58
      this.floor = { ...this.origin.center,
        dx: Math.min(xLimit, Math.max(.061, height * .29 / aspect, Math.abs(left.x - right.x) * 1.15)),
        dy: Math.min(yLimit, Math.max(.047, height * .11)),
      }
    }

    const floor = this.floor
    const steps: Step[] = []
    this.feet = feet.map(({ point: raw, side }) => {
      const before = this.feet.find(foot => foot.side === side)
      const point = before ? mix(before.point, raw, 1 - Math.exp(-dt / 29)) : raw
      const candidate = tileAt(point, floor)
      const since = before && before.candidate === candidate ? before.since : at
      const centered = Math.abs(point.x - floor.x) < floor.dx * .50 && Math.abs(point.y - floor.y) < floor.dy * .50
      const armed = centered || before?.armed === true
      const stable = at - since >= 65
      const tile = stable ? candidate : before?.tile
      if (armed && stable && tile && tile !== before?.tile) steps.push({ direction: tile, at: since })
      // After a dropout the foot must return to the middle before it can fire again.
      return { side, point, tile, centered, candidate, since, armed }
    })
    return { phase: feet.length === 2 ? 'ready' : 'partial', floor, feet: this.feet, motion: this.motion, steps }
  }
}

export type PlayerCount = 1 | 2

export function assignPoses(poses: Landmark[][], count: PlayerCount): Landmark[][] {
  const groups: { pose: Landmark[]; distance: number }[] = []
  for (const pose of poses) {
    let a = pose[23], b = pose[24]
    if (!visible(a, .35) || !visible(b, .35)) {
      a = pose[11]; b = pose[12]
      if (!visible(a, .55) || !visible(b, .55)) continue
    }
    const center = 1 - (a.x + b.x) / 2
    // Each player keeps a fixed half of the mirrored camera, even when one person leaves.
    if (center < .02 || center > .98 || (count === 2 && Math.abs(center - .5) < .025)) continue
    const slot = Math.floor(center * count)
    const distance = Math.abs(center * count - slot - .5)
    if (!groups[slot] || distance < groups[slot]!.distance) groups[slot] = { pose, distance }
  }
  return Array.from({ length: count }, (_, slot) =>
    groups[slot]?.pose.map(p => ({ ...p, x: 1 - ((1 - p.x) * count - slot) })) ?? [])
}
