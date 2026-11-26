import type { HitBox } from './marioGesture.ts'

export interface MarioCapBounds { left: number; right: number; top: number; bottom: number }

export function marioCapBounds(x: number, y: number, scale: number, roll: number): MarioCapBounds {
  const cos = Math.cos(roll), sin = Math.sin(roll)
  // The cap's Bézier controls and stroke lie within this local rectangle.
  const corners = [-1.34, 1.34].flatMap(u => [-1.23, .46].map(v => ({
    x: x + (u * cos - v * sin) * scale,
    y: y + (u * sin + v * cos) * scale,
  })))
  return {
    left: Math.min(...corners.map(p => p.x)), right: Math.max(...corners.map(p => p.x)),
    top: Math.min(...corners.map(p => p.y)), bottom: Math.max(...corners.map(p => p.y)),
  }
}

export function marioBrickLayout(w: number, h: number, cap?: MarioCapBounds): HitBox | undefined {
  const edge = Math.max(6, h * .022)
  const gap = Math.max(8, h * .024)
  const preferred = Math.min(w / 6.2, h * .135, 78, (w - edge * 2) / 5)
  const box = (center: number, size: number, y = edge) => ({ x: center - size / 2, y, size })
  if (preferred <= 0) return
  if (!cap || cap.bottom <= edge - gap || cap.left >= w || cap.right <= 0) return box(w / 2, preferred)

  const above = Math.min(preferred, cap.top - edge - gap)
  if (above >= preferred * .65) return box(w / 2, above)

  // An upward move cannot clear a hat near the top edge. Use whichever upper corner has a wider lane.
  const left = Math.min(w - edge, cap.left - gap)
  const right = Math.max(edge, cap.right + gap)
  const leftSize = Math.min(preferred, (left - edge) / 5)
  const rightSize = Math.min(preferred, (w - edge - right) / 5)
  const sideSize = Math.max(leftSize, rightSize)
  if (above >= sideSize && above >= 10) return box(w / 2, above)
  if (sideSize < 10) return
  // Leave room for the tracking and coin labels when the row shares an upper corner.
  const sideY = Math.max(edge, Math.min(58, h - sideSize - edge))
  return leftSize >= rightSize ? box(left - sideSize * 2.5, sideSize, sideY) : box(right + sideSize * 2.5, sideSize, sideY)
}
