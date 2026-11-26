import test from 'node:test'
import assert from 'node:assert/strict'
import { FingerResonance } from '../src/resonance.ts'
import { MagicGesture, readPalms } from '../src/gestures.ts'
import type { HandLandmarkerResult } from '@mediapipe/tasks-vision'
import { handFrame } from './fixtures.ts'

const read = (frame: HandLandmarkerResult) => readPalms(frame, 1280, 720, 1280, 720)
function wiggle(amount: number) {
  const frame = handFrame('inward', true)
  // Bend the left-side hand's fingertips toward its own palm normal.
  for (const index of [4, 8, 12, 16, 20]) frame.worldLandmarks[0]![index]!.x -= .045 * amount
  return frame
}

test('only finger movement on spread, charged hands creates resonance', () => {
  const motion = new FingerResonance()
  assert.equal(motion.update(read(wiggle(0)), 1000, false), 0)
  assert.equal(motion.update(read(wiggle(1)), 1033, false), 0)
  assert.equal(motion.update(read(wiggle(0)), 1066, true), 0)
  let energy = 0
  for (let i = 1; i < 8; i++) energy = motion.update(read(wiggle(i % 2)), 1066 + i * 33, true)
  assert.ok(energy > .6, `articulating one hand must energize the circle: ${energy}`)
})

test('stationary fingers remain quiet and movement decays after stopping', () => {
  const motion = new FingerResonance()
  const stationary = read(wiggle(0))
  for (let i = 0; i < 10; i++) assert.equal(motion.update(stationary, 1000 + i * 33, true), 0)
  let energy = 0
  for (let i = 10; i < 18; i++) energy = motion.update(read(wiggle(i % 2)), 1000 + i * 33, true)
  assert.ok(energy > .6)
  const moving = energy
  const stopped = read(wiggle(1))
  for (let i = 18; i < 42; i++) energy = motion.update(stopped, 1000 + i * 33, true)
  assert.ok(energy < .05 && energy < moving, `quiet hands must settle: ${energy}`)
})

test('whole-hand translation and rotation do not count as finger articulation', () => {
  const motion = new FingerResonance()
  const base = handFrame('inward', true)
  motion.update(read(base), 1000, true)
  const moved = structuredClone(base)
  moved.worldLandmarks = moved.worldLandmarks.map(hand => hand.map(p => ({
    x: p.x * Math.cos(.7) - p.z * Math.sin(.7) + .4,
    y: p.y - .2,
    z: p.x * Math.sin(.7) + p.z * Math.cos(.7) + .3,
  })))
  assert.ok(motion.update(read(moved), 1033, true) < .00001)
})

test('tracking loss, reappearance and stale video never create a resonance impulse', () => {
  const motion = new FingerResonance()
  motion.update(read(wiggle(0)), 1000, true)
  assert.ok(motion.update(read(wiggle(1)), 1033, true) > 0)
  assert.equal(motion.update([], 1066, true), 0)
  assert.equal(motion.update(read(wiggle(0)), 1099, true), 0)
  assert.equal(motion.update(read(wiggle(1)), 2000, true), 0)
  assert.equal(motion.update(read(wiggle(0)), 2033, false), 0)
})

test('charged hands can flex all fingers, and closed hands cannot launch', () => {
  const gesture = new MagicGesture()
  const frame = (wide = false) => read(handFrame('inward', wide))
  gesture.update(frame(), 1000); gesture.update(frame(), 1240)
  gesture.update(frame(true), 1280)
  assert.equal(gesture.update(frame(true), 1480).phase, 'ready')
  const closed = read(handFrame('front', true)).map(p => ({ ...p, extended: 0 }))
  for (const now of [1520, 1640, 1760, 1880]) {
    const state = gesture.update(closed, now)
    assert.equal(state.phase, 'ready'); assert.equal(state.launch, undefined)
  }
})
