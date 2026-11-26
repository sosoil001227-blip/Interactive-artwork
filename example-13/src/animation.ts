import { clamp, ease } from './geometry.ts'

export type MaskState = 'off' | 'assembling' | 'locked' | 'releasing'
export const assemblyMs = 1380
export const releaseMs = 550

export class Assembly {
  state: MaskState = 'off'
  elapsed = 0

  engage(immediate = false) {
    if (this.state !== 'off') return
    this.state = immediate ? 'locked' : 'assembling'
    this.elapsed = 0
  }

  release(immediate = false) {
    if (this.state !== 'locked') return
    this.state = immediate ? 'off' : 'releasing'
    this.elapsed = 0
  }

  reset() { this.state = 'off'; this.elapsed = 0 }

  tick(dt: number, tracking: boolean) {
    if (!tracking) return
    this.elapsed += clamp(dt, 0, 50)
    if (this.state === 'assembling' && this.elapsed >= assemblyMs) this.state = 'locked'
    if (this.state === 'releasing' && this.elapsed >= releaseMs) this.reset()
  }
}

export function partMotion(state: MaskState, elapsed: number, delay: number, flight: number) {
  if (state === 'off') return { visible: false, approach: 0, trail: 0, latch: 0 }
  if (state === 'locked') return { visible: true, approach: 1, trail: 0, latch: 0 }
  const t = state === 'assembling'
    ? (elapsed - delay) / flight
    : 1 - (elapsed - (760 - delay) * .24) / 345
  const visible = t > 0
  const x = clamp(t)
  const approach = x < .91 ? ease(x / .91) : 1 + Math.sin((x - .91) / .09 * Math.PI) * .042
  const trail = Math.sin(x * Math.PI) ** 1.5
  const latch = state === 'assembling' ? Math.max(0, 1 - Math.abs(t - .95) * 6) : 0
  return { visible, approach, trail, latch }
}
