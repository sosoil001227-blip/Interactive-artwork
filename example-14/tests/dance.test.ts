import test from 'node:test'
import assert from 'node:assert/strict'
import { assignPoses, beatMs, DanceTracker, defaultFloor, directions, offsets, tileAt } from '../src/dance.ts'
import type { Landmark, Point } from '../src/dance.ts'
import { duration, leadIn, noteCount, Round } from '../src/round.ts'

function pose(left: Point = { x: .46, y: .78 }, right: Point = { x: .54, y: .78 }, arm = .34): Landmark[] {
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .4, z: 0, visibility: 1, presence: 1 }))
  const point = (index: number, x: number, y: number) => { points[index] = { ...points[index]!, x: 1 - x, y } }
  point(0, .5, .11)
  point(11, .43, .25); point(12, .57, .25)
  point(15, arm, .40); point(16, 1 - arm, .4)
  point(23, .45, .51); point(24, .55, .51)
  point(25, left.x, .635); point(26, right.x, .635)
  for (const i of [27, 29, 31]) point(i, left.x, left.y)
  for (const i of [28, 30, 32]) point(i, right.x, right.y)
  return points
}

function calibrate(tracker: DanceTracker, aspect = 16 / 9) {
  for (let at = 0; at < 630; at += 70) assert.equal(tracker.update(pose(), at, aspect).phase, 'centering')
  const result = tracker.update(pose(), 630, aspect)
  assert.equal(result.phase, 'ready')
  assert.ok(result.floor)
  assert.ok(Math.abs(result.floor.x - .5) < .001)
  assert.ok(Math.abs(result.floor.y - .78) < .001)
  return result.floor
}

test('center and corners are neutral and all four visible tile centers match', () => {
  const { x, y, dx, dy } = defaultFloor
  assert.equal(tileAt({ x, y }, defaultFloor), undefined)
  assert.equal(tileAt({ x: x + dx, y: y - dy }, defaultFloor), undefined)
  for (const direction of directions) {
    const [u, v] = offsets[direction]
    assert.equal(tileAt({ x: x + dx * u, y: y + dy * v }, defaultFloor), direction)
  }
})

test('calibration keeps the projected pad in frame and asks to see both feet', () => {
  const tracker = new DanceTracker()
  const cropped = pose()
  cropped[27]!.visibility = 0
  assert.equal(tracker.update(cropped, 0, 16 / 9).phase, 'searching')
  const edge = pose({ x: .46, y: .94 }, { x: .54, y: .94 })
  assert.equal(tracker.update(edge, 70, 16 / 9).phase, 'framing')
  tracker.reset()
  const floor = calibrate(tracker, .60)
  assert.ok(floor.dy > 0 && floor.y + 1.55 * floor.dy <= 1)
  assert.ok(floor.x + 1.55 * floor.dx <= 1)
})

test('a foot landing on a tile fires once and a return to center permits another step', () => {
  const tracker = new DanceTracker(), floor = calibrate(tracker)
  const left = { x: floor.x - floor.dx, y: floor.y }
  const first = [700, 770, 840, 910, 980].flatMap(at => tracker.update(pose(left), at, 16 / 9).steps)
  assert.deepEqual(first.map(step => step.direction), ['left'])
  for (const at of [1050, 1120, 1190]) assert.equal(tracker.update(pose(), at, 16 / 9).steps.length, 0)
  const down = { x: floor.x, y: floor.y + floor.dy }
  const second = [1260, 1330, 1400, 1470].flatMap(at => tracker.update(pose(left, down), at, 16 / 9).steps)
  assert.deepEqual(second.map(step => step.direction).sort(), ['down', 'left'])
})

test('a recovered foot already on a tile waits for a return to center, while arm motion independently adds light', () => {
  const tracker = new DanceTracker(), floor = calibrate(tracker)
  const motion = tracker.update(pose(undefined, undefined, .12), 700, 16 / 9)
  assert.ok(motion.motion > .1)
  assert.deepEqual(motion.steps, [])
  tracker.update([], 770, 16 / 9)
  const right = { x: floor.x + floor.dx, y: floor.y }
  for (const at of [840, 910, 980]) assert.deepEqual(tracker.update(pose(undefined, right), at, 16 / 9).steps, [])
  for (const at of [1050, 1120, 1190]) tracker.update(pose(), at, 16 / 9)
  const hit = [1260, 1330, 1400].flatMap(at => tracker.update(pose(undefined, right), at, 16 / 9).steps)
  assert.equal(hit[0]?.direction, 'right')
})

test('after calibration the visible foot keeps its direction when the other foot is hidden', () => {
  const tracker = new DanceTracker(), floor = calibrate(tracker)
  const behind = { x: floor.x, y: floor.y - floor.dy }
  const missingRight = (left: Point) => {
    const sample = pose(left)
    sample[28]!.visibility = 0
    return sample
  }
  const frames = [700, 770, 840, 910].map(at => tracker.update(missingRight(behind), at, 16 / 9))
  assert.ok(frames.every(frame => frame.phase === 'partial' && frame.feet.length === 1 && frame.feet[0]?.side === 'left'))
  assert.deepEqual(frames.flatMap(frame => frame.steps.map(step => step.direction)), ['up'])
  assert.equal(frames.at(-1)?.feet[0]?.tile, 'up')
  const side = { x: floor.x + floor.dx, y: floor.y }
  const recovered = [980, 1050, 1120].flatMap(at => tracker.update(pose(behind, side), at, 16 / 9).steps)
  assert.deepEqual(recovered, [])
})

test('two-player pose assignment follows the mirrored halves even if detector order or attendance changes', () => {
  const field = (side: number) => pose().map(point => ({ ...point, x: (point.x + side) / 2 }))
  const left = field(1), right = field(0)
  const assigned = assignPoses([right, left], 2)
  assert.deepEqual(assigned, assignPoses([left, right], 2))
  assert.ok(Math.abs(assigned[0]![27]!.x - pose()[27]!.x) < 1e-8)
  assert.equal(assignPoses([right], 2)[0]!.length, 0)
  assert.equal(assignPoses([right], 2)[1]!.length, 33)
  assert.deepEqual(assignPoses([pose()], 2), [[], []])
})

test('direction, timing, missed notes and duplicates determine a player’s score and combo', () => {
  const round = new Round(0)
  const other = new Round(1)
  const first = round.chart[0]!, second = round.chart[1]!
  round.hit({ ...first, at: first.at + 50 }, first.at + 155)
  round.hit({ ...first, at: first.at + 80 }, first.at + 180)
  assert.equal(round.judgement?.judgement, 'PERFECT')
  assert.equal(round.combo, 1)
  round.hit({ ...second, at: second.at + 152 }, second.at + 250)
  assert.equal(round.judgement?.judgement, 'GREAT')
  assert.equal(round.combo, 2)
  const third = round.chart[2]!
  round.hit({ at: third.at, direction: directions.find(direction => direction !== third.direction)! }, third.at + 100)
  assert.equal(round.judgement?.judgement, 'BAD')
  assert.equal(round.combo, 0)
  assert.equal(round.best, 2)
  assert.equal(round.score, 1600)
  assert.equal(other.score, 0)
  assert.notEqual(other.chart[0]!.direction, first.direction)
  round.advance(duration)
  assert.equal(round.counts.BAD, noteCount - 2)
  assert.equal(leadIn + beatMs * 47, round.chart.at(-1)?.at)
})

test('an early hit on the next beat clears an earlier miss before starting a new combo', () => {
  const round = new Round(0)
  const [first, , third] = round.chart
  round.hit(first!, first!.at + 100)
  round.hit({ ...third!, at: third!.at - 160 }, third!.at - 97)
  round.advance(third!.at)
  assert.deepEqual(round.counts, { PERFECT: 1, GREAT: 1, BAD: 1 })
  assert.equal(round.combo, 1)
})
