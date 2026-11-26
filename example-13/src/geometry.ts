export interface Vec3 { x: number; y: number; z: number }
export type Point = readonly [number, number]
export const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value))
export const mix = (a: number, b: number, weight: number) => a + (b - a) * weight
export const ease = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t) }
export const length = (a: Vec3) => Math.hypot(a.x, a.y, a.z)
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
export const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
export const unit = (a: Vec3): Vec3 => {
  const size = length(a) || 1
  return { x: a.x / size, y: a.y / size, z: a.z / size }
}
export const centerOf = (points: Vec3[]): Vec3 => {
  const n = points.length || 1
  return points.reduce((a, p) => ({ x: a.x + p.x / n, y: a.y + p.y / n, z: a.z + p.z / n }), { x: 0, y: 0, z: 0 })
}
