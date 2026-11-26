import type { HandLandmarkerResult } from '@mediapipe/tasks-vision'
import { FingerResonance } from './resonance.ts'

export type Vec2 = { x: number; y: number }
export type Vec3 = Vec2 & { z: number }
export type Phase = 'gather' | 'grow' | 'ready' | 'cast'
export interface Palm {
  label: string
  points: Vec2[]
  center: Vec2
  normal: Vec3
  size: number
  extended: number
  confidence: number
  fingerPose?: readonly number[]
}
export interface Spell extends Vec2 { radius: number; power: number }
export interface GestureState extends Spell {
  phase: Phase
  visible: boolean
  charge: number
  progress: number
  palms: Palm[]
  resonance: number
  summoned?: boolean
  launch?: Spell
}

const subtract = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const magnitude = (v: Vec3) => Math.hypot(v.x, v.y, v.z)
const distance = (a: Vec3, b: Vec3) => magnitude(subtract(a, b))
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const clamp = (x: number, low = 0, high = 1) => Math.max(low, Math.min(high, x))
function normalize(v: Vec3): Vec3 {
  const length = magnitude(v) || 1
  return { x: v.x / length, y: v.y / length, z: v.z / length }
}

export function cameraToScreen(p: Vec2, vw: number, vh: number, width: number, height: number): Vec2 {
  const scale = Math.max(width / vw, height / vh)
  return { x: (1 - p.x) * vw * scale - (vw * scale - width) / 2,
    y: p.y * vh * scale - (vh * scale - height) / 2 }
}

// A signed surface normal distinguishes a palm from the back of a hand.
// Cross-product order is corrected by handedness, then mirrored for display.
export function palmNormal(points: Vec3[], label: string): Vec3 {
  const across = subtract(points[5]!, points[17]!)
  const along = subtract(points[9]!, points[0]!)
  const sign = label === 'Left' ? -1 : 1
  return normalize({
    x: -(across.y * along.z - across.z * along.y) * sign,
    y: (across.z * along.x - across.x * along.z) * sign,
    z: (across.x * along.y - across.y * along.x) * sign,
  })
}

function isExtended(points: Vec3[], base: number, joint: number, tip: number) {
  const a = normalize(subtract(points[base]!, points[joint]!))
  const b = normalize(subtract(points[tip]!, points[joint]!))
  const straight = dot(a, b) < -.45
  const away = distance(points[tip]!, points[0]!) > distance(points[joint]!, points[0]!) * 1.10
  return straight && away
}

export function readPalms(result: HandLandmarkerResult, vw: number, vh: number, width: number, height: number): Palm[] {
  return result.landmarks.slice(0, 2).flatMap((landmarks, index) => {
    if (landmarks.length !== 21) return []
    const category = result.handedness[index]?.[0]
    if (!category || !['Left', 'Right'].includes(category.categoryName)) return []
    const world = result.worldLandmarks[index]
    // Fallback scales normalized image coordinates into the same metric on all axes.
    const metric: Vec3[] = world?.length === 21 ? world : landmarks.map(p => ({ x: p.x, y: p.y * vh / vw, z: p.z }))
    const points = landmarks.map(p => cameraToScreen(p, vw, vh, width, height))
    const center = [0, 5, 9, 13, 17].reduce((sum, i) => ({ x: sum.x + points[i]!.x / 5, y: sum.y + points[i]!.y / 5 }), { x: 0, y: 0 })
    const size = Math.max(12, Math.hypot(points[9]!.x - points[0]!.x, points[9]!.y - points[0]!.y))
    const extended = [[2, 3, 4], [5, 6, 8], [9, 10, 12], [13, 14, 16], [17, 18, 20]]
      .filter(([base, joint, tip]) => isExtended(metric, base!, joint!, tip!)).length
    const across = normalize(subtract(metric[5]!, metric[17]!))
    const normal = normalize(cross(across, subtract(metric[9]!, metric[0]!)))
    const along = normalize(cross(normal, across))
    const palmLength = Math.max(.00001, distance(metric[9]!, metric[0]!))
    const fingerPose = [[2, 4], [5, 8], [9, 12], [13, 16], [17, 20]].flatMap(([base, tip]) => {
      const v = subtract(metric[tip!]!, metric[base!]!)
      return [dot(v, across) / palmLength, dot(v, along) / palmLength, dot(v, normal) / palmLength]
    })
    return [{ label: category.categoryName, points, center, normal: palmNormal(metric, category.categoryName), size, extended, confidence: category.score, fingerPose }]
  })
}

export class MagicGesture {
  private phase: Phase = 'gather'
  private baseline = 0
  private chargedSpan = 0
  private castTime = 0
  private lastValid = -Infinity
  private lastTime = 0
  private center: Vec2 = { x: 0, y: 0 }
  private radius = 0
  private charge = 0
  private holds = new Map<string, number>()
  private fingerMotion = new FingerResonance()

  reset() {
    this.phase = 'gather'; this.baseline = 0; this.chargedSpan = 0
    this.castTime = 0; this.lastValid = -Infinity; this.lastTime = 0
    this.radius = 0; this.charge = 0; this.holds.clear()
    this.fingerMotion.reset()
  }

  private hold(key: string, condition: boolean, now: number, duration: number) {
    if (!condition) { this.holds.delete(key); return 0 }
    if (!this.holds.has(key)) this.holds.set(key, now)
    return clamp((now - this.holds.get(key)!) / duration)
  }

  update(palms: Palm[], now: number): GestureState {
    let progress = 0, launch: Spell | undefined, summoned = false
    // A long pause (background tab or interrupted video) cannot finish a dwell.
    if (this.lastTime && now - this.lastTime > 280) this.holds.clear()
    this.lastTime = now
    const ordered = [...palms].sort((a, b) => a.center.x - b.center.x)
    const [left, right] = ordered
    const tracked = ordered.length === 2 && left!.confidence >= .5 && right!.confidence >= .5
      && left!.label !== right!.label
    const open = tracked && left!.extended >= 3 && right!.extended >= 3
    // Once charged, fingers can flex freely while the palms stay spread.
    // An actual launch still requires both palms to be open.
    const both = tracked && (this.phase === 'ready' || open)
    const span = both ? right!.center.x - left!.center.x : 0
    const size = both ? (left!.size + right!.size) / 2 : 1
    const aligned = both && span > size * .8 && Math.abs(left!.center.y - right!.center.y) < span * .7 + size
    const valid = Boolean(both && aligned)

    if (this.phase === 'cast') {
      if (now - this.castTime > 1450) this.reset()
      return this.snapshot(palms, progress, now)
    }

    if (!valid) {
      this.holds.clear()
      if (now - this.lastValid > 450) this.reset()
      return this.snapshot(palms, progress, now)
    }
    const reacquired = now - this.lastValid > 450
    this.lastValid = now
    const target = { x: (left!.center.x + right!.center.x) / 2, y: (left!.center.y + right!.center.y) / 2 }
    const alpha = reacquired || !this.radius ? 1 : .35
    this.center.x += (target.x - this.center.x) * alpha
    this.center.y += (target.y - this.center.y) * alpha
    this.radius += (span * .46 - this.radius) * alpha
    const direction = normalize({ x: right!.center.x - left!.center.x, y: right!.center.y - left!.center.y, z: 0 })
    // Keep these orientation ranges disjoint. Angled palms used to summon
    // must rotate farther toward the lens before they can release the spell.
    const inward = dot(left!.normal, direction) > .45 && dot(right!.normal, direction) < -.45
      && Math.abs(left!.normal.z) < .72 && Math.abs(right!.normal.z) < .72
    const towardCamera = open && left!.normal.z < -.76 && right!.normal.z < -.76

    if (this.phase === 'gather') {
      progress = this.hold('gather', inward, now, 220)
      if (progress >= 1) {
        this.phase = 'grow'; this.baseline = Math.min(span, size * 3)
        summoned = true
        this.holds.clear()
      }
    } else if (this.phase === 'grow') {
      this.charge = clamp((span / this.baseline - 1) / .38)
      progress = this.hold('grow', span > this.baseline * 1.28 && span > size * 2.5, now, 180)
      if (progress >= 1) { this.phase = 'ready'; this.chargedSpan = span; this.charge = 1; this.holds.clear() }
    } else if (this.phase === 'ready') {
      // Arms must remain spread when both palms rotate to face the camera.
      if (span < this.chargedSpan * .6) { this.phase = 'grow'; this.holds.clear(); this.charge = .5 }
      else {
        progress = this.hold('cast', towardCamera && span > this.chargedSpan * .75, now, 220)
        if (progress >= 1) {
          this.phase = 'cast'; this.castTime = now
          launch = { ...this.center, radius: this.radius, power: this.charge }
          this.holds.clear()
        }
      }
    }
    return { ...this.snapshot(palms, progress, now, valid), launch, summoned }
  }

  private snapshot(palms: Palm[], progress: number, now: number, tracked = false): GestureState {
    return { ...this.center, radius: this.radius, power: this.charge, charge: this.charge,
      phase: this.phase, visible: this.phase === 'grow' || this.phase === 'ready', progress, palms,
      resonance: this.fingerMotion.update(palms, now, tracked && this.phase === 'ready') }
  }
}

