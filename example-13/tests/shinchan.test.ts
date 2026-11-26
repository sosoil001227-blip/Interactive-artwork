import test from 'node:test'
import assert from 'node:assert/strict'
import { sampleFrame } from '../src/rig.ts'
import { fromPaintSpace, inPaintSpace, paintAnchors, paintParts, ShinchanGesture, shinchanLayout, shinchanStage } from '../src/shinchanGesture.ts'
import type { PaintPart, Point } from '../src/shinchanGesture.ts'
import type { TrackedHand, TrackingFrame } from '../src/tracking.ts'

function bodyFrame(): TrackingFrame {
  const body = Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: 1, presence: 1 }))
  for (const [i, x, y] of [[11, .75, .50], [12, .25, .50], [23, .68, .85], [24, .32, .85]]) body[i!] = { x: x!, y: y!, z: 0, visibility: 1, presence: 1 }
  return { ...sampleFrame, body, bodyTracking: 'ready' }
}
function handAt(p: Point, frame: TrackingFrame, pinch = false, label: TrackedHand['label'] = 'Right'): TrackedHand {
  const landmarks = Array.from({ length: 21 }, () => ({ x: 1 - p.x / frame.width, y: p.y / frame.height, z: 0 }))
  landmarks[0] = { ...landmarks[0]!, y: (p.y + 75) / frame.height }
  landmarks[9] = { ...landmarks[9]!, y: (p.y + 30) / frame.height }
  landmarks[4] = { ...landmarks[4]!, x: 1 - (p.x + (pinch ? 12 : 65)) / frame.width }
  return { label, landmarks, worldLandmarks: [] }
}
function update(g: ShinchanGesture, frame: TrackingFrame, p: Point, now: number, pinch = false, offered = true, label: TrackedHand['label'] = 'Right') {
  g.update({ ...frame, timestamp: now, hands: [handAt(p, frame, pinch, label)] }, now, offered)
}
function pickup(g: ShinchanGesture, frame = bodyFrame(), label: TrackedHand['label'] = 'Right') {
  for (const now of [0, 80, 160]) update(g, frame, shinchanLayout(frame.width, frame.height).pickup, now, false, true, label)
  assert.equal(g.holding, true)
}
function paint(g: ShinchanGesture, frame: TrackingFrame, part: PaintPart, start = 400, label: TrackedHand['label'] = 'Right') {
  const anchors = paintAnchors(frame), target = anchors.targets.find(t => t.id === part)!
  const space = target.id === 'shirt' ? anchors.body! : anchors.face!
  const y = part === 'hair' ? target.y - target.ry * .74 : target.y
  const width = target.rx * (part === 'hair' ? .55 : 1)
  g.select(target.tool)
  let now = start
  update(g, frame, fromPaintSpace({ x: target.x - width * .7, y }, space), now, false, true, label)
  for (let pass = 0; pass < 4; pass++) for (const step of [-.7, -.4, -.1, .2, .5, .7, .5, .2, -.1, -.4]) {
    now += 50
    update(g, frame, fromPaintSpace({ x: target.x + width * step, y }, space), now, true, true, label)
  }
  return now
}

test('entrance, lifting, searching, presenting and drawing form the requested sequence', () => {
  assert.deepEqual([0, 1000, 2400, 4400].map(t => shinchanStage(t, false)), ['arriving', 'lifting', 'searching', 'offering'])
  assert.equal(shinchanStage(6000, true), 'drawing')
  for (const [w, h] of [[960, 540], [540, 960], [720, 720]]) {
    const layout = shinchanLayout(w!, h!)
    assert.ok(layout.pickup.x > 0 && layout.pickup.x < w! * .3)
    assert.ok(layout.pickup.y > h! * .6 && layout.pickup.y < h!)
    assert.ok(layout.radius > 0)
  }
})

test('a sustained hand reach takes the crayon only after it is offered; pickup works without a face', () => {
  const frame = { ...bodyFrame(), face: [] }, g = new ShinchanGesture(), p = shinchanLayout(frame.width, frame.height).pickup
  for (const now of [0, 100, 200]) update(g, frame, p, now, false, false)
  assert.equal(g.holding, false)
  for (const now of [300, 380]) update(g, frame, p, now)
  assert.equal(g.holding, false)
  update(g, frame, p, 460)
  assert.equal(g.holding, true)
  assert.equal(g.drawing, false)
})

test('pickup requires one continuous hand and does not combine two hands or gaps', () => {
  const frame = bodyFrame(), g = new ShinchanGesture(), p = shinchanLayout(frame.width, frame.height).pickup
  update(g, frame, p, 0, false, true, 'Left')
  update(g, frame, p, 100, false, true, 'Right')
  update(g, frame, p, 200, false, true, 'Left')
  assert.equal(g.holding, false)
  update(g, frame, p, 500, false, true, 'Left')
  assert.equal(g.holding, false)
  update(g, frame, p, 580, false, true, 'Left')
  update(g, frame, p, 660, false, true, 'Left')
  assert.equal(g.holding, true)
})

test('pinching and moving over the guides completes both eyebrows and eyes, while a stationary pinch does not', () => {
  const frame = bodyFrame(), g = new ShinchanGesture()
  pickup(g, frame)
  g.select('ink')
  const anchors = paintAnchors(frame), eye = anchors.targets.find(t => t.id === 'eye-left')!
  const p = fromPaintSpace(eye, anchors.face!)
  update(g, frame, p, 300)
  for (const now of [400, 450, 500, 550]) update(g, frame, p, now, true)
  assert.ok(paintParts.every(id => g.progress[id] === 0))
  let now = 700
  for (const part of ['brow-left', 'brow-right', 'eye-left', 'eye-right'] as const) {
    now = paint(g, frame, part, now) + 100
    assert.equal(g.progress[part], 1, part)
  }
})

test('release, tracking loss, jumps and a different hand cannot connect or extend a drawing', () => {
  const frame = bodyFrame(), g = new ShinchanGesture()
  pickup(g, frame)
  g.select('ink')
  const anchors = paintAnchors(frame), target = anchors.targets.find(t => t.id === 'eye-left')!
  const at = (x: number) => fromPaintSpace({ x: target.x + x, y: target.y }, anchors.face!)
  update(g, frame, at(-.05), 400)
  update(g, frame, at(-.05), 450, true)
  update(g, frame, at(0), 500, true)
  const before = g.progress['eye-left']
  assert.ok(before > 0)
  update(g, frame, at(.04), 550, false)
  assert.equal(g.progress['eye-left'], before)
  g.update({ ...frame, hands: [] }, 600, true)
  assert.equal(g.cursor, undefined); assert.equal(g.drawing, false)
  update(g, frame, at(.08), 650, true, true, 'Left')
  assert.equal(g.progress['eye-left'], before)
  update(g, frame, at(.08), 1000, true)
  assert.equal(g.progress['eye-left'], before, 'a gap starts a new stroke')
  assert.equal(g.fresh(1400), false)
})

test('either hand can pick up the crayon and draw with the same guides', () => {
  const frame = bodyFrame()
  for (const label of ['Left', 'Right'] as const) {
    const g = new ShinchanGesture()
    pickup(g, frame, label)
    paint(g, frame, 'eye-left', 400, label)
    assert.equal(g.progress['eye-left'], 1)
  }
})

test('the other hand can take over while the first hand stays visible without connecting their marks', () => {
  const frame = bodyFrame(), g = new ShinchanGesture()
  pickup(g, frame, 'Left')
  g.select('ink')
  const anchors = paintAnchors(frame), eye = anchors.targets.find(t => t.id === 'eye-left')!
  const at = (x: number) => fromPaintSpace({ x: eye.x + x, y: eye.y }, anchors.face!)
  const both = (time: number, left: TrackedHand, right: TrackedHand) => g.update({ ...frame, hands: [left, right] }, time, true)
  both(400, handAt(at(-.10), frame, true, 'Left'), handAt(at(.07), frame))
  both(450, handAt(at(-.04), frame, true, 'Left'), handAt(at(.07), frame))
  const before = g.progress['eye-left']
  assert.ok(before > 0)
  both(500, handAt(at(-.04), frame, false, 'Left'), handAt(at(.07), frame, true))
  assert.equal(g.progress['eye-left'], before)
  both(550, handAt(at(-.04), frame, false, 'Left'), handAt(at(.11), frame, true))
  assert.ok(g.progress['eye-left'] > before)
  assert.ok(Math.abs(g.cursor!.x - at(.11).x) < 1e-8)
})

test('peach fills the full face outline and hair and mouth can be painted separately', () => {
  const frame = { ...bodyFrame(), body: undefined }, g = new ShinchanGesture()
  pickup(g, frame)
  assert.equal(g.tool, 'peach')
  const anchors = paintAnchors(frame), face = anchors.targets.find(t => t.id === 'face')!
  assert.equal(face.tool, 'peach')
  assert.ok(face.rx > .65 && face.ry > .5, 'the guide includes cheeks, chin and ears')
  const at = (x: number) => fromPaintSpace({ x, y: face.y }, anchors.face!)
  update(g, frame, at(face.x + face.rx * 1.18), 250, true)
  update(g, frame, at(face.x + face.rx * 1.12), 300, true)
  assert.equal(g.progress.face, 0)
  const faceDone = paint(g, frame, 'face')
  assert.equal(g.progress.face, 1)
  assert.equal(g.progress['eye-left'], 0)
  const hairDone = paint(g, frame, 'hair', faceDone + 100)
  assert.equal(g.progress.hair, 1)
  paint(g, frame, 'mouth', hairDone + 100)
  assert.equal(g.progress.mouth, 1)
  assert.equal(g.progress.face, 1)
})

test('red paints only the fitted upper-body guide, including when the hips are out of view', () => {
  const frame = { ...bodyFrame(), face: [] }, g = new ShinchanGesture()
  pickup(g, frame)
  g.select('red')
  const now = paint(g, frame, 'shirt')
  assert.equal(g.progress.shirt, 1)
  assert.ok(['brow-left', 'eye-left', 'brow-right', 'eye-right'].every(id => g.progress[id as PaintPart] === 0))
  g.clearDrawing()
  const upper = { ...frame, body: frame.body!.map((p, i) => ({ ...p, visibility: i === 23 || i === 24 ? 0 : 1 })) }
  assert.deepEqual(paintAnchors(upper).targets.filter(t => t.tool === 'red').map(t => t.id), ['shirt'])
  paint(g, upper, 'shirt', now + 100)
  assert.equal(g.progress.shirt, 1)
})

test('the red crayon ignores a gap in the person matte inside the fitted shirt', () => {
  const width = 100, height = 100, alpha = new Uint8Array(width * height).fill(255)
  for (let y = 67; y < 72; y++) alpha.fill(0, y * width + 49, y * width + 56)
  const frame = { ...bodyFrame(), face: [], personMask: { width, height, alpha } }, g = new ShinchanGesture()
  pickup(g, frame)
  g.select('red')
  const at = (x: number) => ({ x: x * frame.width, y: .694 * frame.height })
  update(g, frame, at(.532), 400, true)
  update(g, frame, at(.550), 450, true)
  assert.equal(g.drawing, true)
  const painted = g.progress.shirt
  assert.ok(painted > 0)
  update(g, frame, at(.470), 500, true)
  assert.equal(g.drawing, false)
  assert.equal(g.progress.shirt, painted)
})

test('movement outside a visible guide adds no paint and reentry starts a new segment', () => {
  const frame = bodyFrame(), g = new ShinchanGesture()
  pickup(g, frame)
  g.select('ink')
  const anchors = paintAnchors(frame), eye = anchors.targets.find(t => t.id === 'eye-left')!
  const at = (x: number, y: number) => fromPaintSpace({ x: eye.x + x * eye.rx, y: eye.y + y * eye.ry }, anchors.face!)
  // These samples are inside the old padded hit area but outside the visible eye outline.
  update(g, frame, at(-.45, 1.05), 400, true)
  update(g, frame, at(.45, 1.05), 450, true)
  assert.equal(g.drawing, false)
  assert.equal(g.progress['eye-left'], 0)
  update(g, frame, at(0, 0), 500, true)
  assert.equal(g.progress['eye-left'], 0)
  update(g, frame, at(.35, 0), 550, true)
  const before = g.progress['eye-left']
  assert.ok(before > 0)
  update(g, frame, at(.35, 1.05), 600, true)
  update(g, frame, at(-.35, 0), 650, true)
  assert.equal(g.progress['eye-left'], before)

  g.select('red')
  const shirt = anchors.targets.find(t => t.id === 'shirt')!
  const shirtPoint = (x: number) => fromPaintSpace({ x, y: shirt.y + shirt.ry + .07 }, anchors.body!)
  update(g, frame, shirtPoint(-.35), 700, true)
  update(g, frame, shirtPoint(.35), 750, true)
  assert.equal(g.drawing, false)
  assert.equal(g.progress.shirt, 0)
})

test('face and body paint coordinates follow their own landmarks under translation and roll', () => {
  const frame = bodyFrame(), anchors = paintAnchors(frame)
  const local = { x: -.22, y: -.13 }
  for (const space of [anchors.face!, anchors.body!]) {
    const back = inPaintSpace(fromPaintSpace(local, space), space)
    assert.ok(Math.abs(back.x - local.x) < 1e-9 && Math.abs(back.y - local.y) < 1e-9)
  }
  const moved = paintAnchors({ ...frame, face: frame.face.map(p => ({ ...p, x: p.x + .08, y: p.y + .03 })) })
  const a = fromPaintSpace(local, anchors.face!), b = fromPaintSpace(local, moved.face!)
  assert.ok(Math.abs(b.x - a.x + frame.width * .08) < 1e-8)
  assert.ok(Math.abs(b.y - a.y - frame.height * .03) < 1e-8)
  assert.deepEqual(moved.body, anchors.body)
  const angle = .2, rotated = paintAnchors({ ...frame, face: frame.face.map(p => ({ ...p,
    x: .5 + (p.x - .5) * Math.cos(angle) - (p.y - .5) * Math.sin(angle),
    y: .5 + (p.x - .5) * Math.sin(angle) + (p.y - .5) * Math.cos(angle) })) })
  assert.ok(rotated.face && Math.abs(rotated.face.across.y) > 1)
  assert.equal(paintAnchors({ ...frame, face: [] }).face, undefined)
  assert.equal(paintAnchors({ ...frame, body: undefined }).body, undefined)
})

test('suspending tracking preserves paint and crayon; erasing preserves the crayon, and reset clears the experience', () => {
  const g = new ShinchanGesture(), frame = bodyFrame()
  pickup(g, frame); paint(g, frame, 'eye-left')
  g.clearTracking()
  assert.equal(g.holding, true); assert.equal(g.progress['eye-left'], 1); assert.equal(g.drawing, false)
  g.clearDrawing()
  assert.equal(g.holding, true); assert.ok(paintParts.every(id => g.progress[id] === 0))
  g.select('red'); g.reset()
  assert.equal(g.holding, false); assert.equal(g.tool, 'peach'); assert.ok(paintParts.every(id => g.progress[id] === 0))
})
