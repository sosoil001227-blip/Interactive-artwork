import test from 'node:test'
import assert from 'node:assert/strict'
import { HandDetector } from '../shared/hand-detector.ts'

function environment(options = { initialize: true }) {
  const descriptors = ['location', 'Worker', 'OffscreenCanvas', 'createImageBitmap'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  const workers: FakeWorker[] = []
  let captures = 0, closes = 0
  let capture: Promise<unknown> | undefined
  class FakeWorker {
    onmessage?: (event: { data: unknown }) => void
    onerror?: (event: unknown) => void
    onmessageerror?: () => void
    frames: { id: number; type: string }[] = []
    terminated = false
    constructor() { workers.push(this) }
    postMessage(message: { id: number; type: string }) {
      if (message.type === 'init' && options.initialize) queueMicrotask(() => this.onmessage?.({ data: { id: message.id, type: 'ready' } }))
      else this.frames.push(message)
    }
    result() {
      const frame = this.frames.find(frame => frame.type === 'detect')!
      this.frames = this.frames.filter(item => item !== frame)
      this.onmessage?.({ data: { id: frame.id, type: 'result', result: { landmarks: [], worldLandmarks: [], handedness: [] } } })
    }
    terminate() { this.terminated = true }
  }
  Object.defineProperties(globalThis, {
    location: { value: { href: 'https://artwork.test/example-8/' }, configurable: true },
    Worker: { value: FakeWorker, configurable: true },
    OffscreenCanvas: { value: class {}, configurable: true },
    createImageBitmap: { value: () => { captures++; return capture ?? Promise.resolve({ close() { closes++ } }) }, configurable: true },
  })
  return {
    workers, get captures() { return captures }, get closes() { return closes },
    deferCapture() {
      let resolve!: (image: unknown) => void
      capture = new Promise(done => { resolve = done })
      return () => resolve({ close() { closes++ } })
    },
    restore() {
      for (const [key, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor)
        else Reflect.deleteProperty(globalThis, key)
      }
    },
  }
}

test('worker inference allows one frame in flight and releases transferred images', async () => {
  const env = environment()
  let detector: HandDetector | undefined
  try {
    detector = await HandDetector.create()
    const frame = detector.detect({} as HTMLVideoElement, 1000)
    assert.equal(await detector.detect({} as HTMLVideoElement, 1016), undefined)
    await Promise.resolve()
    assert.equal(env.captures, 1)
    assert.equal(env.workers[0]!.frames.length, 1)
    env.workers[0]!.result()
    assert.deepEqual((await frame)?.landmarks, [])
    assert.equal(env.closes, 1)
    detector.close()
    assert.equal(env.workers[0]!.terminated, true)
    assert.equal(await detector.detect({} as HTMLVideoElement, 1033), undefined)
  } finally { detector?.close(); env.restore() }
})

test('closing during asynchronous capture releases the image without sending it', async () => {
  const env = environment()
  let detector: HandDetector | undefined
  try {
    detector = await HandDetector.create()
    const finishCapture = env.deferCapture()
    const frame = detector.detect({} as HTMLVideoElement, 1000)
    detector.close(); finishCapture()
    assert.equal(await frame, undefined)
    assert.equal(env.closes, 1)
    assert.equal(env.workers[0]!.frames.length, 0)
  } finally { detector?.close(); env.restore() }
})

test('camera cancellation terminates a worker that is still loading the model', async () => {
  const env = environment({ initialize: false })
  try {
    const controller = new AbortController()
    const loading = HandDetector.create(controller.signal)
    const rejected = assert.rejects(loading, /cancelled/)
    controller.abort()
    await rejected
    assert.equal(env.workers[0]!.terminated, true)
  } finally { env.restore() }
})

test('closing with an inference pending settles it without leaving a timeout alive', async () => {
  const env = environment()
  let detector: HandDetector | undefined
  try {
    detector = await HandDetector.create()
    const frame = detector.detect({} as HTMLVideoElement, 1000)
    await Promise.resolve()
    detector.close()
    assert.equal(await frame, undefined)
    assert.equal(env.closes, 1)
    assert.equal(env.workers[0]!.terminated, true)
  } finally { detector?.close(); env.restore() }
})

// Replace the model factory, not the scheduler: these checks exercise the same
// fallback transitions without a camera, WebGL context, network or server.
function fallbackModel() {
  let loads = 0, detections = 0, closes = 0
  const prototype = HandDetector.prototype as unknown as { loadFallback: () => Promise<void> }
  const original = prototype.loadFallback
  prototype.loadFallback = async function () {
    loads++
    ;(this as unknown as { detector: unknown }).detector = {
      detectForVideo() { detections++; return { landmarks: [], worldLandmarks: [], handedness: [] } },
      close() { closes++ },
    }
  }
  return {
    get loads() { return loads }, get detections() { return detections }, get closes() { return closes },
    restore() { prototype.loadFallback = original },
  }
}

test('worker initialization failure releases the worker and uses main-thread inference', async () => {
  const env = environment({ initialize: false }), fallback = fallbackModel()
  let detector: HandDetector | undefined
  try {
    const loading = HandDetector.create()
    env.workers[0]!.onerror?.({ preventDefault() {} })
    detector = await loading
    assert.equal(env.workers[0]!.terminated, true)
    assert.equal(fallback.loads, 1)
    assert.deepEqual((await detector.detect({} as HTMLVideoElement, 1000))?.landmarks, [])
    assert.equal(fallback.detections, 1)
    assert.equal(env.captures, 0)
    detector.close(); assert.equal(fallback.closes, 1)
  } finally { detector?.close(); fallback.restore(); env.restore() }
})

test('a failed image transfer switches to fallback once and discards the old frame', async () => {
  const env = environment(), fallback = fallbackModel()
  let detector: HandDetector | undefined
  try {
    detector = await HandDetector.create()
    const frame = detector.detect({} as HTMLVideoElement, 1000)
    await Promise.resolve()
    env.workers[0]!.onmessageerror?.()
    assert.equal(await frame, undefined)
    assert.equal(fallback.loads, 1)
    assert.equal(env.workers[0]!.terminated, true)
    assert.deepEqual((await detector.detect({} as HTMLVideoElement, 1033))?.landmarks, [])
    assert.equal(fallback.detections, 1)
  } finally { detector?.close(); fallback.restore(); env.restore() }
})
