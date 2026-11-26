import test from 'node:test'
import assert from 'node:assert/strict'
import { Assembly, assemblyMs, partMotion } from '../src/animation.ts'
import { NodDetector, pitchOf } from '../src/gesture.ts'
import { laserTarget } from '../src/laser.ts'
import { parts, resolveRig, sampleFrame } from '../src/rig.ts'
import { MouthGesture } from '../src/spirit.ts'
import type { TrackingFrame } from '../src/tracking.ts'

function head(timestamp: number, pitch = 0, yaw = 0): TrackingFrame {
  const p = Math.cos(pitch), q = Math.sin(pitch), c = Math.cos(yaw), s = Math.sin(yaw)
  return { ...sampleFrame, timestamp, faceMatrix: { rows: 4, columns: 4,
    data: [c, s * q, s * p, 0, 0, p, -q, 0, -s, c * q, c * p, 0, 0, 0, 0, 1] } }
}

test('one nod fires on returning to neutral and yaw and a sustained tilt do not', () => {
  assert.ok(Math.abs(pitchOf(head(0, .25, .55))! - .25) < 1e-6)
  const nod = new NodDetector()
  let now = 0
  const feed = (count: number, pitch = 0, yaw = 0) => Array.from({ length: count }, () =>
    nod.update(head(now += 45, pitch, yaw))).filter(state => state.fired).length
  assert.equal(feed(10), 0)
  assert.equal(feed(10, 0, .68), 0)
  assert.equal(feed(7, -.24), 0)
  assert.equal(feed(8), 1)
  assert.equal(feed(10), 0)

  nod.reset()
  assert.equal(feed(10), 0)
  assert.equal(feed(40, .25), 0)
})

test('staggered parts arrive from four directions, pause without tracking and can release', () => {
  const assembly = new Assembly()
  assembly.engage()
  assembly.tick(50, false)
  assert.equal(assembly.elapsed, 0)
  assert.equal(partMotion('assembling', 120, parts[0]!.delay, parts[0]!.flight).visible, true)
  assert.equal(partMotion('assembling', 120, parts.at(-1)!.delay, parts.at(-1)!.flight).visible, false)
  assert.ok(parts.some(p => p.arrival[0] < 0) && parts.some(p => p.arrival[0] > 0))
  assert.ok(parts.some(p => p.arrival[1] === -1) && parts.some(p => p.arrival[1] === 1))
  assert.ok(parts.every(p => p.delay + p.flight < assemblyMs))
  for (let i = 0; i < 90; i++) assembly.tick(16, true)
  assert.equal(assembly.state, 'locked')
  assembly.release()
  for (let i = 0; i < 36; i++) assembly.tick(16, true)
  assert.equal(assembly.state, 'off')
})

test('mask geometry follows both translated and rotated landmarks with no nonfinite vertices', () => {
  assert.equal(resolveRig({ ...sampleFrame, face: [] }).length, 0)
  const original = resolveRig(sampleFrame)
  const yaw = .38, c = Math.cos(yaw), s = Math.sin(yaw)
  const rotated = resolveRig({ ...sampleFrame, face: sampleFrame.face.map(point => ({
    x: .5 + (point.x - .5) * c + point.z * s + .12,
    y: point.y + .06,
    z: point.z * c - (point.x - .5) * s,
  })) })
  assert.equal(original.length, 7)
  for (let i = 0; i < original.length; i++) {
    const a = original[i]!, b = rotated[i]!
    assert.ok(Math.abs(b.center.y - a.center.y - .06 * sampleFrame.height) < .01)
    assert.ok(b.surfaces.every(surface => surface.vertices.every(point => [point.x, point.y, point.z].every(Number.isFinite))))
  }
  assert.ok(Math.abs(rotated[1]!.center.z - rotated[2]!.center.z) > 50)
})

test('two visor emitters spread forward and both sweep in the direction of a head turn', () => {
  const emitters = resolveRig(sampleFrame).flatMap(part =>
    part.surfaces.filter(surface => surface.material === 'light'))
  assert.equal(emitters.length, 2)
  const left = { x: 300, y: 215 }, right = { x: 420, y: 215 }
  const front = { x: 0, y: 0 }
  assert.ok(laserTarget(left, front, 720, 600).x < left.x)
  assert.ok(laserTarget(right, front, 720, 600).x > right.x)
  for (const origin of [left, right]) {
    assert.equal(laserTarget(origin, { x: .4, y: 0 }, 720, 600).x, 744)
    assert.equal(laserTarget(origin, { x: -.4, y: 0 }, 720, 600).x, -24)
  }
})

test('the spirit rig has one mouth emitter and no eye lasers', () => {
  const resolved = resolveRig(sampleFrame, 'no-face').flatMap(part => part.surfaces)
  assert.equal(resolved.filter(surface => surface.material === 'mouth').length, 1)
  assert.equal(resolved.filter(surface => surface.material === 'light').length, 0)
  assert.ok(resolved.some(surface => surface.material === 'hood'))
})

test('opening the mouth starts the gold gesture and closing it stops emission', () => {
  const gesture = new MouthGesture()
  const upper = sampleFrame.face[13]!
  function feed(gap: number, timestamp: number) {
    const face = sampleFrame.face.slice()
    face[14] = { ...upper, y: upper.y + gap }
    gesture.update({ ...sampleFrame, face, timestamp })
  }
  feed(.004, 0)
  assert.equal(gesture.open, false)
  feed(.046, 90)
  assert.equal(gesture.open, true)
  feed(.022, 180)
  assert.equal(gesture.open, true, 'small variation should not stop an active gesture')
  feed(.004, 270)
  assert.equal(gesture.open, false)
  gesture.reset()
  assert.equal(gesture.value, 0)
})
