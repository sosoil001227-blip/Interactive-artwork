import test from 'node:test'
import assert from 'node:assert/strict'
import { measureHandOutline } from '../src/handContour.ts'
import type { ContourPixels } from '../src/handContour.ts'
import { gauntletShell } from '../src/gauntletGeometry.ts'
import type { ShellPoint } from '../src/gauntletGeometry.ts'
import { HandGesture } from '../src/handGesture.ts'
import type { TrackingFrame, TrackedHand } from '../src/tracking.ts'

const points = [
  [200, 380], [162, 338], [121, 314], [87, 276], [63, 242],
  [156, 272], [144, 209], [139, 158], [138, 119],
  [201, 261], [204, 185], [207, 129], [209, 83],
  [244, 275], [258, 204], [269, 157], [274, 121],
  [277, 299], [304, 254], [323, 217], [337, 188],
].map(([x, y]) => ({ x: x!, y: y! }))

function segmentDistance(p: ShellPoint, a: ShellPoint, b: ShellPoint) {
  const dx = b.x - a.x, dy = b.y - a.y
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}
function cameraPixels(skin = [193, 126, 85], crop = { x: 0, y: 0, width: 400, height: 470, scale: 1 }, flat = false): ContourPixels {
  const width = Math.round(crop.width * crop.scale), height = Math.round(crop.height * crop.scale)
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = { x: crop.x + x / crop.scale, y: crop.y + y / crop.scale }
    let hand = p.x >= 125 && p.x <= 282 && p.y >= 263 && p.y <= 393
      || p.x >= 165 && p.x <= 240 && p.y >= 385 && p.y <= 440
    for (const [root, radius] of [[1, 21], [5, 36], [9, 22], [13, 20], [17, 18]]) for (let i = 0; i < 3; i++) {
      if (segmentDistance(p, points[root! + i]!, points[root! + i + 1]!) <= radius!) hand = true
    }
    const color = flat || hand ? skin : [30, 110, 140], offset = (y * width + x) * 4
    data[offset] = color[0]!; data[offset + 1] = color[1]!; data[offset + 2] = color[2]!; data[offset + 3] = 255
  }
  return { width, height, data, x: crop.x, y: crop.y, scale: crop.scale }
}

test('same-frame pixels widen a thick finger beyond the landmark-only shell and cover the measured tip', () => {
  const before = gauntletShell(points)!, outline = measureHandOutline(cameraPixels(), points)!
  const after = gauntletShell(points, outline)!
  const indexBefore = before.fingers.find(f => f.root === 5)!, indexAfter = after.fingers.find(f => f.root === 5)!
  assert.ok(indexBefore.joints[2]!.radius < 36, 'the geometric estimate misses the synthetic 36px skin radius')
  assert.ok(indexAfter.joints[2]!.radius >= 39, 'the measured edge plus padding must cover the skin')
  assert.ok(indexAfter.joints[3]!.radius >= 39)
  assert.ok(outline.palm.length > 0)
})

test('boundary estimates adapt to light and dark local skin samples without a fixed skin-color threshold', () => {
  for (const skin of [[240, 205, 183], [64, 43, 35]]) {
    const outline = measureHandOutline(cameraPixels(skin), points)!
    assert.ok(outline.fingers.find(f => f.root === 5)!.radii[2]! * gauntletShell(points)!.size >= 39)
  }
})

test('cropped and downsampled readback retains camera-space boundary measurements', () => {
  const full = measureHandOutline(cameraPixels(), points)!
  const cropped = measureHandOutline(cameraPixels(undefined, { x: 10, y: 25, width: 380, height: 430, scale: .5 }), points)!
  const a = full.fingers.find(f => f.root === 5)!, b = cropped.fingers.find(f => f.root === 5)!, size = gauntletShell(points)!.size
  assert.ok(Math.abs(a.radii[2]! - b.radii[2]!) * size <= 4)
  assert.ok(b.radii[2]! * size >= 39)
})

test('similar-colored scenery falls back to the padded geometry rather than growing without a boundary', () => {
  const outline = measureHandOutline(cameraPixels(undefined, undefined, true), points)!, shell = gauntletShell(points)!
  assert.equal(outline.palm.length, 0)
  for (const f of outline.fingers) {
    const base = shell.fingers.find(item => item.root === f.root)!
    for (let j = 0; j < 4; j++) assert.ok(Math.abs(f.radii[j]! * shell.size - base.joints[j]!.radius) < 1e-6)
  }
  assert.equal(measureHandOutline({ ...cameraPixels(), scale: Infinity }, points), undefined)
  assert.equal(measureHandOutline({ width: 1, height: 1, data: new Uint8ClampedArray(), x: 0, y: 0, scale: 1 }, points), undefined)
})

test('wider current edges expand immediately while smaller noisy estimates contract slowly', () => {
  const pixels = cameraPixels(), current = measureHandOutline(pixels, points)!
  const prior = { palm: [], fingers: current.fingers.map(f => ({ ...f, radii: f.radii.map(r => r * 1.18), tip: f.tip * 1.18 })) }
  const stable = measureHandOutline(pixels, points, prior)!
  const original = current.fingers.find(f => f.root === 5)!, previous = prior.fingers.find(f => f.root === 5)!, result = stable.fingers.find(f => f.root === 5)!
  assert.ok(result.radii[2]! >= original.radii[2]!)
  assert.ok(result.radii[2]! < previous.radii[2]!)
  assert.ok(result.radii[2]! > original.radii[2]! * 1.05)
})

test('a retained camera frame keeps its matching gauntlet beyond the short tracking grace period', () => {
  const hand: TrackedHand = { label: 'Right', landmarks: points.map(p => ({ x: p.x / 400, y: p.y / 470, z: 0 })), worldLandmarks: [] }
  const frame: TrackingFrame = { timestamp: 123, width: 400, height: 470, face: [], hands: [hand] }
  const gesture = new HandGesture()
  gesture.update(frame, 1000, false)
  assert.equal(gesture.active(1050, 124).length, 1, 'a brief detection miss retains the existing short grace period')
  assert.equal(gesture.active(1300).length, 0)
  assert.equal(gesture.active(1300, 123).length, 1)
  assert.equal(gesture.active(1300, 124).length, 0)
  assert.equal(gesture.active(1450, 123).length, 0)
})

test('depth-aware thickness does not flatten with a hand turning edge-on', () => {
  const angle = 1.13
  const rotated = points.map(p => ({ x: 200 + (p.x - 200) * Math.cos(angle), y: p.y,
    z: (p.x - 200) * Math.sin(angle) }))
  const flat = gauntletShell(rotated.map(p => ({ x: p.x, y: p.y })))!
  const depth = gauntletShell(rotated)!
  assert.ok(depth.size > flat.size * 1.1)
  assert.ok(depth.fingers[1]!.joints[2]!.radius > flat.fingers[1]!.joints[2]!.radius)
})
