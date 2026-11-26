import { clamp, ease, mix } from './geometry.ts'
import type { TrackingFrame } from './tracking.ts'
import type { Vec3 } from './geometry.ts'
import { boCheeks } from './boGesture.ts'
import { faceOval } from './conanFit.ts'

export interface BoFit { x: number; y: number; width: number; height: number; roll: number }
export interface BoPoint { x: number; y: number }

export function boChannels(progress: number) {
  const p = clamp(progress)
  return {
    blush: ease(p / .27) * (1 - ease((p - .60) / .40) * .65),
    puff: ease(p / .40) * .16,
    flatten: ease((p - .08) / .60),
    layout: ease((p - .47) / .49),
    contour: ease((p - .24) / .57),
    cartoon: ease((p - .42) / .49),
    body: ease((p - .61) / .36),
    video: 1 - ease((p - .24) / .52),
    background: ease((p - .23) / .67) * .78,
  }
}
export function liveBoFit(frame: TrackingFrame, project: (p: Vec3) => Vec3): BoFit | undefined {
  if (!boCheeks(frame)) return
  const at = (i: number) => { const p = frame.face[i]!; return project({ x: p.x * frame.width, y: p.y * frame.height, z: p.z * frame.width }) }
  const top = at(10), chin = at(152), sides = [at(234), at(454)].sort((a, b) => a.x - b.x), a = sides[0]!, b = sides[1]!
  return { x: (top.x + chin.x) / 2, y: (top.y + chin.y) / 2,
    width: Math.hypot(a.x - b.x, a.y - b.y), height: Math.hypot(chin.x - top.x, chin.y - top.y), roll: Math.atan2(b.y - a.y, b.x - a.x) }
}
export function targetBoFit(w: number, h: number): BoFit {
  const scale = Math.min(w * .86 / 500, h * .90 / 550)
  return { x: w / 2, y: (h - 550 * scale) / 2 + 175 * scale, width: 260 * scale, height: 280 * scale, roll: 0 }
}
export function morphBoFit(live: BoFit, target: BoFit, progress: number): BoFit {
  const t = boChannels(progress).layout
  return { x: mix(live.x, target.x, t), y: mix(live.y, target.y, t),
    width: mix(live.width, target.width, t), height: mix(live.height, target.height, t), roll: mix(live.roll, 0, t) }
}

export const blendBoPoint = (a: BoPoint, b: BoPoint, t: number): BoPoint => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) })

// Boh's illustrated face outline from crown to chin, following the same order as the tracked oval.
const rightOutline = [
  [250, 35], [285, 36], [313, 43], [334, 55], [350, 71], [361, 93], [368, 117], [371, 141], [372, 164],
  [375, 189], [382, 213], [385, 237], [379, 261], [366, 283], [345, 302], [320, 312], [291, 309], [271, 317], [250, 319],
]
const boOutline = [...rightOutline, ...rightOutline.slice(1, -1).reverse().map(([x, y]) => [500 - x!, y!])]

export function boFaceOutline(frame: TrackingFrame, project: (p: Vec3) => Vec3): { edge: BoPoint[]; center: BoPoint } | undefined {
  if ([1, ...faceOval].some(i => !frame.face[i] || ![frame.face[i]!.x, frame.face[i]!.y].every(Number.isFinite))) return
  const point = (i: number) => {
    const p = frame.face[i]!
    const { x, y } = project({ x: p.x * frame.width, y: p.y * frame.height, z: p.z * frame.width })
    return { x, y }
  }
  const ordered = point(faceOval[8]!).x < point(faceOval[28]!).x
    ? [faceOval[0]!, ...faceOval.slice(1).reverse()] : faceOval
  return { edge: ordered.map(point), center: point(1) }
}

export function morphBoOutline(source: { edge: BoPoint[]; center: BoPoint }, fit: BoFit, amount: number) {
  const cosine = Math.cos(fit.roll), sine = Math.sin(fit.roll)
  const target = (x: number, y: number) => {
    const u = (x - 250) * fit.width / 260, v = (y - 175) * fit.height / 280
    return { x: fit.x + u * cosine - v * sine, y: fit.y + u * sine + v * cosine }
  }
  return {
    edge: source.edge.map((point, i) => blendBoPoint(point, target(boOutline[i]![0]!, boOutline[i]![1]!), amount)),
    center: blendBoPoint(source.center, target(250, 211), amount),
  }
}

/** Fallback uses the same inverse camera-coordinate deformation as the GPU shader. */
export function boCameraUV(u: number, v: number, face: { x: number; y: number; width: number; height: number }, puff: number) {
  const qx = (u - face.x) / face.width, qy = (v - face.y) / face.height
  const weight = Math.exp(-((Math.abs(qx) - .28) ** 2 / .065 + (qy - .16) ** 2 / .13))
    * (1 - ease((Math.abs(qx) - .44) / .28))
  return { u: clamp(face.x + (u - face.x) / (1 + puff * weight)), v }
}
