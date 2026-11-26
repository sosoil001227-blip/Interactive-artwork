import test from 'node:test'
import assert from 'node:assert/strict'
import { BoGesture } from '../src/boGesture.ts'
import { boCameraUV, boChannels, boFaceOutline, liveBoFit, morphBoFit, morphBoOutline, targetBoFit } from '../src/boMorph.ts'
import { sampleFrame, resolveRig } from '../src/rig.ts'
import type { TrackingFrame } from '../src/tracking.ts'

function frame(now: number, puff = 0): TrackingFrame {
  const face = sampleFrame.face.map(p => ({ ...p }))
  for (const [i, x, y, z] of [[10, .5, .22, 0], [152, .5, .78, 0], [33, .35, .40, 0], [263, .65, .40, 0],
    [133, .43, .40, 0], [362, .57, .40, 0], [1, .5, .5, -.06], [168, .5, .44, -.02],
    [205, .31 - .025 * puff, .57, -.01 - .035 * puff], [425, .69 + .025 * puff, .57, -.01 - .035 * puff],
    [234, .24 - .014 * puff, .50, 0], [454, .76 + .014 * puff, .50, 0],
    [13, .5, .64, -.02], [14, .5, .646, -.02], [61, .42, .64, -.015], [291, .58, .64, -.015]]) {
    face[i!] = { x: x!, y: y!, z: z! }
  }
  return { ...sampleFrame, timestamp: now, face, faceMatrix: { rows: 4, columns: 4,
    data: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }, expressions: {} }
}
function ready(gesture: BoGesture) {
  for (let now = 0; now <= 1100; now += 50) gesture.update(frame(now), now)
  assert.equal(gesture.status(1100).stage, 'ready')
  return 1150
}
function feed(gesture: BoGesture, start: number, duration: number, puff: number, change?: (f: TrackingFrame) => void) {
  let now = start
  for (; now < start + duration; now += 50) { const f = frame(now, puff); change?.(f); gesture.update(f, now) }
  return now
}

test('bilateral cheek geometry alone starts blushing and completes the transformation after a sustained puff', () => {
  const g = new BoGesture(), start = ready(g)
  let now = feed(g, start, 1000, 1)
  assert.equal(g.status(now - 50).stage, 'blushing'); assert.ok(g.progress > 0 && g.progress < .43)
  now = feed(g, now, 2500, 1)
  assert.equal(g.status(now - 50).stage, 'bo'); assert.equal(g.progress, 1)
})

test('a subtle sustained change in just the lower cheek outline finishes without a cheekPuff score or inner cheek movement', () => {
  const gesture = new BoGesture(), start = ready(gesture)
  const now = feed(gesture, start, 3600, 0, f => {
    for (const [left, right] of [[93, 323], [132, 361], [58, 288], [172, 397]]) {
      f.face[left!]!.x -= .003
      f.face[right!]!.x += .003
    }
  })
  assert.equal(gesture.status(now - 50).stage, 'bo')
})

test('neutral expressions, short puffs, an open mouth, smiling and head turns do not complete Bo', () => {
  for (const condition of ['neutral', 'open', 'smile', 'turn'] as const) {
    const g = new BoGesture(), start = ready(g)
    const now = feed(g, start, 3500, condition === 'neutral' ? 0 : 1, f => {
      if (condition === 'open') f.face[14]!.y += .12
      if (condition === 'smile') f.expressions = { mouthSmileLeft: .9, mouthSmileRight: .9 }
      if (condition === 'turn') f.face[1]!.x += .12
    })
    assert.equal(g.status(now - 50).progress, 0, condition)
  }
  const g = new BoGesture(), start = ready(g)
  feed(g, start, 200, 1)
  assert.equal(g.progress, 0)
})

test('a one-sided cheek change and camera translation or zoom do not imitate a bilateral puff', () => {
  for (const condition of ['one-sided', 'translate', 'zoom'] as const) {
    const g = new BoGesture(), start = ready(g)
    feed(g, start, 3500, 0, f => {
      if (condition === 'one-sided') { f.face[205]!.x -= .035; f.face[205]!.z -= .035 }
      else for (const p of f.face) {
        if (condition === 'translate') { p.x += .06; p.y += .04 }
        else { p.x = .5 + (p.x - .5) * 1.15; p.y = .5 + (p.y - .5) * 1.15; p.z *= 1.15 }
      }
    })
    assert.equal(g.progress, 0, condition)
  }
})

test('releasing cheeks reverses an incomplete transition while a completed Bo persists until reset', () => {
  const g = new BoGesture(), start = ready(g)
  let now = feed(g, start, 1200, 1)
  assert.ok(g.progress > 0)
  now = feed(g, now, 3500, 0)
  assert.equal(g.progress, 0)
  now = feed(g, now, 4000, 1)
  assert.equal(g.progress, 1)
  now = feed(g, now, 1500, 0)
  assert.equal(g.status(now - 50).stage, 'bo')
  g.reset()
  assert.equal(g.status(now).stage, 'calibrating'); assert.equal(g.progress, 0)
})

test('missing or stale face frames cannot advance a transformation and reset requires a new neutral calibration', () => {
  const g = new BoGesture(), start = ready(g)
  let now = feed(g, start, 1000, 1), progress = g.progress
  for (let i = 0; i < 12; i++, now += 50) g.update({ ...frame(now), face: [] }, now)
  assert.equal(g.progress, progress); assert.equal(g.status(now - 50).tracked, false)
  g.update(frame(now + 5000, 1), now + 5000)
  assert.equal(g.progress, progress)
  g.reset(); g.update(frame(now + 5050), now + 5050)
  assert.equal(g.status(now + 5050).stage, 'calibrating')
})

test('the real camera blushes and flattens before a whole-scene dissolve removes it completely', () => {
  assert.equal(boChannels(0).video, 1); assert.equal(boChannels(0).cartoon, 0)
  const early = boChannels(.20)
  assert.ok(early.blush > 0 && early.flatten > 0); assert.equal(early.cartoon, 0)
  const final = boChannels(1)
  assert.equal(final.video, 0); assert.equal(final.cartoon, 1); assert.equal(final.body, 1)
  assert.ok(final.background > .6 && final.background < 1)
  for (let i = 0; i <= 100; i++) assert.ok(Object.values(boChannels(i / 100)).every(v => Number.isFinite(v) && v >= 0 && v <= 1))
})

test('the moving live head converges to the complete character layout rather than remaining a face-worn rig', () => {
  const project = (p: { x: number; y: number; z: number }) => ({ x: 720 - p.x, y: p.y, z: p.z })
  const live = liveBoFit(frame(0), project)!, target = targetBoFit(720, 720)
  assert.deepEqual(morphBoFit(live, target, 0), live)
  assert.deepEqual(morphBoFit(live, target, 1), target)
  assert.equal(resolveRig(frame(0), 'bo').length, 0)
  assert.ok(resolveRig(frame(0), 'no-face').length > 0, 'the existing No-Face rig stays available')
})

test('the live outline starts in place and deforms into Boh before the seated body appears', () => {
  const project = (p: { x: number; y: number; z: number }) => ({ x: 720 - p.x, y: p.y, z: p.z })
  const source = boFaceOutline(frame(0), project)!
  const fit = liveBoFit(frame(0), project)!
  assert.equal(source.edge.length, 36)
  assert.deepEqual(morphBoOutline(source, fit, 0), source)
  const halfway = boChannels(.50)
  assert.equal(halfway.body, 0)
  assert.ok(halfway.contour > .3 && halfway.contour < 1)
  const rounded = morphBoOutline(source, fit, 1)
  assert.ok(rounded.edge[8]!.x > fit.x && rounded.edge[28]!.x < fit.x)
  assert.ok(rounded.edge[0]!.y < fit.y && rounded.edge[18]!.y > fit.y)
  assert.equal(boFaceOutline({ ...frame(0), face: [] }, project), undefined)
})

test('inverse cheek deformation is continuous, preserves neutral pixels and stays inside source bounds', () => {
  const face = { x: .5, y: .5, width: .5, height: .6 }
  assert.deepEqual(boCameraUV(.35, .55, face, 0), { u: .35, v: .55 })
  const inflated = boCameraUV(.35, .55, face, .20)
  assert.ok(inflated.u > .35 && inflated.u < .5)
  for (let i = 0; i <= 100; i++) {
    const uv = boCameraUV(i / 100, i / 100, face, .20)
    assert.ok(uv.u >= 0 && uv.u <= 1 && uv.v >= 0 && uv.v <= 1)
  }
})
