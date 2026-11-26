import type { HandLandmarkerResult } from '@mediapipe/tasks-vision'

export type Point = { x: number; y: number }
export type Joint = Point & { z: number }
export type HandPose = { points: Joint[]; center: Point; size: number; label: string; seen: number }
export type Hands = { left?: HandPose; right?: HandPose }
export const TIPS = [4, 8, 12, 16, 20] as const
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

export function cameraToScreen(point: Joint, vw: number, vh: number, width: number, height: number): Joint {
  const scale = Math.max(width / vw, height / vh)
  return { x: (1 - point.x) * vw * scale - (vw * scale - width) / 2,
    y: point.y * vh * scale - (vh * scale - height) / 2, z: point.z * vw * scale }
}

function readHands(result: HandLandmarkerResult, vw: number, vh: number, width: number, height: number, now: number) {
  if (Math.min(vw, vh, width, height) <= 0) return []
  const hands: HandPose[] = []
  for (let i = 0; i < Math.min(2, result.landmarks.length); i++) {
    const source = result.landmarks[i]!, category = result.handedness[i]?.[0]
    if (source.length !== 21 || (category && category.score < .45) || source.some(p => ![p.x, p.y, p.z].every(Number.isFinite))) continue
    const points = source.map(p => cameraToScreen(p, vw, vh, width, height))
    const center = [0, 5, 9, 13, 17].reduce((sum, index) => ({ x: sum.x + points[index]!.x / 5, y: sum.y + points[index]!.y / 5 }), { x: 0, y: 0 })
    const size = Math.max(12, distance(points[0]!, points[9]!), distance(points[5]!, points[17]!) * .9)
    hands.push({ points, center, size, label: category?.categoryName ?? '', seen: now })
  }
  return hands
}

export class HandStabilizer {
  private hands: Hands = {}
  private labels: { left?: string; right?: string } = {}

  reset() { this.hands = {}; this.labels = {} }

  snapshot(now: number): Hands {
    return { left: this.hands.left && now - this.hands.left.seen <= 220 ? this.hands.left : undefined,
      right: this.hands.right && now - this.hands.right.seen <= 220 ? this.hands.right : undefined }
  }

  update(result: HandLandmarkerResult, vw: number, vh: number, width: number, height: number, now: number) {
    const candidates = readHands(result, vw, vh, width, height, now)
    const cost = (hand: HandPose, role: keyof Hands) => {
      const previous = this.hands[role]
      const recent = previous && now - previous.seen < 1000
      const target = recent ? previous.center : { x: width * (role === 'left' ? .27 : .73), y: height * .35 }
      const label = this.labels[role]
      const other = this.labels[role === 'left' ? 'right' : 'left']
      const mismatch = label && label !== other && hand.label && label !== hand.label ? .12 : 0
      return (distance(hand.center, target) / Math.max(width, height)) ** 2 + mismatch
    }
    const assigned: Hands = {}
    if (candidates.length === 2) {
      const [a, b] = candidates as [HandPose, HandPose]
      const reverse = cost(a, 'right') + cost(b, 'left') < cost(a, 'left') + cost(b, 'right')
      assigned.left = reverse ? b : a; assigned.right = reverse ? a : b
    } else if (candidates[0]) {
      const hand = candidates[0]
      assigned[cost(hand, 'left') <= cost(hand, 'right') ? 'left' : 'right'] = hand
    }
    for (const role of ['left', 'right'] as const) {
      const hand = assigned[role]
      if (!hand) continue
      const previous = this.hands[role]
      if (previous && now > previous.seen && now - previous.seen < 250
        && distance(previous.center, hand.center) < Math.max(width, height) * .45) {
        const dt = (now - previous.seen) / 1000
        hand.points = hand.points.map((p, i) => {
          const old = previous.points[i]!
          const speed = distance(p, old) / dt
          const tau = .014 + .055 / (1 + speed / 220)
          const alpha = 1 - Math.exp(-dt / tau)
          return { x: old.x + (p.x - old.x) * alpha, y: old.y + (p.y - old.y) * alpha, z: old.z + (p.z - old.z) * alpha }
        })
        hand.center = [0, 5, 9, 13, 17].reduce((sum, index) => ({ x: sum.x + hand.points[index]!.x / 5, y: sum.y + hand.points[index]!.y / 5 }), { x: 0, y: 0 })
        hand.size = previous.size + (hand.size - previous.size) * (1 - Math.exp(-dt / .08))
      }
      this.hands[role] = hand
      if (hand.label) this.labels[role] = hand.label
    }
    return this.snapshot(now)
  }
}
