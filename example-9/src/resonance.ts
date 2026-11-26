import type { Palm } from './gestures'

type Sample = { pose: readonly number[]; time: number }

// Compare fingertips in each palm's local 3D frame. Moving or rotating the
// entire hand therefore does not masquerade as finger articulation.
export class FingerResonance {
  private previous = new Map<string, Sample>()
  private lastTime = 0
  private energy = 0

  reset() { this.previous.clear(); this.lastTime = 0; this.energy = 0 }

  update(palms: Palm[], now: number, active: boolean) {
    if (!active || palms.length !== 2) { this.reset(); return 0 }
    const elapsed = this.lastTime ? now - this.lastTime : 0
    if (elapsed > 250) this.reset()
    const dt = elapsed > 0 && elapsed <= 250 ? elapsed / 1000 : 1 / 30
    let speed = 0
    const next = new Map<string, Sample>()
    for (const palm of palms) {
      const pose = palm.fingerPose
      if (!pose || pose.length !== 15) continue
      const previous = this.previous.get(palm.label)
      if (previous && previous.pose.length === pose.length && now - previous.time <= 250 && now > previous.time) {
        const rms = Math.sqrt(pose.reduce((sum, value, index) => sum + (value - previous.pose[index]!) ** 2, 0) / pose.length)
        speed = Math.max(speed, rms / ((now - previous.time) / 1000))
      }
      next.set(palm.label, { pose: [...pose], time: now })
    }
    this.previous = next; this.lastTime = now
    // Reject small landmark jitter, then soften the attack and release.
    const target = Math.max(0, Math.min(1, (speed - .32) / 2.8))
    this.energy += (target - this.energy) * (1 - Math.exp(-dt / (target > this.energy ? .065 : .24)))
    return this.energy
  }
}
