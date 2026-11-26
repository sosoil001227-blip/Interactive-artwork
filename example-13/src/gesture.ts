import type { TrackingFrame } from './tracking.ts'

export interface NodState { phase: 'calibrating' | 'ready' | 'return'; fired: boolean }

export function pitchOf(frame: TrackingFrame): number | undefined {
  const { face, faceMatrix } = frame
  if (!face[152]) return
  if (faceMatrix?.rows === 4 && faceMatrix.columns === 4 && faceMatrix.data.length === 16) {
    const m = faceMatrix.data
    // The antisymmetric entries isolate pitch and are insensitive to scale;
    // transposing a matrix only reverses the sign of the out-and-back gesture.
    const pitch = Math.atan2(m[9]! - m[6]!, m[5]! + m[10]!)
    if (Number.isFinite(pitch)) return pitch
  }
  const forehead = face[10]!, chin = face[152]!
  return Math.atan2((chin.z - forehead.z) * frame.width, (chin.y - forehead.y) * frame.height)
}

export class NodDetector {
  private baseline?: number
  private filtered = 0
  private last = -Infinity
  private calibratedAt = 0
  private movedAt?: number
  private cooldown = 0

  reset() {
    this.baseline = this.movedAt = undefined
    this.last = -Infinity
    this.cooldown = 0
  }

  update(frame: TrackingFrame): NodState {
    const now = frame.timestamp, pitch = pitchOf(frame)
    if (now - this.last > 600 || pitch === undefined) this.reset()
    if (pitch === undefined) return { phase: 'calibrating', fired: false }
    if (this.baseline === undefined) {
      this.baseline = this.filtered = pitch
      this.calibratedAt = this.last = now
      return { phase: 'calibrating', fired: false }
    }
    const dt = Math.max(1, now - this.last)
    this.filtered += (pitch - this.filtered) * (1 - Math.exp(-dt / 51))
    this.last = now
    const delta = this.filtered - this.baseline
    if (now - this.calibratedAt < 320) {
      this.baseline += delta * .12
      return { phase: 'calibrating', fired: false }
    }
    if (now < this.cooldown) return { phase: 'ready', fired: false }
    if (this.movedAt !== undefined) {
      const elapsed = now - this.movedAt
      if (elapsed > 1450) {
        this.movedAt = undefined
        this.baseline = this.filtered
      } else if (elapsed >= 100 && Math.abs(delta) < .066) {
        this.movedAt = undefined
        this.cooldown = now + 950
        return { phase: 'ready', fired: true }
      }
    } else if (Math.abs(delta) >= .13) {
      this.movedAt = now
    } else {
      this.baseline += delta * Math.min(.04, dt / 2200)
    }
    return { phase: this.movedAt === undefined ? 'ready' : 'return', fired: false }
  }
}
