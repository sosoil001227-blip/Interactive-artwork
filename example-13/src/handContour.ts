import { gauntletShell } from './gauntletGeometry.ts'
import type { HandOutline, ShellPoint } from './gauntletGeometry.ts'

export interface ContourPixels {
  width: number; height: number; data: Uint8ClampedArray
  x: number; y: number; scale: number
}
type Color = readonly [number, number, number]
const distance = (a: ShellPoint, b: ShellPoint) => Math.hypot(a.x - b.x, a.y - b.y)
const mix = (a: ShellPoint, b: ShellPoint, t: number): ShellPoint => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

/** Image-guided local boundary estimates, not a general-purpose skin-color threshold. */
export function measureHandOutline(pixels: ContourPixels, points: readonly ShellPoint[], previous?: HandOutline): HandOutline | undefined {
  const shell = gauntletShell(points)
  if (!shell || !Number.isFinite(pixels.scale) || pixels.scale <= 0
    || !Number.isFinite(pixels.x) || !Number.isFinite(pixels.y)
    || !Number.isInteger(pixels.width) || !Number.isInteger(pixels.height) || pixels.width < 1 || pixels.height < 1
    || pixels.data.length !== pixels.width * pixels.height * 4) return
  const size = shell.size, step = 1 / pixels.scale, margin = Math.max(3, size * .020)
  const colorAt = (p: ShellPoint): Color | undefined => {
    const x = Math.round((p.x - pixels.x) * pixels.scale), y = Math.round((p.y - pixels.y) * pixels.scale)
    if (x < 0 || y < 0 || x >= pixels.width || y >= pixels.height) return
    const i = (y * pixels.width + x) * 4
    if (pixels.data[i + 3]! < 128) return
    return [pixels.data[i]!, pixels.data[i + 1]!, pixels.data[i + 2]!]
  }
  const center = points[0]!
  const palmCenter = [0, 5, 9, 13, 17].reduce((a, i) => ({ x: a.x + points[i]!.x / 5, y: a.y + points[i]!.y / 5 }), { x: 0, y: 0 })
  const palmColors = [palmCenter, ...[1, 5, 9, 13, 17].map(i => mix(center, points[i]!, .55))]
    .map(colorAt).filter((c): c is Color => !!c)
  if (palmColors.length < 2) return
  const similar = (a: Color, b: Color) => {
    const totalA = a[0] + a[1] + a[2] + 1, totalB = b[0] + b[1] + b[2] + 1
    const chroma = Math.hypot(a[0] / totalA - b[0] / totalB, a[1] / totalA - b[1] / totalB)
    const rgb = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
    return rgb < 43 || chroma < .065 && totalA / totalB > .48 && totalA / totalB < 1.8
  }
  function trace(origin: ShellPoint, direction: ShellPoint, min: number, max: number) {
    const local = colorAt(origin), models = local ? [local, ...palmColors] : palmColors
    let outside = 0, boundary = 0
    // Confirmation pixels can lie beyond the requested boundary range on downsampled crops.
    for (let t = 0; t <= max + step * 2; t += step) {
      const color = colorAt({ x: origin.x + direction.x * t, y: origin.y + direction.y * t })
      if (!color) return // A clipped image edge is not evidence of additional skin.
      if (models.some(model => similar(color, model))) outside = 0
      else {
        if (!outside) boundary = t
        outside++
        if (outside >= 3 && boundary >= min && boundary <= max) return boundary + margin
      }
    }
    // Similar-colored scenery provides no reliable boundary; retain the conservative geometric shell.
    return
  }
  const fingers = shell.fingers.map(finger => {
    const old = previous?.fingers.find(item => item.root === finger.root)
    const radii = finger.joints.map((joint, j) => {
      if (j === 0) return joint.radius / size
      const a = points[finger.root + j - 1]!, b = points[finger.root + Math.min(3, j + 1)]!
      const span = distance(a, b)
      if (span < size * .045) return Math.max(joint.radius / size, old?.radii[j] ?? 0)
      const normal = { x: -(b.y - a.y) / span, y: (b.x - a.x) / span }
      const radii = [-1, 1].map(sign => trace(joint.center, { x: normal.x * sign, y: normal.y * sign },
        joint.radius * .30, size * .32)).filter((value): value is number => value !== undefined)
      const observed = Math.min(.34, Math.max(joint.radius / size, ...radii.map(r => r / size)))
      const prior = old?.radii[j] ?? observed
      return Math.max(observed, prior * .85 + observed * .15)
    })
    // Soft tissue can bulge between joint landmarks. Measure intermediate cross-sections as well.
    for (let j = 0; j < 3; j++) {
      const a = points[finger.root + j]!, b = points[finger.root + j + 1]!, span = distance(a, b)
      if (span < size * .045) continue
      const normal = { x: -(b.y - a.y) / span, y: (b.x - a.x) / span }
      for (const t of [.25, .5, .75]) for (const sign of [-1, 1]) {
        const measured = trace(mix(a, b, t), { x: normal.x * sign, y: normal.y * sign }, size * .05, size * .32)
        if (measured === undefined) continue
        const radius = Math.min(.34, measured / size)
        radii[j] = Math.max(radii[j]!, radius); radii[j + 1] = Math.max(radii[j + 1]!, radius)
      }
    }
    const a = points[finger.root + 2]!, tip = points[finger.root + 3]!, span = distance(a, tip)
    const forward = span > size * .035 ? { x: (tip.x - a.x) / span, y: (tip.y - a.y) / span } : undefined
    // Start a little inside the distal phalanx so a fingertip landmark on the edge does not sample the background.
    const inset = Math.min(span * .4, size * .10), start = forward ? { x: tip.x - forward.x * inset, y: tip.y - forward.y * inset } : tip
    const end = forward ? trace(start, forward, inset * .25, inset + size * .30) : undefined
    const observed = end === undefined ? radii[3]! * .46 : Math.max(radii[3]! * .46, (end - inset) / size)
    return { root: finger.root, radii, tip: Math.min(.30, Math.max(observed, (old?.tip ?? observed) * .85 + observed * .15)) }
  })
  const palm: ShellPoint[] = []
  for (const [a, b] of [[0, 1], [1, 2], [2, 5], [13, 17], [17, 0]]) for (const t of [.2, .5, .8]) {
    const edge = mix(points[a!]!, points[b!]!, t), span = distance(palmCenter, edge)
    if (span < size * .1) continue
    const direction = { x: (edge.x - palmCenter.x) / span, y: (edge.y - palmCenter.y) / span }
    const inset = size * .16, start = { x: edge.x - direction.x * inset, y: edge.y - direction.y * inset }
    const measured = trace(start, direction, inset * .35, inset + size * .28)
    if (measured !== undefined) palm.push({ x: start.x + direction.x * measured, y: start.y + direction.y * measured })
  }
  return { fingers, palm }
}

/** Read only a small hand crop once per matched tracking frame, never the full viewport per render. */
export class HandContourSampler {
  private canvas?: HTMLCanvasElement
  sample(source: CanvasImageSource & { width: number; height: number }, points: readonly ShellPoint[], previous?: HandOutline) {
    const shell = gauntletShell(points)
    if (!shell) return
    const pad = shell.size * .50
    const x = Math.max(0, Math.floor(Math.min(...points.map(p => p.x)) - pad))
    const y = Math.max(0, Math.floor(Math.min(...points.map(p => p.y)) - pad))
    const right = Math.min(source.width, Math.ceil(Math.max(...points.map(p => p.x)) + pad))
    const bottom = Math.min(source.height, Math.ceil(Math.max(...points.map(p => p.y)) + pad))
    const width = right - x, height = bottom - y
    if (width < 2 || height < 2) return
    const scale = Math.min(1, 384 / Math.max(width, height))
    this.canvas ??= document.createElement('canvas')
    const canvas = this.canvas, w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale))
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
    try {
      const c = canvas.getContext('2d', { willReadFrequently: true })
      if (!c) return
      c.drawImage(source, x, y, width, height, 0, 0, w, h)
      return measureHandOutline({ width: w, height: h, data: c.getImageData(0, 0, w, h).data, x, y, scale }, points, previous)
    } catch { return } // Keep the padded shell if pixel readback is unavailable.
  }
  clear() { if (this.canvas) this.canvas.width = this.canvas.height = 1 }
}
