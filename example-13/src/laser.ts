import { clamp } from './geometry.ts'

export interface Pixel { x: number; y: number }

export function laserTarget(origin: Pixel, facing: Pixel, width: number, height: number): Pixel {
  // Perspective makes two forward-facing emitters diverge on screen. Add the
  // projected head direction so both beams sweep as the visor turns.
  const dx = clamp(facing.x, -1, 1) * 2.4 + (origin.x / width - .5) * 1.45
  const dy = clamp(facing.y, -1, 1) * 2.0 + (origin.y / height - .5) * 1.3 + .32
  const vx = Math.abs(dx) + Math.abs(dy) < .035 ? .001 : dx
  const vy = Math.abs(dx) + Math.abs(dy) < .035 ? .035 : dy
  const margin = 24
  const tx = vx > 0 ? (width + margin - origin.x) / vx : vx < 0 ? (-margin - origin.x) / vx : Infinity
  const ty = vy > 0 ? (height + margin - origin.y) / vy : vy < 0 ? (-margin - origin.y) / vy : Infinity
  const distance = Math.max(0, Math.min(tx, ty))
  return { x: origin.x + vx * distance, y: origin.y + vy * distance }
}
