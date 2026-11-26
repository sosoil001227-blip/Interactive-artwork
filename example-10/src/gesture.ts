import type { HandLandmarkerResult } from '@mediapipe/tasks-vision'

export type Point = { x: number; y: number }
type PosePoint = Point & { z: number }
export type CornerRole = 'lower-left' | 'upper-right'
export type PoseIssue = 'confidence' | 'index' | 'thumb' | 'fold' | 'angle' | 'direction' | 'corner'
export type CornerHand = {
  label: 'Left' | 'Right'; points: Point[]; corner: Point; size: number
  index: Point; thumb: Point; valid: boolean; confidence: number
  vertical: Point; horizontal: Point
  role: CornerRole | undefined; issue: PoseIssue | undefined
}
export type JellyState = {
  x: number; y: number; radiusX: number; radiusY: number
  active: boolean; progress: number; opened: boolean; closed: boolean; burst: boolean
  reason: 'hands' | 'shape' | 'alignment' | 'hold'; hands: CornerHand[]
}
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const distance3 = (a: PosePoint, b: PosePoint) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const delta = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y })
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x

export function cameraToScreen(p: Point, vw: number, vh: number, width: number, height: number): Point {
  const scale = Math.max(width / vw, height / vh)
  return { x: (1 - p.x) * vw * scale - (vw * scale - width) / 2,
    y: p.y * vh * scale - (vh * scale - height) / 2 }
}

function straight(points: PosePoint[], chain: number[]) {
  let length = 0
  for (let i = 1; i < chain.length; i++) length += distance3(points[chain[i]!]!, points[chain[i - 1]!]!)
  return distance3(points[chain[0]!]!, points[chain[chain.length - 1]!]!) / Math.max(length, .000001)
}

function folded(points: PosePoint[], base: number, joint: number, tip: number) {
  const a = delta(points[base]!, points[joint]!), b = delta(points[tip]!, points[joint]!)
  const az = points[base]!.z - points[joint]!.z, bz = points[tip]!.z - points[joint]!.z
  const cosine = (a.x * b.x + a.y * b.y + az * bz) / Math.max(Math.hypot(a.x, a.y, az) * Math.hypot(b.x, b.y, bz), .000001)
  return cosine > -.45 || distance3(points[tip]!, points[0]!) < distance3(points[joint]!, points[0]!) * 1.12
}

// The intersection of finger axes locates the inside of the L, rather than
// anchoring the interaction to wrist or palm centers.
function fingerCorner(points: Point[], size: number): Point | undefined {
  const origin = points[5]!, a = delta(points[8]!, origin)
  const thumb = points[2]!, b = delta(points[4]!, thumb)
  const denominator = cross(a, b)
  if (Math.abs(denominator) < size * size * .08) return
  const t = cross(delta(thumb, origin), b) / denominator
  const corner = { x: origin.x + a.x * t, y: origin.y + a.y * t }
  if (distance(corner, origin) > size * 1.25 || distance(corner, thumb) > size * 1.5) return
  return corner
}

export function readCorners(result: HandLandmarkerResult, vw: number, vh: number, width: number, height: number): CornerHand[] {
  if (Math.min(vw, vh, width, height) <= 0) return []
  const hands: CornerHand[] = []
  for (let i = 0; i < Math.min(result.landmarks.length, 2); i++) {
    const landmarks = result.landmarks[i]!, category = result.handedness[i]?.[0]
    if (landmarks.length !== 21 || !category || !['Left', 'Right'].includes(category.categoryName)
      || landmarks.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) continue
    const points = landmarks.map(p => cameraToScreen(p, vw, vh, width, height))
    const size = Math.max(distance(points[0]!, points[9]!), distance(points[5]!, points[17]!) * .8)
    if (size < 12) continue
    const world = result.worldLandmarks?.[i]
    const metric: PosePoint[] = world?.length === 21 && world.every(p => [p.x, p.y, p.z].every(Number.isFinite))
      ? world : landmarks.map(p => ({ x: p.x, y: p.y * vh / vw, z: p.z || 0 }))
    const metricSize = Math.max(distance3(metric[0]!, metric[9]!), distance3(metric[5]!, metric[17]!) * .8, .000001)
    const index = delta(points[8]!, points[5]!), thumb = delta(points[4]!, points[2]!)
    const indexLength = Math.hypot(index.x, index.y), thumbLength = Math.hypot(thumb.x, thumb.y)
    const cosine = (index.x * thumb.x + index.y * thumb.y) / Math.max(indexLength * thumbLength, .001)
    const corner = fingerCorner(points, size)
    const curled = [[9, 10, 12], [13, 14, 16], [17, 18, 20]].filter(([a, b, c]) => folded(metric, a!, b!, c!)).length
    // Classify the visible brackets, independently of MediaPipe's handedness
    // convention. Mirroring or a noisy left/right label must not reject a
    // correctly framed ㄴ / ㄱ pair.
    const indexUp = -index.y / Math.max(indexLength, .001), indexRight = index.x / Math.max(indexLength, .001)
    const thumbUp = -thumb.y / Math.max(thumbLength, .001), thumbRight = thumb.x / Math.max(thumbLength, .001)
    // Either finger may form either leg. In particular, ㄱ is commonly made
    // with the index pointing left and the thumb pointing down.
    const role: CornerRole | undefined = (indexUp > .60 && thumbRight > .60) || (thumbUp > .60 && indexRight > .60) ? 'lower-left'
      : (indexUp < -.60 && thumbRight < -.60) || (thumbUp < -.60 && indexRight < -.60) ? 'upper-right' : undefined
    const indexVertical = Math.abs(indexUp) >= Math.abs(thumbUp)
    // Use 3D articulation when available so natural bends and foreshortening
    // do not turn an extended finger into a false 2D fold.
    const issue: PoseIssue | undefined = category.score < .5 ? 'confidence'
      : distance3(metric[8]!, metric[5]!) < metricSize * .5 || straight(metric, [5, 6, 7, 8]) < .78 || indexLength < size * .35 ? 'index'
      : distance3(metric[4]!, metric[2]!) < metricSize * .35 || straight(metric, [2, 3, 4]) < .72 || thumbLength < size * .25 ? 'thumb'
      : curled < 2 ? 'fold'
      : Math.abs(cosine) > .65 ? 'angle'
      : !role ? 'direction'
      : !corner ? 'corner' : undefined
    const valid = issue === undefined
    hands.push({ label: category.categoryName as CornerHand['label'], points, corner: corner ?? points[5]!,
      size, index: points[8]!, thumb: points[4]!, valid, confidence: category.score, role, issue,
      vertical: points[indexVertical ? 8 : 4]!, horizontal: points[indexVertical ? 4 : 8]! })
  }
  return hands
}

export function readGap(hands: CornerHand[]) {
  if (hands.length !== 2) return
  const left = hands.find(hand => hand.role === 'lower-left'), right = hands.find(hand => hand.role === 'upper-right')
  if (!left?.valid || !right?.valid) return
  const width = right.corner.x - left.corner.x, height = left.corner.y - right.corner.y
  const size = (left.size + right.size) / 2
  const tolerance = size * .85 + height * .25
  // Opposite corners must frame the same empty area: crossed, parallel or
  // vertically unrelated L shapes cannot open the portal.
  if (width < size * .85 || height < size * .5 || width < height * .55
    || distance(left.points[0]!, right.points[0]!) < size * .8
    || Math.abs(left.vertical.y - right.horizontal.y) > tolerance
    || Math.abs(right.vertical.y - left.horizontal.y) > tolerance
    || left.horizontal.x <= left.corner.x || left.horizontal.x > right.corner.x + size * .25
    || right.horizontal.x >= right.corner.x || right.horizontal.x < left.corner.x - size * .25) return
  return { x: (left.corner.x + right.corner.x) / 2, y: (left.corner.y + right.corner.y) / 2,
    radiusX: width * .40, radiusY: Math.min(height * .39, width * .35) }
}

export class JellyGesture {
  private alignedSince: number | undefined
  private openedAt = 0
  private lastBurst = 0
  private lastTime: number | undefined
  private active = false
  private center = { x: 0, y: 0, radiusX: 0, radiusY: 0 }

  reset() { this.alignedSince = undefined; this.lastTime = undefined; this.active = false; this.openedAt = this.lastBurst = 0 }

  update(hands: CornerHand[], now: number): JellyState {
    const elapsed = this.lastTime === undefined ? 33 : now - this.lastTime
    const interrupted = elapsed > 250 || elapsed < 0
    this.lastTime = now
    const gap = readGap(hands)
    let opened = false, closed = false, burst = false, progress = 0
    if (!gap || interrupted) {
      closed = this.active; this.active = false; this.alignedSince = undefined
      this.openedAt = this.lastBurst = 0
    } else {
      const fresh = this.alignedSince === undefined
      if (fresh) this.alignedSince = now
      const alpha = fresh ? 1 : 1 - Math.exp(-Math.max(0, elapsed) / 65)
      for (const key of ['x', 'y', 'radiusX', 'radiusY'] as const) this.center[key] += (gap[key] - this.center[key]) * alpha
      if (!this.active && now - this.alignedSince! >= 180) {
        this.active = true; this.openedAt = this.lastBurst = now; opened = true
      }
      if (this.active) {
        const interval = this.lastBurst === this.openedAt ? 1900 : 3200
        progress = Math.min(1, (now - this.lastBurst) / interval)
        if (progress >= 1) { burst = true; this.lastBurst = now; progress = 0 }
      } else progress = Math.min(1, (now - this.alignedSince!) / 180) * .08
    }
    const reason = hands.length !== 2 ? 'hands' : hands.some(h => !h.valid) ? 'shape' : !gap ? 'alignment' : 'hold'
    return { ...this.center, hands, active: this.active, progress, opened, closed, burst, reason }
  }
}
