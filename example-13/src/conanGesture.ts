import type { Landmark, TrackedHand, TrackingFrame } from './tracking.ts'

export const conanSceneMs = 9800
export const conanLines = ['내 이름은 코난, 탐정이죠.', '범인은 바로 당신이야!', '진실은 언제나 하나!'] as const
export type ConanStage = 'glasses' | 'collar' | 'point' | 'reveal'
export interface ConanStatus { stage: ConanStage; glasses: boolean; suit: boolean; hands: number; leftPoint: boolean; reveals: number; body?: 'loading'|'ready'|'missing'|'unavailable' }

const finite = (point: Landmark) => [point.x, point.y, point.z].every(Number.isFinite)
export function usableHand(hand: TrackedHand) { return hand.landmarks.length === 21 && hand.landmarks.every(finite) }

/** Uses depth as well as finger extension, so a finger aimed at the lens can be foreshortened. */
export function leftIndexAtCamera(hand: TrackedHand): boolean {
  if (hand.label !== 'Left' || !usableHand(hand)) return false
  const world = hand.worldLandmarks
  const metric = world.length === 21 && world.every(finite)
    && Math.hypot(world[0]!.x - world[9]!.x, world[0]!.y - world[9]!.y, world[0]!.z - world[9]!.z) > .005
  const p = metric ? world : hand.landmarks
  const distance = (a: number, b: number) => Math.hypot(p[a]!.x - p[b]!.x, p[a]!.y - p[b]!.y, p[a]!.z - p[b]!.z)
  const palm = distance(0, 9)
  if (palm < .008) return false
  const a = p[5]!, b = p[6]!, tip = p[8]!
  const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }
  const v = { x: tip.x - b.x, y: tip.y - b.y, z: tip.z - b.z }
  const straight = (u.x * v.x + u.y * v.y + u.z * v.z) / (Math.hypot(u.x, u.y, u.z) * Math.hypot(v.x, v.y, v.z) || 1)
  if (straight < .15 || distance(5, 8) < palm * .55) return false
  let curled = 0
  for (const [mcp, pip, end] of [[9, 10, 12], [13, 14, 16], [17, 18, 20]]) {
    if (distance(mcp!, end!) < palm * .9 && distance(0, end!) < distance(0, pip!) * 1.2) curled++
  }
  // The input image is unmirrored; the SDK labels refer to the user's actual hand.
  const depth = b.z - tip.z
  const image=hand.landmarks,imagePalm=Math.hypot(image[0]!.x-image[9]!.x,image[0]!.y-image[9]!.y,image[0]!.z-image[9]!.z)
  const depthSupported = depth > palm * .10 && depth / (distance(6, 8) || 1) > .20
    || image[6]!.z-image[8]!.z > imagePalm*.14
  return curled >= 2 && depthSupported
}

interface Touch { y: number; at: number; seen: number }
interface CollarRegion { x: number; y: number; width: number; height: number }
export class ConanGesture {
  glassesAt?: number
  suitAt?: number
  revealAt?: number
  reveals = 0
  private bridge = new Map<string, Touch>()
  private collarSince?: number
  private collarSeen = -Infinity
  private pointSince?: number
  private pointSeen=-Infinity
  private pointReleased = true
  private last = -Infinity
  private seen = -Infinity
  private hands = 0
  private leftPoint = false

  reset() {
    this.glassesAt = this.suitAt = this.revealAt = this.collarSince = this.pointSince = undefined
    this.reveals = 0; this.bridge.clear(); this.collarSeen = this.last = this.seen = -Infinity
    this.hands = 0; this.leftPoint = false; this.pointReleased = true
    this.pointSeen=-Infinity
  }

  update(frame: TrackingFrame, now: number, collarRegion?: CollarRegion) {
    const hands = (frame.hands ?? []).filter(usableHand)
    this.hands = hands.length; this.seen = now
    if (now - this.last > 450) {
      this.bridge.clear(); this.collarSince = this.pointSince = undefined
      this.pointReleased = true
    }
    this.last = now
    this.leftPoint = hands.some(leftIndexAtCamera)
    const face = frame.face
    const top = face[10], chin = face[152], nose = face[168] ?? face[6] ?? face[1], left = face[234], right = face[454]
    if (top && chin && nose && left && right && [top, chin, nose, left, right].every(finite)) {
      const height = Math.abs(chin.y - top.y), width = Math.abs(right.x - left.x)
      if (height > .07 && width > .05) {
        let collar = false
        for (const hand of hands) {
          for (const index of [8, 12]) {
            const p = hand.landmarks[index]!, key = `${hand.label}:${index}`
            const near = Math.abs(p.x - nose.x) < width * .46 && Math.abs(p.y - nose.y) < height * .24
            if (this.glassesAt === undefined && near) {
              const touch = this.bridge.get(key)
              if (!touch || now - touch.seen > 180 || now - touch.at > 1800) this.bridge.set(key, { y: p.y, at: now, seen: now })
              else {
                touch.seen = now
                if (touch.y - p.y >= height * .055 && now - touch.at >= 60 && now - touch.at < 1800) this.glassesAt = now
              }
            } else if (!near) this.bridge.delete(key)
          }
          const tip = hand.landmarks[8]!, thumb = hand.landmarks[4]!
          const nearNeck = [tip, thumb].some(p => {
            if (p.y <= chin.y + height * .015) return false
            if (collarRegion && collarRegion.y > chin.y - height * .04 && collarRegion.y < chin.y + height * .82) {
              return Math.abs(p.x - collarRegion.x) < Math.max(collarRegion.width * .62, width * .38)
                && p.y > collarRegion.y - collarRegion.height * .42 && p.y < collarRegion.y + collarRegion.height * .9
            }
            return Math.abs(p.x - chin.x) < width * .53 && p.y < chin.y + height * .62
          })
          if (nearNeck && Math.hypot(tip.x - thumb.x, tip.y - thumb.y) < width * .55) collar = true
        }
        if (collar && this.suitAt === undefined) {
          if (now - this.collarSeen > 180) this.collarSince = now
          this.collarSince ??= now; this.collarSeen = now
          if (now - this.collarSince >= 170) this.suitAt = now
        } else if (now - this.collarSeen > 180) this.collarSince = undefined
      }
    } else {
      this.bridge.clear(); this.collarSince = undefined
    }
    for (const [key, touch] of this.bridge) if (now - touch.seen > 180) this.bridge.delete(key)
    if (!this.leftPoint) { if(now-this.pointSeen>180)this.pointSince = undefined; this.pointReleased = true }
    else this.pointSeen=now
    if (this.glassesAt === undefined || this.suitAt === undefined || !this.leftPoint) return
    if (now - Math.max(this.glassesAt, this.suitAt) < 500) return
    if (this.revealAt !== undefined && now - this.revealAt < conanSceneMs) return
    if (!this.pointReleased) return
    this.pointSince ??= now
    if (now - this.pointSince >= 150) {
      this.trigger(now)
    }
  }

  trigger(now:number) {
    if(this.glassesAt===undefined || this.suitAt===undefined || (this.revealAt!==undefined && now-this.revealAt<conanSceneMs))return false
    this.revealAt=now;this.reveals++;this.pointSince=undefined;this.pointReleased=false
    return true
  }

  status(now: number): ConanStatus {
    const stage: ConanStage = this.revealAt !== undefined && now - this.revealAt < conanSceneMs ? 'reveal'
      : this.glassesAt === undefined ? 'glasses' : this.suitAt === undefined ? 'collar' : 'point'
    return { stage, glasses: this.glassesAt !== undefined, suit: this.suitAt !== undefined,
      hands: now - this.seen < 450 ? this.hands : 0, leftPoint: now - this.seen < 450 && this.leftPoint, reveals: this.reveals }
  }
}
