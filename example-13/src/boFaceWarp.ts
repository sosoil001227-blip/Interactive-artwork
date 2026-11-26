import { blendBoPoint } from './boMorph.ts'
import type { BoPoint } from './boMorph.ts'

type Face = { edge: BoPoint[]; center: BoPoint }
type Triangle = readonly [BoPoint, BoPoint, BoPoint]

export function traceBoOutline(c: CanvasRenderingContext2D, points: readonly BoPoint[]) {
  points.forEach(({ x, y }, i) => i ? c.lineTo(x, y) : c.moveTo(x, y))
  c.closePath()
}

function drawTriangle(c: CanvasRenderingContext2D, source: HTMLCanvasElement, scale: number, from: Triangle, to: Triangle) {
  const [a, b, d] = from, [p, q, r] = to
  const ux = b.x - a.x, uy = b.y - a.y, vx = d.x - a.x, vy = d.y - a.y
  const determinant = ux * vy - uy * vx
  if (Math.abs(determinant) < .1) return
  const xx = ((q.x - p.x) * vy - (r.x - p.x) * uy) / determinant
  const yx = ((q.y - p.y) * vy - (r.y - p.y) * uy) / determinant
  const xy = ((r.x - p.x) * ux - (q.x - p.x) * vx) / determinant
  const yy = ((r.y - p.y) * ux - (q.y - p.y) * vx) / determinant
  // Overlap internal edges slightly to avoid antialias gaps between adjacent video triangles.
  const center = { x: (p.x + q.x + r.x) / 3, y: (p.y + q.y + r.y) / 3 }
  const clip = to.map(point => {
    const dx = point.x - center.x, dy = point.y - center.y, length = Math.hypot(dx, dy) || 1
    return { x: point.x + .9 * dx / length, y: point.y + .9 * dy / length }
  })
  c.save()
  c.beginPath(); traceBoOutline(c, clip); c.clip()
  c.transform(xx, yx, xy, yy, p.x - xx * a.x - xy * a.y, p.y - yx * a.x - yy * a.y)
  c.drawImage(source, 0, 0, source.width / scale, source.height / scale)
  c.restore()
}

/** Maps the same live face pixels from the tracked face oval to Boh's silhouette. */
export function drawBoFaceWarp(c: CanvasRenderingContext2D, source: HTMLCanvasElement, scale: number, from: Face, to: Face) {
  const inner = (face: Face) => face.edge.map(point => blendBoPoint(face.center, point, .55))
  const sourceInner = inner(from), targetInner = inner(to)
  c.save()
  c.beginPath(); traceBoOutline(c, to.edge); c.clip()
  for (let i = 0; i < from.edge.length; i++) {
    const next = (i + 1) % from.edge.length
    const a = from.edge[i]!, b = from.edge[next]!, d = sourceInner[i]!, e = sourceInner[next]!
    const p = to.edge[i]!, q = to.edge[next]!, r = targetInner[i]!, s = targetInner[next]!
    drawTriangle(c, source, scale, [a, b, d], [p, q, r])
    drawTriangle(c, source, scale, [d, b, e], [r, q, s])
    drawTriangle(c, source, scale, [from.center, d, e], [to.center, r, s])
  }
  c.restore()
}
