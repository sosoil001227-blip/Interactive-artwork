import { clamp } from './geometry.ts'
import { pitchOf } from './gesture.ts'
import type { TrackingFrame } from './tracking.ts'

export interface BoStatus {
  stage: 'calibrating' | 'ready' | 'blushing' | 'transforming' | 'bo'
  progress: number; puff: number; tracked: boolean; frontal: boolean
}
export const initialBo: BoStatus = { stage: 'calibrating', progress: 0, puff: 0, tracked: false, frontal: true }
interface Cheeks {
  left: number; right: number; width: number; depth: number
  outlineLeft: number; outlineRight: number; lipWidth: number; mouth: number; yaw: number; pitch: number
}
const cheekEdges = [[93, 323], [132, 361], [58, 288], [172, 397]] as const
const required = [1, 10, 13, 14, 33, 61, 133, 152, 168, 205, 234, 263, 291, 362, 425, 454]
export function boCheeks(frame: TrackingFrame): Cheeks | undefined {
  const f = frame.face
  if (!required.every(i => f[i] && [f[i]!.x, f[i]!.y, f[i]!.z].every(Number.isFinite))) return
  const distance = (a: number, b: number) => Math.hypot((f[a]!.x - f[b]!.x) * frame.width,
    (f[a]!.y - f[b]!.y) * frame.height, (f[a]!.z - f[b]!.z) * frame.width)
  const eyeSpan = distance(33, 263), height = distance(10, 152)
  if (eyeSpan < 24 || height < 40) return
  const eyeX = (f[263]!.x - f[33]!.x) * frame.width, eyeY = (f[263]!.y - f[33]!.y) * frame.height
  const eyeWidth = Math.hypot(eyeX, eyeY)
  if (eyeWidth < 20) return
  const lateral = (a: number, b: number) => ((f[a]!.x - f[b]!.x) * frame.width * eyeX
    + (f[a]!.y - f[b]!.y) * frame.height * eyeY) / (eyeWidth * eyeWidth)
  // Lower cheek outlines often move even when the model's cheekPuff score and inner landmarks barely change.
  const edges = cheekEdges.filter(pair => pair.every(i => f[i] && Number.isFinite(f[i]!.x) && Number.isFinite(f[i]!.y)))
  const outline = (side: 0 | 1) => edges.reduce((sum, pair) => sum + Math.abs(lateral(pair[side], 1)), 0) / (edges.length || 1)
  return { left: distance(205, 1) / eyeSpan, right: distance(425, 1) / eyeSpan,
    width: distance(234, 454) / eyeSpan,
    depth: (f[168]!.z - (f[205]!.z + f[425]!.z) / 2) * frame.width / eyeSpan,
    outlineLeft: outline(0), outlineRight: outline(1), lipWidth: Math.abs(lateral(61, 291)), mouth: distance(13, 14) / height,
    yaw: (f[1]!.x - (f[234]!.x + f[454]!.x) / 2) * frame.width / eyeSpan,
    pitch: pitchOf(frame) ?? 0 }
}

export class BoGesture {
  progress = 0
  private baseline?: Cheeks
  private samples: Cheeks[] = []
  private neutralMs = 0
  private last = -Infinity
  private seen = -Infinity
  private puff = 0
  private hold = 0
  private frontal = true
  private complete = false
  private sustained = false

  reset() { this.progress = 0; this.baseline = undefined; this.samples = []; this.neutralMs = 0; this.complete = false; this.clearTracking() }
  clearTracking() { this.last = this.seen = -Infinity; this.puff = this.hold = 0; this.sustained = false; this.frontal = true; this.samples = []; this.neutralMs = 0 }

  update(frame: TrackingFrame, now: number) {
    const previous = this.last, dt = now - previous < 240 ? Math.min(100, Math.max(0, now - previous)) : 0
    this.last = now
    if (now - previous >= 240) { this.hold = this.puff = 0; this.sustained = false }
    const cheeks = boCheeks(frame)
    if (!cheeks) { this.hold = this.puff = 0; this.sustained = false; return }
    this.seen = now
    if (this.complete) return
    const expression = frame.expressions ?? {}, smile = Math.max(expression.mouthSmileLeft ?? 0, expression.mouthSmileRight ?? 0)
    const closed = cheeks.mouth < .055 && (expression.jawOpen ?? 0) < .30 && smile < .52
    if (!this.baseline) {
      if (!closed || (expression.cheekPuff ?? 0) > .30) { this.samples = []; this.neutralMs = 0; return }
      const first = this.samples[0]
      if (first && (Math.abs(first.yaw - cheeks.yaw) > .045 || Math.abs(first.pitch - cheeks.pitch) > .065
        || Math.abs(first.width - cheeks.width) > .055)) { this.samples = []; this.neutralMs = 0 }
      if (dt === 0) { this.samples = []; this.neutralMs = 0 }
      this.samples.push(cheeks); this.neutralMs += dt
      if (this.neutralMs >= 850 && this.samples.length >= 8) {
        const average = (key: keyof Cheeks) => this.samples.reduce((sum, item) => sum + item[key], 0) / this.samples.length
        this.baseline = { left: average('left'), right: average('right'), width: average('width'), depth: average('depth'),
          outlineLeft: average('outlineLeft'), outlineRight: average('outlineRight'), lipWidth: average('lipWidth'),
          mouth: average('mouth'), yaw: average('yaw'), pitch: average('pitch') }
        this.samples = []
      }
      return
    }
    const base = this.baseline
    this.frontal = Math.abs(cheeks.yaw - base.yaw) < .14 && Math.abs(cheeks.pitch - base.pitch) < .22
    const left = cheeks.left - base.left, right = cheeks.right - base.right
    const bothSides = (a: number, b: number) => Math.max(0, Math.min(a, b) * .65 + (a + b) * .175)
    const inner = bothSides(left, right)
    const outerLeft = cheeks.outlineLeft - base.outlineLeft, outerRight = cheeks.outlineRight - base.outlineRight
    const outer = bothSides(outerLeft, outerRight)
    const depth = clamp((cheeks.depth - base.depth - .003) / .032)
    const width = clamp((cheeks.width - base.width - .005) / .042)
    const lipSupport = clamp((base.lipWidth - cheeks.lipWidth - .009) / .052)
    const bilateral = Math.min(left, right) > .002 || Math.min(outerLeft, outerRight) > .002
    const geometry = bilateral ? clamp(Math.max(inner / .023, outer / .021) * .65 + depth * .23 + width * .18 + lipSupport * .12) : 0
    const model = clamp(((expression.cheekPuff ?? 0) - .065) / .37)
    const target = closed && this.frontal ? Math.max(geometry, model) : 0
    const alpha = 1 - Math.exp(-dt / 95)
    this.puff += (target - this.puff) * alpha
    if (target < .13 || !closed || !this.frontal) { this.hold = 0; this.sustained = false }
    else if (this.puff >= .21) this.hold += dt
    if (this.hold >= 230) this.sustained = true
    if (this.sustained) this.progress = clamp(this.progress + dt / 2480)
    else if (this.puff < .17) this.progress = Math.max(0, this.progress - dt / 1600)
    if (this.progress >= .999) { this.progress = 1; this.complete = true }
  }

  status(now: number): BoStatus {
    return { stage: this.complete ? 'bo' : !this.baseline ? 'calibrating' : this.progress > .43 ? 'transforming'
      : this.progress > .015 ? 'blushing' : 'ready', progress: Math.round(this.progress * 100),
      puff: now - this.seen < 300 ? Math.round(this.puff * 100) : 0,
      tracked: now - this.seen < 300, frontal: this.frontal }
  }
}
