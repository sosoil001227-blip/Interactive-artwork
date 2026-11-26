import test from 'node:test'
import assert from 'node:assert/strict'
import { cameraToScreen, FingerTracker, FINGERTIP_INDICES } from '../src/tracking.ts'
import type { HandLandmarkerResult } from '@mediapipe/tasks-vision'

function result(hands: { x: number; label: string }[]): HandLandmarkerResult {
  return {
    landmarks: hands.map(hand => Array.from({ length: 21 }, (_, index) => ({ x: hand.x + index * .001, y: .45, z: 0 }))),
    handedness: hands.map(hand => [{ categoryName: hand.label, displayName: hand.label, score: 1, index: 0 }]),
    worldLandmarks: [],
  }
}

test('camera and fingertips share a mirrored cover transform in landscape and portrait', () => {
  assert.deepEqual(cameraToScreen(.5, .5, 1280, 720, 1440, 900), { x: .5, y: .5 })
  assert.deepEqual(cameraToScreen(0, 0, 1280, 720, 1280, 720), { x: 1, y: 0 })
  assert.deepEqual(cameraToScreen(1, 1, 1280, 720, 1280, 720), { x: 0, y: 1 })
  const portraitLeft = cameraToScreen(0, .5, 1280, 720, 390, 844)
  assert.ok(portraitLeft.x > 1, 'cropped video landmarks must be outside the portrait viewport')
})

test('all five fingertips on both hands create independent contacts', () => {
  const tracker = new FingerTracker()
  const tracked = tracker.update(result([{ x: .25, label: 'Left' }, { x: .7, label: 'Right' }]), 1000, 1280, 720, 1280, 720)
  assert.deepEqual(FINGERTIP_INDICES, [4, 8, 12, 16, 20])
  assert.equal(tracked.fingers.length, 10)
  assert.equal(tracked.touches.length, 10)
  assert.equal(new Set(tracked.fingers.map(f => f.id)).size, 10)
})

test('model output reordering cannot connect fingertips from opposite hands', () => {
  const tracker = new FingerTracker()
  const first = tracker.update(result([{ x: .25, label: 'Left' }, { x: .7, label: 'Right' }]), 1000, 1280, 720, 1280, 720)
  const next = tracker.update(result([{ x: .71, label: 'Right' }, { x: .26, label: 'Left' }]), 1033, 1280, 720, 1280, 720)
  assert.equal(next.fingers[0]!.id, first.fingers[5]!.id)
  assert.equal(next.fingers[5]!.id, first.fingers[0]!.id)
  for (const touch of next.touches) assert.ok(Math.abs(touch.x - touch.previousX) < .02)
})

test('moving fingers produce continuous wakes with speed-dependent energy', () => {
  const tracker = new FingerTracker()
  tracker.update(result([{ x: .35, label: 'Left' }]), 1000, 1280, 720, 1280, 720)
  const still = tracker.update(result([{ x: .35, label: 'Left' }]), 1033, 1280, 720, 1280, 720)
  const moving = tracker.update(result([{ x: .40, label: 'Left' }]), 1066, 1280, 720, 1280, 720)
  assert.ok(moving.touches[0]!.force > still.touches[0]!.force)
  assert.notEqual(moving.touches[0]!.x, moving.touches[0]!.previousX)
})

test('missing, stale or newly reacquired hands never draw a trail across the screen', () => {
  const tracker = new FingerTracker()
  tracker.update(result([{ x: .25, label: 'Left' }]), 1000, 1280, 720, 1280, 720)
  assert.equal(tracker.update(result([]), 1033, 1280, 720, 1280, 720).touches.length, 0)
  const reacquired = tracker.update(result([{ x: .75, label: 'Left' }]), 1066, 1280, 720, 1280, 720)
  for (const touch of reacquired.touches) assert.equal(touch.x, touch.previousX)
  const stale = tracker.update(result([{ x: .76, label: 'Left' }]), 1500, 1280, 720, 1280, 720)
  for (const touch of stale.touches) assert.equal(touch.x, touch.previousX)
})
