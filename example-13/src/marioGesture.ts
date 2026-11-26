import type { TrackedHand, TrackingFrame } from './tracking.ts'

export const gloveAssemblyMs = 850
export const brickDropMs = 900
export type MarioStage = 'spread' | 'gloving' | 'shake' | 'dropping' | 'play'

export function extendedFingers(hand: TrackedHand): number {
  const valid = (points: TrackedHand['landmarks']) => points.length === 21
    && points.every(point => [point.x, point.y, point.z].every(Number.isFinite))
  if (!valid(hand.landmarks)) return 0
  // Metric coordinates avoid treating a tilted palm or a wide video as curled fingers.
  const world = hand.worldLandmarks
  const p = valid(world) && Math.hypot(world[0]!.x - world[9]!.x, world[0]!.y - world[9]!.y, world[0]!.z - world[9]!.z) > .005
    ? world : hand.landmarks
  const distance = (a: number, b: number) => Math.hypot(p[a]!.x - p[b]!.x, p[a]!.y - p[b]!.y, p[a]!.z - p[b]!.z)
  const palm = distance(0, 9)
  if (palm < .008) return 0
  let count = 0
  for (const [mcp, pip, tip] of [[5, 6, 8], [9, 10, 12], [13, 14, 16], [17, 18, 20]]) {
    if (distance(0, tip!) > distance(0, pip!) * 1.035 && distance(mcp!, tip!) > palm * .42) count++
  }
  if (distance(4, 17) > distance(3, 17) * 1.015 && distance(4, 5) > palm * .34) count++
  return count
}

// One occluded thumb or small landmark error should not block an open-palm pose.
export function openHand(hand: TrackedHand): boolean { return extendedFingers(hand) >= 4 }

export function yawOf(frame: TrackingFrame): number | undefined {
  if (!frame.face[454] || !frame.face[234] || !frame.face[1]) return
  const matrix = frame.faceMatrix
  if (matrix?.rows === 4 && matrix.columns === 4 && matrix.data.length === 16) {
    const m = matrix.data
    const yaw = Math.atan2(m[2]! - m[8]!, m[0]! + m[10]!)
    if (Number.isFinite(yaw)) return yaw
  }
  const a = frame.face[234]!, b = frame.face[454]!, nose = frame.face[1]!
  return ((nose.x - (a.x + b.x) / 2) / (Math.abs(b.x - a.x) || 1)) * 1.6
}

/** Requires alternating head turns; a nod, held turn or tracking jump cannot fire. */
export class ShakeDetector {
  private baseline?: number
  private filtered = 0
  private last = -Infinity
  private started = 0
  private direction = 0
  private turns = 0
  private expires = 0

  reset() { this.baseline = undefined; this.direction = this.turns = 0; this.last = -Infinity }

  update(frame: TrackingFrame): boolean {
    const yaw = yawOf(frame), now = frame.timestamp
    if (yaw === undefined || now - this.last > 500) this.reset()
    if (yaw === undefined) return false
    if (this.baseline === undefined) {
      this.baseline = this.filtered = yaw
      this.started = this.last = now
      return false
    }
    this.filtered += (yaw - this.filtered) * (1 - Math.exp(-(now - this.last) / 55))
    this.last = now
    const delta = this.filtered - this.baseline
    if (now - this.started < 300) { this.baseline += delta * .1; return false }
    if (now > this.expires) { this.direction = 0; this.turns = 0 }
    const direction = delta > .17 ? 1 : delta < -.17 ? -1 : 0
    if (!direction || direction === this.direction) return false
    this.direction = direction
    this.turns++
    this.expires = now + 1700
    if (this.turns < 3) return false
    this.reset()
    return true
  }
}

export class MarioGesture {
  glovesAt?: number
  bricksAt?: number
  private spreadSince?: number
  private spreadSeen = -Infinity
  private last = -Infinity
  private shake = new ShakeDetector()

  reset() {
    this.glovesAt = this.bricksAt = this.spreadSince = undefined
    this.last = -Infinity
    this.spreadSeen = -Infinity
    this.shake.reset()
  }

  update(frame: TrackingFrame, now: number, reduced: boolean) {
    if (now - this.last > 500) { this.spreadSince = undefined; this.shake.reset() }
    this.last = now
    if (this.glovesAt === undefined) {
      const hands = (frame.hands ?? []).filter(openHand)
      const a = hands[0]?.landmarks[0], b = hands[1]?.landmarks[0]
      const nose = frame.face[1]?.x ?? .5
      const spread = a && b && Math.abs(a.x - b.x) > .16
        && Math.min(a.x, b.x) < nose - .035 && Math.max(a.x, b.x) > nose + .035
      if (!spread) {
        if (now - this.spreadSeen > 180) this.spreadSince = undefined
      }
      else {
        if (now - this.spreadSeen > 180) this.spreadSince = undefined
        this.spreadSeen = now
        this.spreadSince ??= now
        if (now - this.spreadSince >= 200) this.glovesAt = reduced ? now - gloveAssemblyMs : now
      }
      return
    }
    if (now - this.glovesAt >= gloveAssemblyMs && this.bricksAt === undefined && this.shake.update(frame)) {
      this.bricksAt = reduced ? now - brickDropMs : now
    }
  }

  stage(now: number): MarioStage {
    if (this.glovesAt === undefined) return 'spread'
    if (now - this.glovesAt < gloveAssemblyMs) return 'gloving'
    if (this.bricksAt === undefined) return 'shake'
    return now - this.bricksAt < brickDropMs ? 'dropping' : 'play'
  }
}

export interface HandPoint { x: number; y: number }
export interface HitBox { x: number; y: number; size: number }

/** A fresh upward crossing of the underside, with interpolation for fast punches. */
export function upwardHit(before: HandPoint, after: HandPoint, box: HitBox, dt: number): boolean {
  if (dt <= 0 || dt > 240 || ![before.x, before.y, after.x, after.y].every(Number.isFinite)) return false
  const dy = after.y - before.y
  if (dy >= -Math.max(2, box.size * .025) || -dy / dt < .08) return false
  const bottom = box.y + box.size
  if (before.y < bottom - box.size * .12 || after.y > bottom + box.size * .1) return false
  if (Math.hypot(after.x - before.x, dy) > box.size * 3) return false
  const t = Math.max(0, Math.min(1, (bottom - before.y) / dy))
  const x = before.x + (after.x - before.x) * t
  return x >= box.x - box.size * .12 && x <= box.x + box.size * 1.12
}
