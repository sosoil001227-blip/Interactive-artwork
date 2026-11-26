import test from 'node:test'
import assert from 'node:assert/strict'
import { advanceTreat } from '../src/physics.ts'
import type { Treat } from '../src/physics.ts'

function treat(): Treat {
  return { x: 500, y: 200, vx: 80, vy: -100, size: 30, rotation: 0, spin: .5,
    life: 8, maxLife: 8, squash: 0, bounces: 0, orbit: false, angle: 0, sprite: 0 }
}

test('emitted candies rise, fall under gravity, then bounce with reduced energy and visible squash', () => {
  const body = treat()
  advanceTreat(body, .05, 1000, 700)
  assert.ok(body.y < 200 && body.vy > -100)
  let bounced = false
  for (let i = 0; i < 200; i++) {
    const velocity = body.vy
    advanceTreat(body, 1 / 60, 1000, 700)
    if (body.bounces) {
      assert.ok(body.vy < 0 && Math.abs(body.vy) < velocity)
      assert.ok(body.squash > 0); bounced = true; break
    }
  }
  assert.ok(bounced)
})

test('fixed physics substeps keep 30 and 60 fps trajectories equivalent', () => {
  const a = treat(), b = treat()
  for (let i = 0; i < 90; i++) advanceTreat(a, 1 / 30, 1000, 700)
  for (let i = 0; i < 180; i++) advanceTreat(b, 1 / 60, 1000, 700)
  assert.ok(Math.abs(a.x - b.x) < .001 && Math.abs(a.y - b.y) < .001)
  assert.equal(a.bounces, b.bounces)
})

test('orbiting jelly floats near the portal and falls when the portal disappears', () => {
  const body = treat(); body.orbit = true
  const hole = { x: 500, y: 300, radiusX: 130, radiusY: 80 }
  for (let i = 0; i < 180; i++) advanceTreat(body, 1 / 60, 1000, 700, hole)
  assert.ok(Math.hypot(body.x - hole.x, body.y - hole.y) < 240)
  const previousVelocity = body.vy
  advanceTreat(body, .05, 1000, 700)
  assert.ok(body.vy > previousVelocity)
})

test('long frame gaps are bounded and wall collisions stay finite', () => {
  const body = treat(); body.x = 1; body.vx = -800
  advanceTreat(body, 30, 1000, 700)
  assert.ok(body.x >= body.size * .42 && body.vx > 0)
  assert.ok(body.life > 7.9)
  assert.ok([body.x, body.y, body.vx, body.vy].every(Number.isFinite))
})
