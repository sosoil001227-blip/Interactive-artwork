import test from 'node:test'
import assert from 'node:assert/strict'
import { trackingProfile } from '../src/trackingProfile.ts'

test('Iron Man and Mario prepare hands before attachment and use hand tracking after attachment', () => {
  for (const kind of ['iron-man', 'mario'] as const) {
    assert.deepEqual(trackingProfile(kind, 'off'), { hands: 'prepare', body: false, expressions: false })
    assert.deepEqual(trackingProfile(kind, 'locked'), { hands: 'track', body: false, expressions: false })
  }
})

test('No-Face and Boh use facial tracking, with expressions enabled for Boh', () => {
  assert.deepEqual(trackingProfile('no-face', 'locked'), { hands: 'off', body: false, expressions: false })
  assert.deepEqual(trackingProfile('bo', 'locked'), { hands: 'off', body: false, expressions: true })
})

test('all three outfit options request pose segmentation and hands independently of mask attachment', () => {
  for (const kind of ['conan', 'shinchan', 'coraline'] as const) {
    for (const state of ['off', 'locked'] as const) {
      assert.deepEqual(trackingProfile(kind, state), { hands: 'track', body: true, expressions: false })
    }
  }
})
