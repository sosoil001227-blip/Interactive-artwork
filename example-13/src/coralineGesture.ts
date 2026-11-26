import { clamp } from './geometry.ts'
import { NodDetector } from './gesture.ts'
import type { NodState } from './gesture.ts'
import type { Landmark, TrackedHand, TrackingFrame } from './tracking.ts'

export type CoralineStage = 'nod' | 'outfit' | 'rings' | 'buttons'
export interface CoralineStatus {
  stage: CoralineStage
  nod: NodState['phase']
  hands: 'loading' | 'unavailable' | 'ready'
  rings: number
  progress: number
}
export const initialCoraline: CoralineStatus = { stage: 'nod', nod: 'calibrating', hands: 'loading', rings: 0, progress: 0 }
export const outfitMs = 620
export const ringHoldMs = 420

const eyePairs = [[33, 133], [362, 263]] as const
const finite = (p: Landmark | undefined): p is Landmark => !!p && [p.x, p.y, p.z].every(Number.isFinite)
const metric = (p: Landmark, frame: TrackingFrame) => ({ x: p.x * frame.width, y: p.y * frame.height, z: p.z * frame.width })
const distance = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y)

export function coralineEyes(frame: TrackingFrame) {
  const indices = [10, 152, ...eyePairs.flat()]
  if (!indices.every(i => finite(frame.face[i]))) return
  const eyes = eyePairs.map(([first, second]) => {
    const a = metric(frame.face[first]!, frame), b = metric(frame.face[second]!, frame)
    return { center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }, width: distance(a, b) }
  })
  if (eyes.some(eye => eye.width < 6) || distance(eyes[0]!.center, eyes[1]!.center) < 18) return
  return eyes
}

function handRing(hand: TrackedHand, frame: TrackingFrame) {
  const landmarks = hand.landmarks
  const loop = [2, 3, 4, 8, 7, 6, 5]
  if (landmarks.length !== 21 || ![0, 9, ...loop].every(i => finite(landmarks[i]))) return
  const points = loop.map(i => metric(landmarks[i]!, frame))
  const palm = distance(metric(landmarks[0]!, frame), metric(landmarks[9]!, frame))
  if (palm < 9 || distance(points[2]!, points[3]!) > palm * .34) return
  const left = Math.min(...points.map(p => p.x)), right = Math.max(...points.map(p => p.x))
  const top = Math.min(...points.map(p => p.y)), bottom = Math.max(...points.map(p => p.y))
  const width = right - left, height = bottom - top
  const area = Math.abs(points.reduce((sum, a, i) => {
    const b = points[(i + 1) % points.length]!
    return sum + a.x * b.y - b.x * a.y
  }, 0)) / 2
  if (Math.min(width, height) < palm * .23 || area < Math.max(width * height * .28, palm * palm * .085)) return
  return { x: (right + left) / 2, y: (top + bottom) / 2, rx: width / 2, ry: height / 2 }
}

export function eyeRingMatches(frame: TrackingFrame) {
  const eyes = coralineEyes(frame)
  if (!eyes) return 0
  const matches = (frame.hands ?? []).map(hand => {
    const ring = handRing(hand, frame)
    return eyes.map(({ center, width }) => {
      if (!ring) return false
      const rx = Math.min(ring.rx + width * .36, width * 1.25)
      const ry = Math.min(ring.ry + width * .36, width * 1.25)
      return ((ring.x - center.x) / rx) ** 2 + ((ring.y - center.y) / ry) ** 2 <= 1
    })
  })
  if (matches.some(([left], i) => left && matches.some(([, right], j) => i !== j && right))) return 2
  return matches.some(match => match.some(Boolean)) ? 1 : 0
}

export class CoralineGesture {
  outfitAt?: number
  buttonsAt?: number
  private nod = new NodDetector()
  private phase: NodState['phase'] = 'calibrating'
  private hands: CoralineStatus['hands'] = 'loading'
  private received = -Infinity
  private previousFrame = -Infinity
  private rings = 0
  private hold = 0

  reset() {
    this.outfitAt = this.buttonsAt = undefined
    this.hands = 'loading'
    this.clearTracking()
  }

  clearTracking() {
    this.nod.reset()
    this.phase = 'calibrating'
    this.received = this.previousFrame = -Infinity
    this.rings = this.hold = 0
  }

  update(frame: TrackingFrame, now: number) {
    const gap = frame.timestamp - this.previousFrame
    this.previousFrame = frame.timestamp
    this.received = now
    this.hands = frame.handTracking ?? this.hands
    if (this.outfitAt === undefined) {
      if (!coralineEyes(frame)) {
        this.nod.reset()
        this.phase = 'calibrating'
        return
      }
      const state = this.nod.update(frame)
      this.phase = state.phase
      if (state.fired) this.outfitAt = now
      return
    }
    if (this.buttonsAt !== undefined || now - this.outfitAt < outfitMs) return
    const previous = this.rings
    this.rings = eyeRingMatches(frame)
    this.hold = previous === 2 && this.rings === 2 && gap > 0 && gap <= 230 ? this.hold + gap : 0
    if (this.hold >= ringHoldMs) this.buttonsAt = now
  }

  status(now: number): CoralineStatus {
    const fresh = now - this.received < 290
    const stage = this.buttonsAt !== undefined ? 'buttons' : this.outfitAt === undefined ? 'nod' : now - this.outfitAt < outfitMs ? 'outfit' : 'rings'
    return { stage, nod: fresh ? this.phase : 'calibrating', hands: this.hands,
      rings: stage === 'buttons' ? 2 : fresh ? this.rings : 0,
      progress: stage === 'buttons' ? 100 : fresh ? Math.round(clamp(this.hold / ringHoldMs) * 100) : 0 }
  }
}
