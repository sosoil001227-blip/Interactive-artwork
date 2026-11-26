import test from 'node:test'
import assert from 'node:assert/strict'
import { cameraToScreen, HandStabilizer, TIPS } from '../src/tracking.ts'
import { frame, pose } from './fixtures.ts'

test('all 42 joints and ten fingertips share the mirrored camera cover transform', () => {
  assert.deepEqual(cameraToScreen({ x: .5, y: .5, z: 0 }, 1280, 720, 390, 844), { x: 195, y: 422, z: 0 })
  const tracker = new HandStabilizer()
  const hands = tracker.update(frame([pose(), pose(700, 230, 'Right')]), 1000, 700, 1000, 700, 1000)
  assert.equal(hands.left?.points.length, 21); assert.equal(hands.right?.points.length, 21)
  assert.deepEqual(TIPS, [4, 8, 12, 16, 20])
  assert.ok(hands.left!.center.x < hands.right!.center.x)
})

test('model result ordering and initial reversed label conventions do not reverse the controls', () => {
  const tracker = new HandStabilizer()
  let hands = tracker.update(frame([pose(700, 220, 'Left'), pose(300, 220, 'Right')]), 1000, 700, 1000, 700, 1000)
  assert.equal(hands.left?.label, 'Right'); assert.equal(hands.right?.label, 'Left')
  hands = tracker.update(frame([pose(310, 220, 'Right'), pose(710, 220, 'Left')]), 1000, 700, 1000, 700, 1033)
  assert.ok(hands.left!.center.x < 350 && hands.right!.center.x > 650)
})

test('a missing left hand never transfers puppet control to the remaining right hand', () => {
  const tracker = new HandStabilizer()
  tracker.update(frame([pose(), pose(700, 220, 'Right')]), 1000, 700, 1000, 700, 1000)
  tracker.update(frame([pose(690, 230, 'Right')]), 1000, 700, 1000, 700, 1200)
  const hands = tracker.snapshot(1230)
  assert.equal(hands.left, undefined); assert.ok(hands.right)
  assert.deepEqual(tracker.snapshot(1500), { left: undefined, right: undefined })
})

test('brief left/right metadata errors do not jump the two controls across the screen', () => {
  const tracker = new HandStabilizer()
  tracker.update(frame([pose(), pose(700, 220, 'Right')]), 1000, 700, 1000, 700, 1000)
  const hands = tracker.update(frame([pose(302, 220, 'Right'), pose(698, 220, 'Left')]), 1000, 700, 1000, 700, 1033)
  assert.ok(hands.left!.center.x < 350 && hands.right!.center.x > 650)
})

test('joint smoothing reduces small landmark jitter and still follows deliberate motion', () => {
  const tracker = new HandStabilizer()
  let deviation = 0
  for (let i = 0; i < 30; i++) {
    const hand = pose(300 + (i % 2 ? 4 : -4))
    const hands = tracker.update(frame([hand]), 1000, 700, 1000, 700, 1000 + i * 33)
    if (i > 5) deviation += Math.abs(hands.left!.points[8]!.x - 268)
  }
  assert.ok(deviation / 24 < 3)
  const moved = tracker.update(frame([pose(400)]), 1000, 700, 1000, 700, 2000)
  assert.ok(moved.left!.center.x > 360)
  tracker.reset(); assert.deepEqual(tracker.snapshot(2001), { left: undefined, right: undefined })
})

test('invalid or low confidence detections do not create stale control poses', () => {
  const tracker = new HandStabilizer(), source = frame([pose()])
  source.handedness[0]![0]!.score = .1
  assert.equal(tracker.update(source, 1000, 700, 1000, 700, 1000).left, undefined)
  source.handedness[0]![0]!.score = 1; source.landmarks[0]![8]!.x = NaN
  assert.equal(tracker.update(source, 1000, 700, 1000, 700, 1000).left, undefined)
})
