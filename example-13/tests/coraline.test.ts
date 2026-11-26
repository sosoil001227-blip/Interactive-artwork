import test from 'node:test'
import assert from 'node:assert/strict'
import { CoralineGesture, coralineEyes, eyeRingMatches, outfitMs, ringHoldMs } from '../src/coralineGesture.ts'
import { sampleFrame } from '../src/rig.ts'
import type { TrackedHand, TrackingFrame } from '../src/tracking.ts'

function frame(timestamp: number, pitch = 0): TrackingFrame {
  const cos = Math.cos(pitch), sin = Math.sin(pitch)
  return { ...sampleFrame, timestamp, handTracking: 'ready', faceMatrix: { rows: 4, columns: 4,
    data: [1, 0, 0, 0, 0, cos, -sin, 0, 0, sin, cos, 0, 0, 0, 0, 1] } }
}

function ring(frame: TrackingFrame, x: number, y: number, label: TrackedHand['label'], open = false): TrackedHand {
  const at = (dx: number, dy: number) => ({ x: (x + dx) / frame.width, y: (y + dy) / frame.height, z: 0 })
  const landmarks = Array.from({ length: 21 }, () => at(0, 25))
  for (const [index, dx, dy] of [[0, 0, 73], [9, 0, 29], [2, -13, 13], [3, -22, -3],
    [4, open ? -24 : -3, open ? -17 : -19], [8, 3, -19], [7, 21, -4], [6, 20, 9], [5, 12, 18]]) {
    landmarks[index!] = at(dx!, dy!)
  }
  return { label, landmarks, worldLandmarks: [] }
}

function both(frame: TrackingFrame) {
  const [a, b] = coralineEyes(frame)!
  return [ring(frame, a!.center.x, a!.center.y, 'Right'), ring(frame, b!.center.x, b!.center.y, 'Left')]
}

function nod(gesture: CoralineGesture) {
  for (let t = 0; t <= 450; t += 50) gesture.update(frame(t), t)
  for (let t = 500; t <= 700; t += 50) gesture.update(frame(t, .27), t)
  assert.equal(gesture.outfitAt, undefined)
  assert.equal(gesture.status(700).nod, 'return')
  for (let t = 750; t <= 1050; t += 50) gesture.update(frame(t), t)
  assert.ok(gesture.outfitAt !== undefined)
  return gesture.outfitAt!
}

function updateWithRings(gesture: CoralineGesture, t: number) {
  const shot = frame(t)
  gesture.update({ ...shot, hands: both(shot) }, t)
}

test('a complete nod starts the outfit before the rings are accepted', () => {
  const g = new CoralineGesture()
  for (let t = 0; t < 900; t += 60) updateWithRings(g, t)
  assert.equal(g.status(900).stage, 'nod')
  assert.equal(g.buttonsAt, undefined)
  g.reset()
  const at = nod(g)
  assert.equal(g.status(at + 100).stage, 'outfit')
  updateWithRings(g, at + outfitMs - 1)
  assert.equal(g.status(at + outfitMs - 1).rings, 0)
  assert.equal(g.status(at + outfitMs).stage, 'rings')
})

test('only two separate closed circles aligned to two eyes are accepted', () => {
  const shot = frame(0), [left, right] = both(shot)
  const [a, b] = coralineEyes(shot)!
  assert.equal(eyeRingMatches({ ...shot, hands: [right!, left!] }), 2)
  assert.equal(eyeRingMatches({ ...shot, hands: [left!] }), 1)
  assert.equal(eyeRingMatches({ ...shot, hands: [left!, ring(shot, a!.center.x + 3, a!.center.y, 'Left')] }), 1)
  assert.equal(eyeRingMatches({ ...shot, hands: [left!, ring(shot, b!.center.x, b!.center.y, 'Left', true)] }), 1)
  assert.equal(eyeRingMatches({ ...shot, hands: [left!, ring(shot, b!.center.x, b!.center.y + 130, 'Left')] }), 1)
  assert.equal(eyeRingMatches({ ...shot, face: [], hands: [left!, right!] }), 0)
  const fist = { ...left!, landmarks: left!.landmarks.map((p, i) => i === 0 || i === 9 ? p : left!.landmarks[4]!) }
  assert.equal(eyeRingMatches({ ...shot, hands: [fist, right!] }), 1)
})

test('both rings have to remain in place, and tracking gaps restart the hold', () => {
  const g = new CoralineGesture()
  const at = nod(g) + outfitMs + 100
  for (let t = at; t < at + 240; t += 60) updateWithRings(g, t)
  assert.ok(g.status(at + 200).progress > 0)
  assert.equal(g.buttonsAt, undefined)
  const lost = at + 240
  g.update(frame(lost), lost)
  assert.equal(g.status(lost).progress, 0)
  updateWithRings(g, lost + 60)
  updateWithRings(g, lost + 370)
  assert.equal(g.status(lost + 370).progress, 0)
  for (let t = lost + 430; t <= lost + 370 + ringHoldMs; t += 60) updateWithRings(g, t)
  assert.equal(g.status(lost + 370 + ringHoldMs).stage, 'buttons')
})

test('button eyes persist when hands lower or tracking is interrupted, and reset returns to the nod', () => {
  const g = new CoralineGesture()
  const at = nod(g) + outfitMs
  for (let t = at; t <= at + ringHoldMs; t += 60) updateWithRings(g, t)
  assert.equal(g.status(at + 700).stage, 'buttons')
  g.clearTracking()
  assert.equal(g.status(at + 750).stage, 'buttons')
  g.reset()
  assert.equal(g.status(at + 800).stage, 'nod')
  assert.equal(g.buttonsAt, undefined)
})
