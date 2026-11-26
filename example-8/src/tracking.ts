import type { HandLandmarkerResult } from '@mediapipe/tasks-vision'
import type { Touch } from './water'

export const FINGERTIP_INDICES = [4, 8, 12, 16, 20] as const
export interface Finger { id: number; x: number; y: number }
interface TrackedFinger extends Finger { time: number }
type Hand = { x: number; y: number; label: string; slot: number }

// Same mirrored object-fit:cover transform used by the camera shader.
// Coordinates are normalized screen coordinates, with the origin at top left.
export function cameraToScreen(x: number, y: number, vw: number, vh: number, sw: number, sh: number) {
  const scale = Math.max(sw / vw, sh / vh)
  return {
    x: ((1 - x) * vw * scale - (vw * scale - sw) / 2) / sw,
    y: (y * vh * scale - (vh * scale - sh) / 2) / sh,
  }
}

export class FingerTracker {
  private previous = new Map<number, TrackedFinger>()
  private hands: Hand[] = []

  clear() { this.previous.clear(); this.hands = [] }

  update(result: HandLandmarkerResult, now: number, vw: number, vh: number, sw: number, sh: number) {
    const hands = result.landmarks.slice(0, 2).map((landmarks, index) => ({
      x: landmarks[0]!.x, y: landmarks[0]!.y,
      label: result.handedness[index]?.[0]?.categoryName || String(index), slot: -1,
    }))
    // Match wrists to the previous frame. Model result order can change, so
    // array indices must never be used as a hand's persistent identity.
    const cost = (hand: Hand, slot: number) => {
      const previous = this.hands.find(h => h.slot === slot)
      if (!previous) return .20
      return Math.hypot(hand.x - previous.x, hand.y - previous.y) + (hand.label === previous.label ? 0 : .08)
    }
    if (hands.length === 2) {
      const swap = cost(hands[0]!, 1) + cost(hands[1]!, 0) < cost(hands[0]!, 0) + cost(hands[1]!, 1)
      hands[0]!.slot = swap ? 1 : 0; hands[1]!.slot = swap ? 0 : 1
    } else if (hands[0]) hands[0].slot = cost(hands[0], 1) < cost(hands[0], 0) ? 1 : 0

    const fingers: Finger[] = [], touches: Touch[] = []
    const next = new Map<number, TrackedFinger>()
    result.landmarks.slice(0, 2).forEach((landmarks, handIndex) => {
      FINGERTIP_INDICES.forEach((index, fingerIndex) => {
        const landmark = landmarks[index]!
        const p = cameraToScreen(landmark.x, landmark.y, vw, vh, sw, sh)
        if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return
        const id = hands[handIndex]!.slot * 5 + fingerIndex
        const previous = this.previous.get(id)
        const distance = previous ? Math.hypot((p.x - previous.x) * sw / sh, p.y - previous.y) : 0
        const continuous = Boolean(previous && now - previous.time < 180 && distance < .22)
        const alpha = Math.min(.88, .46 + distance * 8)
        const x = continuous ? previous!.x + (p.x - previous!.x) * alpha : p.x
        const y = continuous ? previous!.y + (p.y - previous!.y) * alpha : p.y
        fingers.push({ id, x, y }); next.set(id, { id, x, y, time: now })
        touches.push({ x, y, previousX: continuous ? previous!.x : x, previousY: continuous ? previous!.y : y,
          force: continuous ? .004 + Math.min(distance * .8, .07) : .055,
          radius: .009 + Math.min(distance * .10, .010) })
      })
    })
    this.previous = next; this.hands = hands
    return { fingers, touches, labels: hands.map(h => h.label), handCount: hands.length }
  }
}
