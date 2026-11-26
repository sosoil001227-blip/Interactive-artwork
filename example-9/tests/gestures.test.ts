import test from 'node:test'
import assert from 'node:assert/strict'
import { cameraToScreen, MagicGesture, readPalms } from '../src/gestures.ts'
import type { Palm, Vec3 } from '../src/gestures.ts'
import { handFrame } from './fixtures.ts'

const normals = { inward: [{ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }],
  front: [{ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: -1 }],
  back: [{ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 1 }] }
function palms(pose: keyof typeof normals, wide = false): Palm[] {
  return ['Right', 'Left'].map((label, index) => ({ label, center: { x: index ? (wide ? 800 : 650) : (wide ? 200 : 350), y: 400 },
    points: Array.from({ length: 21 }, () => ({ x: 0, y: 0 })), normal: normals[pose][index] as Vec3, size: 100, extended: 5, confidence: .99 }))
}
function summon(gesture: MagicGesture) {
  gesture.update(palms('inward'), 1000)
  return gesture.update(palms('inward'), 1240)
}
function charge(gesture: MagicGesture) {
  summon(gesture)
  gesture.update(palms('inward', true), 1280)
  return gesture.update(palms('inward', true), 1480)
}

test('mirrored cover mapping keeps palms aligned on landscape and portrait video', () => {
  assert.deepEqual(cameraToScreen({ x: .5, y: .5 }, 1280, 720, 390, 844), { x: 195, y: 422 })
  assert.equal(cameraToScreen({ x: 0, y: 0 }, 1280, 720, 1280, 720).x, 1280)
})

test('3D palm geometry distinguishes inward palms, camera-facing palms and backs', () => {
  for (const pose of ['inward', 'front', 'back'] as const) {
    const hands = readPalms(handFrame(pose), 1280, 720, 1280, 720).sort((a, b) => a.center.x - b.center.x)
    assert.equal(hands.length, 2)
    assert.ok(hands.every(h => h.points.length === 21 && h.extended >= 4))
    if (pose === 'inward') { assert.ok(hands[0]!.normal.x > .95); assert.ok(hands[1]!.normal.x < -.95) }
    else hands.forEach(h => assert.ok(pose === 'front' ? h.normal.z < -.95 : h.normal.z > .95))
  }
})

test('only sustained inward-facing open palms summon a circle', () => {
  const gesture = new MagicGesture()
  assert.equal(gesture.update(palms('front'), 1000).phase, 'gather')
  assert.equal(gesture.update(palms('front'), 1200).phase, 'gather')
  const closed = palms('inward').map(p => ({ ...p, extended: 1 }))
  assert.equal(gesture.update(closed, 1300).visible, false)
  assert.equal(gesture.update(palms('inward').slice(0, 1), 1400).visible, false)
  gesture.update(palms('inward'), 1500)
  assert.equal(gesture.update(palms('inward'), 1600).phase, 'gather')
  assert.equal(gesture.update(palms('inward'), 1740).phase, 'grow')
})

test('horizontal hand separation grows the circle and arms the forward gesture', () => {
  const gesture = new MagicGesture()
  const start = summon(gesture)
  const wide = gesture.update(palms('inward', true), 1280)
  assert.ok(wide.radius > start.radius)
  assert.equal(gesture.update(palms('inward', true), 1480).phase, 'ready')
})

test('summoning emits one sound cue only when a new circle is created', () => {
  const gesture = new MagicGesture()
  assert.equal(gesture.update(palms('inward'), 1000).summoned, false)
  assert.equal(gesture.update(palms('inward'), 1240).summoned, true)
  assert.equal(gesture.update(palms('inward'), 1280).summoned, false)
  gesture.update(palms('inward', true), 1340)
  assert.equal(gesture.update(palms('inward', true), 1540).summoned, false)
  // Shrinking an existing charged circle is not a new summoning.
  assert.equal(gesture.update(palms('inward'), 1600).summoned, false)
  gesture.update([], 1660); gesture.update([], 2200)
  gesture.update(palms('inward'), 2240)
  assert.equal(gesture.update(palms('inward'), 2480).summoned, true)
})

test('a charged circle fires once only after both palms face the camera', () => {
  const gesture = new MagicGesture()
  assert.equal(charge(gesture).phase, 'ready')
  assert.equal(gesture.update(palms('back', true), 1530).launch, undefined)
  const oneFront = palms('front', true); oneFront[1]!.normal = { x: 1, y: 0, z: 0 }
  assert.equal(gesture.update(oneFront, 1600).launch, undefined)
  assert.equal(gesture.update(palms('front', true), 1650).launch, undefined)
  const cast = gesture.update(palms('front', true), 1880)
  assert.equal(cast.phase, 'cast'); assert.ok(cast.launch)
  assert.equal(gesture.update(palms('front', true), 1920).launch, undefined)
  assert.equal(gesture.update(palms('front', true), 3400).phase, 'gather')
  assert.equal(gesture.update(palms('front', true), 3600).phase, 'gather')
})

test('camera-facing hands cannot fire before a circle is summoned and enlarged', () => {
  const gesture = new MagicGesture()
  summon(gesture)
  for (const time of [1300, 1500, 1700, 1900]) assert.equal(gesture.update(palms('front'), time).launch, undefined)
})

test('angled palms that summon a circle must rotate farther before firing', () => {
  const gesture = new MagicGesture()
  const angled = (wide = false) => palms('inward', wide).map((p, index) => ({ ...p,
    normal: { x: index ? -.8 : .8, y: 0, z: -.6 } }))
  gesture.update(angled(), 1000)
  assert.equal(gesture.update(angled(), 1240).phase, 'grow')
  gesture.update(angled(true), 1280)
  assert.equal(gesture.update(angled(true), 1480).phase, 'ready')
  for (const now of [1600, 1800, 2000]) assert.equal(gesture.update(angled(true), now).launch, undefined)
  gesture.update(palms('front', true), 2100)
  assert.ok(gesture.update(palms('front', true), 2340).launch)
})

test('tracking loss and a background pause cancel gesture dwell', () => {
  const gesture = new MagicGesture()
  charge(gesture)
  gesture.update(palms('front', true), 1530)
  assert.equal(gesture.update([], 1600).launch, undefined)
  assert.equal(gesture.update([], 2100).phase, 'gather')
  gesture.update(palms('inward'), 2200)
  assert.equal(gesture.update(palms('inward'), 5000).phase, 'gather')
})

test('brief occlusion preserves a summoned circle, but never completes a cast', () => {
  const gesture = new MagicGesture()
  charge(gesture)
  gesture.update(palms('front', true), 1520)
  const occluded = gesture.update([], 1600)
  assert.equal(occluded.phase, 'ready'); assert.equal(occluded.launch, undefined)
  assert.equal(gesture.update(palms('front', true), 1640).launch, undefined)
})

test('full landmark extraction drives the complete summon, grow, cast sequence', () => {
  const gesture = new MagicGesture()
  const read = (pose: 'inward' | 'front', wide = false) => readPalms(handFrame(pose, wide), 1280, 720, 1440, 1000)
  gesture.update(read('inward'), 1000)
  assert.equal(gesture.update(read('inward'), 1240).phase, 'grow')
  gesture.update(read('inward', true), 1280)
  assert.equal(gesture.update(read('inward', true), 1480).phase, 'ready')
  gesture.update(read('front', true), 1520)
  assert.ok(gesture.update(read('front', true), 1760).launch)
})
