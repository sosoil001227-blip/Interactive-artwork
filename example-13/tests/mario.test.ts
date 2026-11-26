import test from 'node:test'
import assert from 'node:assert/strict'
import { MarioGesture, ShakeDetector, extendedFingers, openHand, upwardHit, gloveAssemblyMs } from '../src/marioGesture.ts'
import { marioBrickLayout, marioCapBounds } from '../src/marioLayout.ts'
import { sampleFrame } from '../src/rig.ts'
import type { TrackedHand, TrackingFrame } from '../src/tracking.ts'

function head(timestamp: number, yaw = 0, pitch = 0): TrackingFrame {
  const c = Math.cos(yaw), s = Math.sin(yaw), p = Math.cos(pitch), q = Math.sin(pitch)
  return { ...sampleFrame, timestamp, faceMatrix: { rows: 4, columns: 4,
    data: [c, s * q, s * p, 0, 0, p, -q, 0, -s, c * q, c * p, 0, 0, 0, 0, 1] } }
}

function hand(label: TrackedHand['label'], x: number, folded = false): TrackedHand {
  const points = Array.from({ length: 21 }, () => ({ x, y: .72, z: 0 }))
  const mirror = label === 'Left' ? 1 : -1
  for (let finger = 0; finger < 5; finger++) for (let joint = 0; joint < 4; joint++) {
    points[1 + finger * 4 + joint] = finger === 0
      ? { x: x - mirror * (.04 + joint * .027), y: .66 - joint * .012, z: 0 }
      : { x: x + mirror * ((finger - 2.5) * .035), y: .63 - joint * .037, z: 0 }
  }
  if (folded) for (const i of [4, 8, 12, 16, 20]) points[i] = { x, y: .68, z: 0 }
  return { label, landmarks: points, worldLandmarks: [] }
}

test('two open palms on opposite sides mount gloves once', () => {
  const left = hand('Left', .24), right = hand('Right', .76)
  assert.equal(openHand(left), true)
  assert.equal(openHand(right), true)
  assert.equal(openHand(hand('Left', .24, true)), false)
  assert.equal(openHand({ ...left, landmarks: [] }), false)
  const gesture = new MarioGesture()
  const feed = (now: number, hands: TrackedHand[]) => gesture.update({ ...head(now), hands }, now, false)
  for (const now of [0, 80, 160, 240]) feed(now, [left])
  assert.equal(gesture.glovesAt, undefined)
  for (const now of [300, 380, 460]) feed(now, [left, right])
  assert.equal(gesture.glovesAt, undefined)
  feed(520, [left, right])
  assert.equal(gesture.glovesAt, 520)
  feed(600, [left, right])
  assert.equal(gesture.glovesAt, 520, 'holding the pose must not restart the descent')
  assert.equal(gesture.stage(600), 'gloving')
  assert.equal(gesture.stage(520 + gloveAssemblyMs), 'shake')
  gesture.reset()
  assert.equal(gesture.stage(2000), 'spread')
})

test('glove activation tolerates a short missed detection and resets after a longer loss', () => {
  const gesture = new MarioGesture(), hands = [hand('Left', .24), hand('Right', .76)]
  const feed = (now: number, visible = hands) => gesture.update({ ...head(now), hands: visible }, now, false)
  feed(0); feed(100); feed(180, []); feed(220)
  assert.equal(gesture.glovesAt, 220, 'one missed detection should not cancel both open palms')
  gesture.reset()
  feed(0); feed(100); feed(350, []); feed(400); feed(500)
  assert.equal(gesture.glovesAt, undefined)
  feed(1000)
  assert.equal(gesture.glovesAt, undefined)
  feed(1100)
  feed(1200)
  assert.equal(gesture.glovesAt, 1200)
})

test('one uncertain thumb and a tilted palm still count as open while a fist does not', () => {
  const palm = hand('Left', .24)
  assert.equal(extendedFingers(palm), 5)
  const occluded = { ...palm, landmarks: palm.landmarks.map(p => ({ ...p })) }
  occluded.landmarks[4] = { ...occluded.landmarks[3]! }
  assert.equal(extendedFingers(occluded), 4)
  assert.equal(openHand(occluded), true)
  const tilted = { ...palm, landmarks: palm.landmarks.map(p => ({ x: p.x, y: .6, z: 0 })),
    worldLandmarks: palm.landmarks.map(p => ({ x: (p.x - .24) * .8, y: (p.y - .72) * .18, z: (p.y - .72) * .78 })) }
  assert.equal(extendedFingers(tilted), 5)
  assert.equal(openHand(hand('Left', .24, true)), false)
})

test('bricks require alternating head turns; nods and a held turn do not summon them', () => {
  const shake = new ShakeDetector()
  let now = 0
  const feed = (count: number, yaw = 0, pitch = 0) => Array.from({ length: count }, () => shake.update(head(now += 45, yaw, pitch))).filter(Boolean).length
  assert.equal(feed(10), 0)
  assert.equal(feed(8, 0, -.35), 0)
  assert.equal(feed(8), 0)
  assert.equal(feed(8, .40), 0)
  assert.equal(feed(8, .40), 0)
  assert.equal(feed(8, -.40), 0)
  assert.equal(feed(8, .40), 1)
  shake.reset()
  assert.equal(feed(10), 0)
  assert.equal(feed(8, .40), 0)
  now += 900
  assert.equal(feed(8, -.40), 0, 'a stale pose cannot complete an earlier shake')
})

test('a fist or fingertip must cross the underside upwards; hovering, lowering, misses and stale jumps do not hit', () => {
  const box = { x: 200, y: 80, size: 80 }
  assert.equal(upwardHit({ x: 235, y: 185 }, { x: 240, y: 145 }, box, 50), true)
  assert.equal(upwardHit({ x: 235, y: 220 }, { x: 245, y: 100 }, box, 90), true)
  assert.equal(upwardHit({ x: 235, y: 165 }, { x: 235, y: 165 }, box, 50), false)
  assert.equal(upwardHit({ x: 235, y: 145 }, { x: 235, y: 185 }, box, 50), false)
  assert.equal(upwardHit({ x: 100, y: 185 }, { x: 110, y: 145 }, box, 50), false)
  assert.equal(upwardHit({ x: 235, y: 185 }, { x: 240, y: 145 }, box, 500), false)
  assert.equal(upwardHit({ x: 235, y: 185 }, { x: 240, y: -150 }, box, 50), false)
})

test('the five blocks stay inside the full camera frame and above a tilted cap, with a hit at the new underside', () => {
  const width = 960, height = 540
  const cap = marioCapBounds(width / 2, height * .40, 88, .21)
  const box = marioBrickLayout(width, height, cap)!
  assert.ok(box.y + box.size < cap.top)
  const x = box.x + box.size / 2, underside = box.y + box.size
  assert.equal(x, width / 2)
  assert.ok(upwardHit({ x, y: underside + 18 }, { x, y: underside - 8 }, box, 45))
})

test('a cap close to the top moves the entire row to the free upper side on a narrow screen', () => {
  const width = 360, height = 640
  const cap = marioCapBounds(116, 94, 65, -.18)
  const box = marioBrickLayout(width, height, cap)!
  const left = box.x - 2 * box.size, right = box.x + 3 * box.size
  assert.ok(left > cap.right)
  assert.ok(right < width)
  assert.ok(box.y < height * .10)
  assert.equal(marioBrickLayout(width, height, { left: -10, right: width + 10, top: 0, bottom: 160 }), undefined)
})

test('reduced motion still lets gloves and bricks progress in order', () => {
  const gesture = new MarioGesture(), hands = [hand('Left', .24), hand('Right', .76)]
  for (const now of [0, 100, 200]) gesture.update({ ...head(now), hands }, now, true)
  assert.equal(gesture.stage(200), 'shake')
  let now = 200
  for (const yaw of [0, .4, -.4, .4]) for (let i = 0; i < 10; i++) {
    now += 45
    gesture.update({ ...head(now, yaw), hands }, now, true)
  }
  assert.equal(gesture.stage(now), 'play')
  const bricksAt = gesture.bricksAt
  for (let i = 0; i < 10; i++) gesture.update(head(now += 45, -.4), now, true)
  assert.equal(gesture.bricksAt, bricksAt, 'one row must remain attached instead of duplicating')
})
