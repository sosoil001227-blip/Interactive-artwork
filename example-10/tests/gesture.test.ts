import test from 'node:test'
import assert from 'node:assert/strict'
import { JellyGesture, readCorners, readGap, cameraToScreen } from '../src/gesture.ts'
import { handFrame } from './fixtures.ts'
import type { HandLandmarkerResult } from '@mediapipe/tasks-vision'

const read = (frame = handFrame()) => readCorners(frame, 1000, 700, 1000, 700)

test('anatomical left ㄴ and right ㄱ frame the empty space between finger-axis intersections', () => {
  const hands = read()
  assert.equal(hands.length, 2)
  assert.ok(hands.every(hand => hand.valid))
  const gap = readGap(hands)!
  assert.ok(Math.abs(gap.x - 500) < .001)
  assert.ok(Math.abs(gap.y - 340) < .001)
  assert.equal(Math.round(gap.radiusX), 160)
  assert.ok(gap.radiusY < 70, 'hole must remain inside the fingers, rather than over the palms')
})

test('camera and corner coordinates share the same mirrored cover mapping', () => {
  assert.deepEqual(cameraToScreen({ x: .5, y: .5 }, 1280, 720, 390, 844), { x: 195, y: 422 })
  assert.equal(cameraToScreen({ x: 0, y: 0 }, 1000, 700, 1000, 700).x, 1000)
  const portrait = readCorners(handFrame(), 1000, 700, 390, 844)
  const gap = readGap(portrait)!
  assert.ok(Math.abs(gap.x - 195) < .001)
})

test('one hand, duplicated landmarks, low confidence and malformed landmarks cannot form a gap', () => {
  assert.equal(readGap(read().slice(0, 1)), undefined)
  const duplicate = handFrame(); duplicate.landmarks[1] = structuredClone(duplicate.landmarks[0]!)
  assert.equal(readGap(read(duplicate)), undefined)
  const weak = handFrame(); weak.handedness[0]![0]!.score = .2
  assert.equal(readGap(read(weak)), undefined)
  const malformed = handFrame(); malformed.landmarks[0]![8]!.x = NaN
  assert.equal(read(malformed).length, 1)
})

test('open palms, bent index fingers and wrong-facing brackets are rejected', () => {
  const open = handFrame()
  for (const tip of [12, 16, 20]) {
    const hand = open.landmarks[0]!
    hand[tip]!.y = hand[tip - 2]!.y - .13
  }
  assert.equal(readGap(read(open)), undefined)
  const bent = handFrame(); bent.landmarks[0]![8]!.y = .6
  assert.equal(readGap(read(bent)), undefined)
  const outward = handFrame()
  outward.landmarks[0]!.forEach(point => { point.x = 1.4 - point.x })
  assert.equal(readGap(read(outward)), undefined)
})

test('separate L shapes must align across the same space, and crossed hands are rejected', () => {
  const frame = handFrame()
  frame.landmarks[1]!.forEach(p => { p.y += .2 })
  assert.equal(readGap(read(frame)), undefined)
  assert.equal(readGap(read(handFrame(-60))), undefined)
})

test('tracking follows hand motion and horizontal separation grows and shrinks the hole', () => {
  const gesture = new JellyGesture()
  gesture.update(read(handFrame(220)), 0)
  let state = gesture.update(read(handFrame(220)), 200)
  assert.equal(state.opened, true)
  const radius = state.radiusX, x = state.x, y = state.y
  for (let time = 233; time < 900; time += 33) state = gesture.update(read(handFrame(400, 45, 20)), time)
  assert.ok(state.radiusX > radius * 1.7)
  assert.ok(state.x > x + 120 && state.y > y + 15)
  for (let time = 900; time < 1500; time += 33) state = gesture.update(read(handFrame(220)), time)
  assert.ok(Math.abs(state.radiusX - radius) < 1)
  assert.ok(readGap(read(handFrame(800, -200))), 'wide horizontal stretching must keep an aligned portal open')
})

test('continuous alignment opens once, charges for about two seconds and releases repeated candy bursts', () => {
  const gesture = new JellyGesture()
  let opened = 0, bursts = 0, firstBurst = 0
  for (let now = 0; now <= 6000; now += 33) {
    const state = gesture.update(read(), now)
    if (state.opened) opened++
    if (state.burst) { bursts++; firstBurst ||= now }
  }
  assert.equal(opened, 1); assert.equal(bursts, 2)
  assert.ok(firstBurst >= 2080 && firstBurst <= 2200)
})

test('relaxing either hand closes immediately and emits only one collapse event', () => {
  const gesture = new JellyGesture()
  gesture.update(read(), 0); gesture.update(read(), 200)
  const state = gesture.update(read().slice(0, 1), 233)
  assert.equal(state.active, false); assert.equal(state.closed, true); assert.equal(state.burst, false)
  assert.equal(gesture.update([], 266).closed, false)
  assert.equal(gesture.update(read(), 299).active, false)
})

test('stalled input, background gaps and reset cannot finish a charge or trigger a burst', () => {
  const gesture = new JellyGesture()
  gesture.update(read(), 0); gesture.update(read(), 200)
  const stale = gesture.update(read(), 2500)
  assert.equal(stale.active, false); assert.equal(stale.closed, true); assert.equal(stale.burst, false)
  gesture.update(read(), 2533)
  assert.equal(gesture.update(read(), 2733).opened, true)
  gesture.reset()
  assert.equal(gesture.update(read(), 2766).active, false)
})

test('MediaPipe output order does not change the two finger-defined corners', () => {
  const frame = handFrame()
  const reversed: HandLandmarkerResult = { ...frame, landmarks: [...frame.landmarks].reverse(), handedness: [...frame.handedness].reverse() }
  assert.deepEqual(readGap(read(reversed)), readGap(read(frame)))
})

test('swapped or duplicated handedness labels cannot block a visibly aligned ㄴ / ㄱ pair', () => {
  const expected = readGap(read())
  const swapped = handFrame()
  ;[swapped.handedness[0], swapped.handedness[1]] = [swapped.handedness[1]!, swapped.handedness[0]!]
  assert.deepEqual(readGap(read(swapped)), expected)
  const duplicateLabel = handFrame(); duplicateLabel.handedness[1]![0]!.categoryName = 'Left'
  assert.deepEqual(readGap(read(duplicateLabel)), expected)
  const gesture = new JellyGesture()
  let opened = false, burst = false
  for (let now = 0; now < 2500; now += 33) {
    const state = gesture.update(read(swapped), now)
    opened ||= state.opened; burst ||= state.burst
  }
  assert.ok(opened && burst, 'mirrored labels must not stall the full interaction')
})

test('two same-facing brackets still cannot open the portal, regardless of metadata', () => {
  const frame = handFrame()
  frame.landmarks[1]!.forEach(point => { point.x = .6 - point.x; point.y = 540 / 700 - point.y })
  const hands = read(frame)
  assert.ok(hands.every(hand => hand.role === 'lower-left'))
  assert.equal(readGap(hands), undefined)
})

test('the thumb may bend naturally while its overall direction still frames a right angle', () => {
  const frame = handFrame()
  frame.landmarks[0]![3]!.y -= 45 / 700
  assert.equal(read(frame)[0]!.issue, undefined)
  assert.ok(readGap(read(frame)))
})

test('3D articulation distinguishes genuinely open fingers from projection overlap', () => {
  const frame = handFrame()
  frame.worldLandmarks = frame.landmarks.map(hand => hand.map(p => ({ x: p.x, y: p.y * .7, z: 0 })))
  assert.ok(readGap(read(frame)))
  const world = frame.worldLandmarks[0]!
  for (const base of [9, 13, 17]) {
    for (let offset = 1; offset <= 3; offset++) world[base + offset] = { ...world[base]!, z: -offset * .08 }
  }
  assert.equal(read(frame)[0]!.issue, 'fold')
  assert.equal(readGap(read(frame)), undefined)
})

test('3D articulation remains usable when projected intermediate joints are noisy', () => {
  const frame = handFrame()
  frame.worldLandmarks = frame.landmarks.map(hand => hand.map(p => ({ x: p.x, y: p.y * .7, z: 0 })))
  frame.landmarks[0]![6]!.x += .045
  frame.landmarks[0]![7]!.x -= .045
  assert.ok(readGap(read(frame)))
})

test('ㄱ accepts the natural index-left/thumb-down pose, not just index-down/thumb-left', () => {
  const frame = handFrame()
  // Reflect about the diagonal through the top-right corner, exchanging the
  // vertical and horizontal finger legs without changing their articulation.
  frame.landmarks[1] = frame.landmarks[1]!.map(p => {
    const x = (1 - p.x) * 1000, y = p.y * 700
    return { x: 1 - (700 - (y - 270)) / 1000, y: (270 - (x - 700)) / 700, z: p.z }
  })
  const hands = read(frame)
  assert.ok(hands[1]!.valid)
  assert.equal(hands[1]!.role, 'upper-right')
  assert.equal(hands[1]!.vertical, hands[1]!.thumb)
  const gap = readGap(hands)!
  assert.ok(gap && Math.abs(gap.x - 500) < .001 && Math.abs(gap.y - 340) < .001)
  const gesture = new JellyGesture()
  let opened = false, burst = false
  for (let now = 0; now < 2500; now += 33) {
    const state = gesture.update(hands, now)
    opened ||= state.opened; burst ||= state.burst
  }
  assert.ok(opened && burst)
})

test('ㄴ also accepts thumb-up/index-right while keeping the hole inside the same gap', () => {
  const frame = handFrame()
  frame.landmarks[0] = frame.landmarks[0]!.map(p => {
    const x = (1 - p.x) * 1000, y = p.y * 700
    return { x: 1 - (300 - (y - 410)) / 1000, y: (410 - (x - 300)) / 700, z: p.z }
  })
  const hands = read(frame)
  assert.equal(hands[0]!.role, 'lower-left')
  assert.equal(hands[0]!.vertical, hands[0]!.thumb)
  const gap = readGap(hands)!
  assert.ok(gap && Math.abs(gap.x - 500) < .001 && Math.abs(gap.y - 340) < .001)
})
