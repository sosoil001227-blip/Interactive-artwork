import test from 'node:test'
import assert from 'node:assert/strict'
import { JellyUniverse } from '../src/universe.ts'
import type { JellyState } from '../src/gesture.ts'

function environment() {
  const keys = ['document', 'innerWidth', 'innerHeight', 'matchMedia']
  const descriptors = keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  function canvas() {
    const canvas = { width: 0, height: 0, getContext: (_type: string): unknown => context }
    const context = new Proxy({ canvas } as Record<string, unknown>, {
      get(target, key: string) {
        if (key in target) return target[key]
        return (...args: unknown[]) => {
          for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), `${key} received ${value}`)
        }
      },
      set(target, key: string, value) { target[key] = value; return true },
    })
    return canvas as unknown as HTMLCanvasElement
  }
  Object.defineProperties(globalThis, {
    document: { value: { createElement: canvas }, configurable: true },
    innerWidth: { value: 1000, configurable: true },
    innerHeight: { value: 700, configurable: true },
    matchMedia: { value: () => ({ matches: false }), configurable: true },
  })
  return { canvas, restore() {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  } }
}

function state(overrides: Partial<JellyState> = {}): JellyState {
  return { x: 500, y: 340, radiusX: 160, radiusY: 65, active: true,
    progress: 0, opened: false, closed: false, burst: false, reason: 'hold', hands: [], ...overrides }
}

type Inspection = { scale: number; pending: number; treats: unknown[]; dust: unknown[] }

test('the scene stays dormant until alignment and performs exactly one delayed pop when released', () => {
  const env = environment()
  try {
    let pops = 0
    const scene = new JellyUniverse(env.canvas(), () => pops++)
    const inspect = scene as unknown as Inspection
    scene.live = true
    for (let i = 0; i < 10; i++) scene.draw(1000 + i * 17)
    assert.equal(inspect.scale, 0); assert.equal(pops, 0)
    scene.setState(state({ opened: true }), 1200)
    for (let i = 0; i < 50; i++) scene.draw(1200 + i * 17)
    assert.ok(inspect.scale > .95)
    scene.setState(state({ active: false, closed: true }), 2100)
    assert.equal(pops, 0, 'the hole must shrink before it pops')
    for (let i = 0; i < 90; i++) scene.draw(2100 + i * 17)
    assert.equal(pops, 1); assert.equal(inspect.scale, 0)
  } finally { env.restore() }
})

test('repeated candy showers keep objects bounded and all canvas coordinates finite', () => {
  const env = environment()
  try {
    const scene = new JellyUniverse(env.canvas(), () => {})
    const inspect = scene as unknown as Inspection
    scene.live = true
    for (let i = 0; i < 480; i++) {
      const now = 1000 + i * 1000 / 60
      if (i % 40 === 0) scene.setState(state({ burst: true }), now)
      scene.draw(now)
      assert.ok(inspect.treats.length <= 100 && inspect.dust.length <= 200)
    }
    assert.ok(inspect.treats.length > 0)
    scene.reset()
    assert.equal(inspect.pending, 0); assert.equal(inspect.treats.length, 0); assert.equal(inspect.dust.length, 0)
  } finally { env.restore() }
})

test('nearby space objects spiral inward and are swallowed instead of remaining in a stable orbit', () => {
  const env = environment()
  try {
    const scene = new JellyUniverse(env.canvas(), () => {})
    scene.live = true
    const inspect = scene as unknown as { objects: { x: number; y: number; vx: number; vy: number }[] }
    const object = inspect.objects[0]!
    Object.assign(object, { x: 740, y: 340, vx: 0, vy: 0 })
    scene.setState(state({ opened: true }), 1000)
    let turned = false, swallowed = false
    for (let i = 0; i < 240; i++) {
      scene.draw(1000 + i * 1000 / 60)
      if (Math.abs(object.y - 340) > 10) turned = true
      if (turned && Math.hypot(object.x - 500, object.y - 340) > 450) { swallowed = true; break }
    }
    assert.ok(turned, 'the path must spiral, rather than fall straight in')
    assert.ok(swallowed, 'captured objects must respawn outside the hole')
  } finally { env.restore() }
})
