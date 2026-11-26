import test from 'node:test'
import assert from 'node:assert/strict'
import { FrameLoop } from '../shared/frame-loop.ts'

function environment() {
  const descriptors = ['document', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  const document = Object.assign(new EventTarget(), { hidden: false })
  let serial = 0
  const callbacks = new Map<number, FrameRequestCallback>()
  Object.defineProperties(globalThis, {
    document: { value: document, configurable: true },
    requestAnimationFrame: { value: (callback: FrameRequestCallback) => { callbacks.set(++serial, callback); return serial }, configurable: true },
    cancelAnimationFrame: { value: (id: number) => callbacks.delete(id), configurable: true },
  })
  return {
    document, callbacks,
    tick(now: number) {
      const pending = [...callbacks.values()]; callbacks.clear()
      for (const callback of pending) callback(now)
    },
    restore() {
      for (const [key, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else Reflect.deleteProperty(globalThis, key)
      }
    },
  }
}

test('60/90/120/144/240 Hz screens retain 60 Hz animation without duplicate loops', () => {
  const env = environment()
  try {
    for (const hz of [60, 90, 120, 144, 240]) {
      let frames = 0
      const loop = new FrameLoop(() => frames++)
      loop.start(); loop.start()
      for (let i = 0; i < hz; i++) env.tick(i * 1000 / hz)
      assert.ok(frames >= 59 && frames <= 61, `${hz} Hz must render ~60 frames, got ${frames}`)
      assert.equal(env.callbacks.size, 1)
      loop.close()
      assert.equal(env.callbacks.size, 0)
    }
  } finally { env.restore() }
})

test('backgrounding cancels scheduled work; foregrounding resumes without catch-up or leaks', () => {
  const env = environment()
  try {
    const frames: number[] = []
    const loop = new FrameLoop(now => frames.push(now))
    env.tick(0)
    env.document.hidden = true; env.document.dispatchEvent(new Event('visibilitychange'))
    assert.equal(env.callbacks.size, 0)
    env.tick(10000); assert.deepEqual(frames, [0])
    env.document.hidden = false; env.document.dispatchEvent(new Event('visibilitychange'))
    env.tick(10000); env.tick(10004); env.tick(10008)
    assert.deepEqual(frames, [0, 10000])
    env.tick(10017); assert.equal(frames.length, 3)
    loop.close()
    env.document.dispatchEvent(new Event('visibilitychange')); loop.start()
    assert.equal(env.callbacks.size, 0)
  } finally { env.restore() }
})

test('a long foreground stall renders once and schedules the next normal frame', () => {
  const env = environment()
  try {
    const frames: number[] = []
    const loop = new FrameLoop(now => frames.push(now))
    env.tick(0); env.tick(1000); env.tick(1004); env.tick(1008)
    assert.deepEqual(frames, [0, 1000])
    loop.close()
  } finally { env.restore() }
})

test('idle and ended scenes schedule no work, including after tab visibility changes', () => {
  const env = environment()
  try {
    const frames: number[] = [], loop = new FrameLoop(now => frames.push(now), false)
    assert.equal(env.callbacks.size, 0)
    env.document.dispatchEvent(new Event('visibilitychange'))
    assert.equal(env.callbacks.size, 0)
    loop.start(); env.tick(1000); loop.pause()
    assert.deepEqual(frames, [1000]); assert.equal(env.callbacks.size, 0)
    env.document.hidden = true; env.document.dispatchEvent(new Event('visibilitychange'))
    env.document.hidden = false; env.document.dispatchEvent(new Event('visibilitychange'))
    assert.equal(env.callbacks.size, 0)
    loop.start(); env.tick(90000)
    assert.deepEqual(frames, [1000, 90000])
    loop.close(); loop.start(); assert.equal(env.callbacks.size, 0)
  } finally { env.restore() }
})

test('pausing or restarting from a frame callback never leaves a duplicate callback', () => {
  const env = environment()
  try {
    let frames = 0
    const loop = new FrameLoop(() => { frames++; loop.pause(); if (frames === 1) loop.start() })
    env.tick(1000); assert.equal(env.callbacks.size, 1)
    env.tick(1017); assert.equal(env.callbacks.size, 0)
    assert.equal(frames, 2); loop.close()
  } finally { env.restore() }
})
