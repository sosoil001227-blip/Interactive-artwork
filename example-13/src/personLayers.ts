import { personMask } from './conanFit.ts'
import type { Projection } from './conanFit.ts'
import type { Vec3 } from './geometry.ts'
import type { PersonMask, TrackingFrame } from './tracking.ts'

export interface CameraLayer {
  source: CanvasImageSource
  rect: { x: number; y: number; width: number; height: number }
  ratio: number
}

function sizeLayer(layer: HTMLCanvasElement, width: number, height: number) {
  if (layer.width !== width || layer.height !== height) {
    layer.width = width
    layer.height = height
  }
}

function beginLayer(layer: HTMLCanvasElement, w: number, h: number, ratio: number) {
  sizeLayer(layer, Math.max(1, Math.round(w * ratio)), Math.max(1, Math.round(h * ratio)))
  const c = layer.getContext('2d')!
  c.setTransform(layer.width / w, 0, 0, layer.height / h, 0, 0)
  c.clearRect(0, 0, w, h)
  return c
}

function outline(c: CanvasRenderingContext2D, points: readonly Vec3[]) {
  c.beginPath()
  for (const [i, p] of points.entries()) {
    if (i === 0) c.moveTo(p.x, p.y)
    else c.lineTo(p.x, p.y)
  }
  c.closePath()
}

function drawMirrored(c: CanvasRenderingContext2D, image: CanvasImageSource, rect: CameraLayer['rect']) {
  c.save()
  c.translate(rect.x + rect.width, rect.y)
  c.scale(-1, 1)
  c.drawImage(image, 0, 0, rect.width, rect.height)
  c.restore()
}

export class PersonLayers {
  private small = document.createElement('canvas')
  private screen = document.createElement('canvas')
  private person = document.createElement('canvas')
  private outfit = document.createElement('canvas')
  private mask?: PersonMask
  private hasPixels = false
  private layout = ''
  private personKey = ''
  private outfitKey = ''

  prepare(frame: TrackingFrame, camera: CameraLayer, w: number, h: number) {
    const mask = personMask(frame)
    const { x, y, width, height } = camera.rect
    const layout = `${frame.timestamp}:${w}:${h}:${camera.ratio}:${x}:${y}:${width}:${height}`
    if (this.layout === layout && this.mask === mask) return this.hasPixels
    const maskChanged = mask !== this.mask
    this.layout = layout
    this.personKey = this.outfitKey = ''
    this.mask = mask
    if (!mask) { this.hasPixels = false; return false }
    if (maskChanged) {
      this.hasPixels = mask.alpha.some(alpha => alpha >= 105)
      if (!this.hasPixels) return false
      sizeLayer(this.small, mask.width, mask.height)
      const c = this.small.getContext('2d')!, image = c.createImageData(mask.width, mask.height)
      for (const [i, alpha] of mask.alpha.entries()) image.data[i * 4 + 3] = alpha
      c.putImageData(image, 0, 0)
    }
    if (!this.hasPixels) return false
    const c = beginLayer(this.screen, w, h, camera.ratio)
    drawMirrored(c, this.small, camera.rect)
    return true
  }

  restore(c: CanvasRenderingContext2D, camera: CameraLayer, w: number, h: number) {
    if (!this.hasPixels) return
    if (this.personKey !== this.layout) {
      const layer = beginLayer(this.person, w, h, camera.ratio)
      drawMirrored(layer, camera.source, camera.rect)
      this.trim(layer, w, h)
      this.personKey = this.layout
    }
    c.drawImage(this.person, 0, 0, w, h)
  }

  garment(c: CanvasRenderingContext2D, camera: CameraLayer, w: number, h: number, face: Vec3[] | undefined,
    state: string | number, draw: (layer: CanvasRenderingContext2D) => void) {
    if (!this.hasPixels && !face) { draw(c); return }
    const key = `${this.layout}:${state}`
    if (this.outfitKey !== key) {
      const layer = beginLayer(this.outfit, w, h, camera.ratio)
      draw(layer)
      this.trim(layer, w, h)
      if (face) {
        layer.save()
        layer.globalCompositeOperation = 'destination-out'
        outline(layer, face)
        layer.fill()
        layer.restore()
      }
      this.outfitKey = key
    }
    c.drawImage(this.outfit, 0, 0, w, h)
  }

  private trim(c: CanvasRenderingContext2D, w: number, h: number) {
    if (!this.hasPixels) return
    c.save()
    c.globalCompositeOperation = 'destination-in'
    c.drawImage(this.screen, 0, 0, w, h)
    c.restore()
  }

  reset() {
    this.mask = undefined
    this.hasPixels = false
    this.layout = this.personKey = this.outfitKey = ''
    for (const layer of [this.small, this.screen, this.person, this.outfit]) sizeLayer(layer, 1, 1)
  }
}

function hull(points: Vec3[]) {
  const ordered = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (a: Vec3, b: Vec3, p: Vec3) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
  const side = (list: Vec3[]) => {
    const result: Vec3[] = []
    for (const p of list) {
      while (result.length > 1 && cross(result.at(-2)!, result.at(-1)!, p) <= 0) result.pop()
      result.push(p)
    }
    return result
  }
  return [...side(ordered).slice(0, -1), ...side(ordered.reverse()).slice(0, -1)]
}

export function restoreTrackedHands(c: CanvasRenderingContext2D, frame: TrackingFrame, project: Projection, camera: CameraLayer, extendWrist = false) {
  for (const hand of frame.hands ?? []) {
    if (hand.landmarks.length !== 21 || hand.landmarks.some(p => ![p.x, p.y, p.z].every(Number.isFinite))) continue
    const points = hand.landmarks.map(p => project({ x: p.x * frame.width, y: p.y * frame.height, z: p.z * frame.width }))
    const wrist = points[0]!, middle = points[9]!, palm = Math.hypot(middle.x - wrist.x, middle.y - wrist.y)
    if (palm < 3) continue
    const x = (wrist.x + middle.x) / 2, y = (wrist.y + middle.y) / 2
    const margin = palm * (extendWrist ? .16 : .13)
    const expanded = points.map(p => {
      const dx = p.x - x, dy = p.y - y, distance = Math.hypot(dx, dy) || 1
      return { x: p.x + dx / distance * margin, y: p.y + dy / distance * margin, z: 0 }
    })
    if (extendWrist) {
      const dx = wrist.x - middle.x, dy = wrist.y - middle.y
      for (const side of [-1, 1]) expanded.push({ x: wrist.x + dx * .65 - dy * .3 * side,
        y: wrist.y + dy * .65 + dx * .3 * side, z: 0 })
    }
    const boundary = hull(expanded)
    if (boundary.length < 3) continue
    c.save()
    outline(c, boundary)
    c.clip()
    drawMirrored(c, camera.source, camera.rect)
    c.restore()
  }
}
