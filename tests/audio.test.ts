import test from 'node:test'
import assert from 'node:assert/strict'
import { MagicHum } from '../example-9/src/hum.ts'

test('unchanged audio energy does not accumulate automation and suspension clears active ramps', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext')
  let targets = 0, held = 0, suspended = 0
  function parameter() {
    return { value: 0, setTargetAtTime() { targets++ }, cancelAndHoldAtTime() { held++ },
      cancelScheduledValues() {}, setValueAtTime() {} }
  }
  function node() { return { connect() {}, disconnect() {} } }
  class Context {
    state = 'suspended'
    currentTime = 1
    destination = node()
    createGain() { return { ...node(), gain: parameter() } }
    createBiquadFilter() { return { ...node(), frequency: parameter(), Q: parameter(), type: '' } }
    createOscillator() { return { ...node(), frequency: parameter(), type: '', start() {} } }
    async resume() { this.state = 'running' }
    async suspend() { this.state = 'suspended'; suspended++ }
    async close() { this.state = 'closed' }
  }
  Object.defineProperty(globalThis, 'AudioContext', { value: Context, configurable: true })
  const hum = new MagicHum()
  try {
    await hum.start()
    hum.update(.8)
    assert.equal(targets, 5); assert.equal(held, 5)
    for (let i = 0; i < 10000; i++) hum.update(.8)
    assert.equal(targets, 5)
    hum.update(0)
    assert.equal(targets, 10); assert.equal(held, 10)
    hum.suspend()
    assert.equal(suspended, 1)
    await hum.start(); hum.update(0)
    assert.equal(targets, 15, 'resuming must restore automation after suspension')
  } finally {
    hum.close()
    if (descriptor) Object.defineProperty(globalThis, 'AudioContext', descriptor)
    else Reflect.deleteProperty(globalThis, 'AudioContext')
  }
})
