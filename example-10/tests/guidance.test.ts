import test from 'node:test'
import assert from 'node:assert/strict'
import { JellyGesture, readCorners } from '../src/gesture.ts'
import { describeGesture } from '../src/guidance.ts'
import { handFrame } from './fixtures.ts'

const read = () => readCorners(handFrame(), 1000, 700, 1000, 700)

test('feedback distinguishes missing hands from specific pose corrections', () => {
  const gesture = new JellyGesture()
  const missing = describeGesture(gesture.update([], 0))
  assert.match(missing.status, /0\/2/)
  const one = describeGesture(gesture.update(read().slice(0, 1), 33))
  assert.match(one.guide, /다른 손/)
  const hands = read()
  hands[1]!.valid = false; hands[1]!.issue = 'fold'
  const feedback = describeGesture(gesture.update(hands, 66))
  assert.match(feedback.guide, /오른손.*중지·약지·새끼/)
  assert.match(feedback.status, /왼쪽 ㄴ ✓.*오른쪽 ㄱ —/)
})

test('a wrong-facing second bracket gets a direction hint instead of an unchanged generic instruction', () => {
  const hands = read()
  hands[1]!.role = 'lower-left'
  const feedback = describeGesture(new JellyGesture().update(hands, 0))
  assert.match(feedback.guide, /오른손.*아래쪽과 왼쪽/)
})

test('aligned hands advance the UI from recognition to holding to the active portal', () => {
  const gesture = new JellyGesture()
  const aligning = describeGesture(gesture.update(read(), 0))
  assert.match(aligning.guide, /잠깐 유지/)
  assert.match(aligning.status, /왼쪽 ㄴ ✓.*오른쪽 ㄱ ✓/)
  const active = describeGesture(gesture.update(read(), 200))
  assert.match(active.status, /연결됨/)
  assert.match(active.guide, /손을 벌려/)
})
