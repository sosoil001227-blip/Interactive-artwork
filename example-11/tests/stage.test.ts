import test from 'node:test'
import assert from 'node:assert/strict'
import { PuppetStage, microphoneLayout } from '../src/stage.ts'
import { MarionetteRig } from '../src/rig.ts'
import { Conductor } from '../src/music.ts'
import { LiveScore, heartNote } from '../src/score.ts'
import { MELODY } from '../src/song.ts'
import { pose } from './fixtures.ts'
import { controllerLayout } from '../src/props.ts'

function environment(width: number, height: number) {
  const descriptors = ['document', 'innerWidth', 'innerHeight', 'devicePixelRatio', 'matchMedia'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  let drawings = 0
  function canvas(w = width, h = height) {
    const canvas = { width: 0, height: 0, getBoundingClientRect: () => ({ width: w, height: h }), getContext: (_type: string): unknown => ctx }
    const ctx = new Proxy({ canvas } as Record<string, unknown>, {
      get(target, key: string) {
        if (key in target) return target[key]
        return (...args: unknown[]) => {
          drawings++
          for (const arg of args) if (typeof arg === 'number') assert.ok(Number.isFinite(arg), `${key} received nonfinite coordinates`)
          if (key.includes('Gradient')) return { addColorStop(stop: number) { assert.ok(stop >= 0 && stop <= 1) } }
        }
      }, set(target, key: string, value) { target[key] = value; return true },
    })
    return canvas as unknown as HTMLCanvasElement
  }
  Object.defineProperties(globalThis, {
    document: { value: { createElement: () => canvas() }, configurable: true },
    innerWidth: { value: width, configurable: true }, innerHeight: { value: height, configurable: true },
    devicePixelRatio: { value: 2, configurable: true }, matchMedia: { value: () => ({ matches: false }), configurable: true },
  })
  return { canvas, get drawings() { return drawings }, restore() {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  } }
}

test('opening, rigid puppet, five strings, microphone, conductor and clapping hands render finite coordinates on desktop and mobile', () => {
  for (const [width, height] of [[1440, 900], [390, 844], [844, 390]]) {
    const env = environment(width!, height!)
    try {
      const stage = new PuppetStage(env.canvas()), rig = new MarionetteRig(), conductor = new Conductor()
      const atlas = { image: env.canvas(), cells: Array.from({ length: 12 }, () => ({ x: 0, y: 0, w: 100, h: 180 })) }
      stage.sprites = { ivory: atlas, hands: atlas }
      const hands = { left: pose(width! * .27, height! * .26), right: pose(width! * .73, height! * .3, 'Right') }
      for (let i = 0; i < 300; i++) {
        const now = 1000 + i * 1000 / 60
        const puppet = rig.update(hands.left, 1 / 60, width!, height!)
        const music = conductor.update(i > 180 ? hands.right : undefined, now, height!)
        stage.draw(now, now - 1000, puppet, music, hands, true)
      }
      assert.ok(env.drawings > 1000)
      stage.clear()
    } finally { env.restore() }
  }
})

test('the real melody score draws compact and expanded systems with finite coordinates', () => {
  const env = environment(1440, 900)
  try {
    for (const [width, height] of [[220, 108], [470, 194]]) {
      const score = new LiveScore(env.canvas(width, height)), conductor = new Conductor()
      score.expanded = width === 470
      const hand = pose(700, 350, 'Right')
      for (let i = 0; i < 250; i++) {
        const now = 1000 + i * 100
        hand.center.y = 100 + i % 8 * 70
        const base = conductor.update(hand, now, 700)
        const index = i % 42, note = MELODY[index]!
        score.draw({ ...base, active: true, noteIndex: index, midi: note.midi, noteProgress: .4 }, now)
      }
      assert.ok(env.drawings > 100)
    }
  } finally { env.restore() }
})

test('a paused score retains its pixels without repainting, and updates for progress and expansion', () => {
  const env = environment(1440, 900)
  try {
    const score = new LiveScore(env.canvas(220, 108))
    const state = new Conductor().update(undefined, 1000, 700)
    score.draw(state, 1000)
    const count = env.drawings
    for (let i = 1; i <= 180; i++) score.draw({ ...state }, 1000 + i * 34)
    assert.equal(env.drawings, count)
    score.draw({ ...state, active: true, noteProgress: .1 }, 8000)
    assert.ok(env.drawings > count)
    const active = env.drawings
    score.expanded = true; score.draw(state, 8100)
    assert.ok(env.drawings > active)
  } finally { env.restore() }
})

test('the microphone geometry remains at a short fixed boom while the puppet crosses the stage',()=>{
  const rig=new MarionetteRig(),hand=pose(),before=microphoneLayout(1440,900)
  rig.update(hand,1/60,1440,900);hand.center.x+=300;hand.points.forEach(p=>p.x+=300)
  for(let i=0;i<90;i++){hand.seen+=16;rig.update(hand,1/60,1440,900)}
  assert.deepEqual(microphoneLayout(1440,900),before)
  assert.ok(Math.hypot(before.top.x-before.tip.x,before.top.y-before.tip.y)<200)
  assert.equal(before.top.x,before.tip.x);assert.equal(before.x,before.tip.x)
})

test('wooden cross and all five string pins follow the same camera hand coordinates',()=>{
  const hand=pose(300,240),first=controllerLayout(hand)
  hand.center.x+=85;hand.center.y+=30;hand.points.forEach(p=>{p.x+=85;p.y+=30})
  const moved=controllerLayout(hand)
  assert.equal(moved.pins.length,5);assert.equal(new Set(moved.pins.map(p=>`${p.x},${p.y}`)).size,5)
  moved.pins.forEach((p,i)=>{assert.ok(Math.abs(p.x-first.pins[i]!.x-85)<.0001);assert.ok(Math.abs(p.y-first.pins[i]!.y-30)<.0001)})
  assert.equal(first.width,moved.width);assert.equal(first.angle,moved.angle)
})

test('quarter and half-note hearts retain filled and hollow duration marks',()=>{
  let fills=0,strokes=0,curves=0
  const ctx={beginPath(){},moveTo(){},bezierCurveTo(){curves++},closePath(){},fill(){fills++},stroke(){strokes++}} as unknown as CanvasRenderingContext2D
  heartNote(ctx,12,15,5,false);heartNote(ctx,30,15,5,true)
  assert.equal(curves,4);assert.equal(fills,1);assert.equal(strokes,1)
})
