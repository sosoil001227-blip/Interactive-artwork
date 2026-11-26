import type { Landmark, TrackedHand, TrackingFrame } from './tracking.ts'
import { faceOval, fitBody, personAlpha, personMask, projectedFaceOutline } from './conanFit.ts'
import { clamp } from './geometry.ts'

export type CrayonTool = 'peach' | 'ink' | 'red'
export type ShinchanStage = 'arriving' | 'lifting' | 'searching' | 'offering' | 'drawing'
export type PaintPart = 'face' | 'hair' | 'brow-left' | 'brow-right' | 'eye-left' | 'eye-right' | 'mouth' | 'shirt'
export interface Point { x: number; y: number }
export interface PaintSpace { origin: Point; across: Point; down: Point }
export interface PaintTarget { id: PaintPart; tool: CrayonTool; x: number; y: number; rx: number; ry: number; outline: Point[] }
export interface ShinchanStatus {
  stage: ShinchanStage; tool: CrayonTool; holding: boolean; drawing: boolean
  hands: number; painted: number; face: boolean; body: 'loading' | 'unavailable' | 'missing' | 'ready'
}
export const paintParts: readonly PaintPart[] = ['face', 'hair', 'brow-left', 'brow-right', 'eye-left', 'eye-right', 'mouth', 'shirt']
export const shinchanOfferMs = 5600
export const crayonColors = { peach: '#f8bf88', ink: '#17100e', red: '#f51636' } as const
const finite = (p: Point | undefined): p is Point => !!p && Number.isFinite(p.x) && Number.isFinite(p.y)
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const point = (p: Landmark, frame: TrackingFrame): Point => ({ x: (1 - p.x) * frame.width, y: p.y * frame.height })

export function inPaintSpace(p: Point, space: PaintSpace): Point {
  const x = p.x - space.origin.x, y = p.y - space.origin.y
  const determinant = space.across.x * space.down.y - space.across.y * space.down.x
  return { x: (x * space.down.y - y * space.down.x) / determinant,
    y: (y * space.across.x - x * space.across.y) / determinant }
}
export function fromPaintSpace(p: Point, space: PaintSpace): Point {
  return { x: space.origin.x + p.x * space.across.x + p.y * space.down.x,
    y: space.origin.y + p.x * space.across.y + p.y * space.down.y }
}

export function shinchanLayout(width: number, height: number) {
  const scale = Math.min(width * .24 / 200, height * .34 / 270)
  const x = Math.max(width * .025, 8), y = height - Math.max(height * .025, 8) - 254 * scale
  return { x, y, scale, pickup: { x: x + 178 * scale, y: y + 49 * scale },
    radius: Math.max(29 * scale, Math.min(width, height) * .065) }
}

export function shinchanStage(elapsed: number, holding: boolean): ShinchanStage {
  return holding ? 'drawing' : elapsed < 1000 ? 'arriving' : elapsed < 2400 ? 'lifting'
    : elapsed < 4400 ? 'searching' : 'offering'
}

const browShape: readonly Point[] = [
  { x: -.99, y: .33 }, { x: -.98, y: .04 }, { x: -.84, y: -.27 }, { x: -.53, y: -.69 },
  { x: -.22, y: -.94 }, { x: .02, y: -1 }, { x: .21, y: -.84 }, { x: .46, y: -.45 },
  { x: .83, y: .04 }, { x: .99, y: .35 }, { x: .96, y: .63 }, { x: .76, y: .80 },
  { x: .54, y: .75 }, { x: .35, y: .55 }, { x: -.03, y: .03 }, { x: -.51, y: .61 },
  { x: -.74, y: .74 }, { x: -.91, y: .64 },
]
const eyeShape = Array.from({ length: 48 }, (_, i) => {
  const angle = i / 48 * 2 * Math.PI
  return { x: Math.cos(angle), y: Math.sin(angle) }
})

function roundedOutline(points: readonly (readonly [number, number])[]) {
  let outline = points.map(([x, y]) => ({ x, y }))
  for (let pass = 0; pass < 2; pass++) {
    outline = outline.flatMap((a, i) => {
      const b = outline[(i + 1) % outline.length]!
      return [midpoint(a, midpoint(a, b)), midpoint(midpoint(a, b), b)]
    })
  }
  return outline
}

const headTop = [[-.55, -.12], [-.51, -.31], [-.41, -.49], [-.24, -.59], [-.01, -.63], [.26, -.60],
  [.44, -.52], [.55, -.34], [.57, -.12]] as const
const headOutline = roundedOutline([...headTop, [.64, -.18], [.73, -.12], [.75, .04], [.70, .17], [.58, .19],
  [.53, .32], [.41, .45], [.22, .54], [-.08, .57], [-.42, .53], [-.65, .42], [-.76, .24], [-.77, .05], [-.68, -.10]])
const hairOutline = roundedOutline([...headTop, [.52, .015], [.48, -.09], [.44, -.28], [.32, -.44],
  [.12, -.49], [-.13, -.50], [-.31, -.44], [-.43, -.31], [-.49, -.165], [-.54, -.07]])

function outlineTarget(id: PaintPart, tool: CrayonTool, outline: Point[]): PaintTarget {
  const left = Math.min(...outline.map(p => p.x)), right = Math.max(...outline.map(p => p.x))
  const top = Math.min(...outline.map(p => p.y)), bottom = Math.max(...outline.map(p => p.y))
  return { id, tool, x: (left + right) / 2, y: (top + bottom) / 2, rx: (right - left) / 2, ry: (bottom - top) / 2, outline }
}

function faceGuide(center: Point, rx: number, ry: number, shape: readonly Point[], oval: Point[]) {
  return shape.map(p => {
    const x = center.x + p.x * rx, y = center.y + p.y * ry
    const edges: number[] = []
    for (const [i, a] of oval.entries()) {
      const b = oval[(i + 1) % oval.length]!
      if ((a.y > y) !== (b.y > y)) edges.push(a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y))
    }
    return edges.length >= 2 ? { x: clamp(x, Math.min(...edges) + .008, Math.max(...edges) - .008), y } : { x, y }
  })
}

function insideOutline(outline: readonly Point[], point: Point) {
  let inside = false
  for (const [i, a] of outline.entries()) {
    const b = outline[(i + 1) % outline.length]!
    if ((a.y > point.y) !== (b.y > point.y) && point.x < a.x + (b.x - a.x) * (point.y - a.y) / (b.y - a.y)) inside = !inside
  }
  return inside
}

export function paintAnchors(frame: TrackingFrame) {
  let face: PaintSpace | undefined, body: PaintSpace | undefined
  const targets: PaintTarget[] = []
  const f = frame.face
  if ([10, 152, 234, 454, 33, 133, 263, 362].every(i => finite(f[i]))) {
    const top = point(f[10]!, frame), chin = point(f[152]!, frame)
    const sides = [point(f[234]!, frame), point(f[454]!, frame)].sort((a, b) => a.x - b.x)
    const a = sides[0]!, b = sides[1]!, width = distance(a, b), height = distance(top, chin)
    if (width > 18 && height > 22) {
      face = { origin: midpoint(top, chin), across: { x: b.x - a.x, y: b.y - a.y },
        down: { x: -(b.y - a.y) / width * height, y: (b.x - a.x) / width * height } }
      const eyes = [[33, 133], [263, 362]].map(([a, b]) => inPaintSpace(midpoint(point(f[a!]!, frame), point(f[b!]!, frame)), face!)).sort((a, b) => a.x - b.x)
      const oval = faceOval.every(i => finite(f[i])) ? faceOval.map(i => inPaintSpace(point(f[i]!, frame), face!)) : []
      const separation = eyes[1]!.x - eyes[0]!.x
      const center = midpoint(eyes[0]!, eyes[1]!)
      targets.push(outlineTarget('face', 'peach', headOutline), outlineTarget('hair', 'ink', hairOutline))
      for (const [index, anchor] of eyes.entries()) {
        const side = index === 0 ? 'left' : 'right'
        const eye = { x: anchor.x + (anchor.x - center.x) * .10, y: anchor.y + .016 }
        const brow = { x: eye.x, y: Math.max(-.393, anchor.y - .195) }
        const eyeWidth = clamp(separation * .47 + .010, .12, .205)
        const browWidth = clamp(separation * .49 + .012, .13, .218)
        targets.push(
          { id: `brow-${side}`, tool: 'ink', ...brow, rx: browWidth, ry: .093, outline: faceGuide(brow, browWidth, .093, browShape, oval) },
          { id: `eye-${side}`, tool: 'ink', ...eye, rx: eyeWidth, ry: .138, outline: faceGuide(eye, eyeWidth, .138, eyeShape, oval) },
        )
      }
      const lips = finite(f[13]) && finite(f[14]) ? inPaintSpace(midpoint(point(f[13], frame), point(f[14], frame)), face) : { x: 0, y: .24 }
      const mouth = { x: clamp(lips.x - .24, -.38, -.14), y: clamp(lips.y + .075, .19, .34) }
      const mouthShape = eyeShape.map(({ x, y }) => ({ x: mouth.x + x * .155 + y * .055, y: mouth.y + y * .142 }))
      targets.push(outlineTarget('mouth', 'ink', mouthShape))
    }
  }
  const torso = fitBody(frame, p => ({ ...p, x: frame.width - p.x }))
  if (torso) {
    const [a, b] = torso.left.x <= torso.right.x ? [torso.left, torso.right] : [torso.right, torso.left]
    const origin = midpoint(a, b), waist = midpoint(torso.leftHip, torso.rightHip)
    body = { origin, across: { x: (b.x - a.x) / 2, y: (b.y - a.y) / 2 }, down: { x: waist.x - origin.x, y: waist.y - origin.y } }
    const outline = torso.outline.map(p => inPaintSpace(p, body!))
    targets.push(outlineTarget('shirt', 'red', outline))
  }
  return { face, body, targets }
}

export function crayonPinch(hand: TrackedHand, frame: TrackingFrame): number {
  const metric = hand.worldLandmarks.length === 21 && hand.worldLandmarks.every(p => finite(p) && Number.isFinite(p.z))
    && Math.hypot(hand.worldLandmarks[0]!.x - hand.worldLandmarks[9]!.x, hand.worldLandmarks[0]!.y - hand.worldLandmarks[9]!.y, hand.worldLandmarks[0]!.z - hand.worldLandmarks[9]!.z) > .005
  const p = metric ? hand.worldLandmarks : hand.landmarks
  const d = (a: number, b: number) => Math.hypot((p[a]!.x - p[b]!.x) * (metric ? 1 : frame.width),
    (p[a]!.y - p[b]!.y) * (metric ? 1 : frame.height), (p[a]!.z - p[b]!.z) * (metric ? 1 : frame.width))
  return d(4, 8) / (d(0, 9) || .001)
}

export class ShinchanGesture {
  holding = false
  tool: CrayonTool = 'peach'
  progress = Object.fromEntries(paintParts.map(id => [id, 0])) as Record<PaintPart, number>
  cursor?: Point
  drawing = false
  hands = 0
  private activeHand?: { label: TrackedHand['label']; palm: Point }
  private pickup?: { label: TrackedHand['label']; since: number; seen: number }
  private lastSeen = -Infinity
  private lastFrame = -Infinity
  private pinched = false
  private previous?: { point: Point; local: Point; part: PaintPart }

  reset() { this.holding = false; this.tool = 'peach'; this.clearTracking(); this.clearDrawing() }
  clearTracking() {
    this.cursor = undefined; this.drawing = false; this.hands = 0; this.pickup = undefined
    this.pinched = false; this.activeHand = this.previous = undefined; this.lastSeen = this.lastFrame = -Infinity
  }
  clearDrawing() { for (const id of paintParts) this.progress[id] = 0; this.previous = undefined }
  select(tool: CrayonTool) { this.tool = tool; this.drawing = this.pinched = false; this.previous = undefined }
  fresh(now: number) { return now - this.lastFrame < 280 }

  update(frame: TrackingFrame, now: number, offered: boolean, anchors = paintAnchors(frame)) {
    const hands = (frame.hands ?? []).filter(h => h.landmarks.length === 21 && h.landmarks.every(p => finite(p) && Number.isFinite(p.z)))
    this.hands = hands.length; this.lastFrame = now
    const layout = shinchanLayout(frame.width, frame.height)
    if (!this.holding && offered) {
      const reaching = hands.filter(h => [h.landmarks[8]!, h.landmarks[9]!, h.landmarks[4]!].some(p => distance(point(p, frame), layout.pickup) <= layout.radius))
      const candidate = reaching.find(h => h.label === this.pickup?.label) ?? reaching[0]
      if (!candidate) this.pickup = undefined
      else {
        if (!this.pickup || this.pickup.label !== candidate.label || now - this.pickup.seen > 180) this.pickup = { label: candidate.label, since: now, seen: now }
        this.pickup.seen = now
        if (now - this.pickup.since >= 160) {
          this.holding = true
          this.activeHand = { label: candidate.label, palm: point(candidate.landmarks[9]!, frame) }
        }
      }
    }
    if (!this.holding || !hands.length) {
      this.cursor = this.activeHand = this.previous = undefined
      this.drawing = this.pinched = false
      return
    }
    const basis = this.tool === 'red' ? anchors.body : anchors.face
    const shirt = this.tool === 'red'
    const mask = shirt && personMask(frame)?.alpha.some(alpha => alpha >= 105)
    const face = shirt && projectedFaceOutline(frame, p => ({ ...p, x: frame.width - p.x }))
    const canPaint = (p: Point) => (!mask || personAlpha(frame, frame.width - p.x, p.y) >= 105) && (!face || !insideOutline(face, p))
    const candidates = hands.map(hand => {
      const tip = point(hand.landmarks[8]!, frame), palm = point(hand.landmarks[9]!, frame)
      const local = basis ? inPaintSpace(tip, basis) : undefined
      const targets = local && canPaint(tip) ? anchors.targets.filter(t => t.tool === this.tool && insideOutline(t.outline, local)) : []
      const target = targets.find(t => this.progress[t.id] < 1) ?? targets[0]
      return { label: hand.label, tip, palm, local, target, pinch: crayonPinch(hand, frame) }
    })
    const active = now - this.lastSeen <= 180 ? this.activeHand : undefined
    const maxMove = Math.min(frame.width, frame.height) * .16
    const continuing = active && candidates.filter(hand => hand.label === active.label && distance(hand.palm, active.palm) <= maxMove)
      .sort((a, b) => distance(a.palm, active.palm) - distance(b.palm, active.palm))[0]
    const hand = continuing?.target && (continuing.pinch < .55 || this.pinched && continuing.pinch <= .8) ? continuing
      : candidates.find(h => h.target && h.pinch < .55) ?? candidates.find(h => h.pinch < .55) ?? continuing ?? candidates[0]!
    const sameHand = hand === continuing
    const previous = sameHand ? this.previous : undefined
    const { target, local } = hand
    this.activeHand = { label: hand.label, palm: hand.palm }
    this.cursor = hand.tip
    this.lastSeen = now
    this.pinched = hand.pinch < .55 || sameHand && this.pinched && hand.pinch <= .8
    this.drawing = false; this.previous = undefined
    if (!this.pinched || !target || !local) return
    this.drawing = true; this.previous = { point: hand.tip, local, part: target.id }
    if (!previous || previous.part !== target.id || !basis) return
    const middle = midpoint(previous.local, local)
    if (!insideOutline(target.outline, previous.local) || !insideOutline(target.outline, middle)
      || !canPaint(fromPaintSpace(previous.local, basis)) || !canPaint(fromPaintSpace(middle, basis))) return
    // Reject tracking jumps and stationary pinches instead of connecting them across the face.
    if (distance(previous.point, hand.tip) > maxMove) return
    const travel = distance(previous.local, local)
    if (travel < .004 || travel > .5) return
    const fillDistance = target.id === 'face' ? 1.7 : target.id === 'shirt' ? 1.55 : .42
    this.progress[target.id] = Math.min(1, this.progress[target.id] + travel / fillDistance)
  }
}
