import test from 'node:test'
import assert from 'node:assert/strict'
import { Conductor, volumeAtHeight } from '../src/music.ts'
import { MELODY, SONG_DURATION, TEMPO, locateNote, midiFrequency } from '../src/song.ts'
import { openingAt } from '../src/opening.ts'
import { pose } from './fixtures.ts'

function conduct(conductor: Conductor, from: number, duration: number, y = 220) {
  let state = conductor.update(undefined, from, 700, 1000)
  for (let t = from + 33; t <= from + duration; t += 33) {
    const hand = pose(700 + Math.sin((t - from) / 600 * Math.PI * 2) * 95, y, 'Right', t)
    state = conductor.update(hand, t, 700, 1000)
  }
  return state
}

test('traditional melody has exactly 42 notes, six 8-beat phrases and a 34-second fresh arrangement', () => {
  assert.equal(MELODY.length, 42); assert.equal(TEMPO, 84)
  assert.ok(SONG_DURATION >= 30 && SONG_DURATION <= 45)
  assert.deepEqual(MELODY.slice(0, 7).map(n => n.midi), [60,60,67,67,69,69,67])
  assert.deepEqual(MELODY.slice(7,14).map(n => n.midi), [65,65,64,64,62,62,60])
  assert.deepEqual(MELODY.slice(14,21).map(n => n.midi), [67,67,65,65,64,64,62])
  assert.deepEqual(MELODY.slice(21,28).map(n => n.midi), MELODY.slice(14,21).map(n => n.midi))
  assert.deepEqual(MELODY.slice(28).map(n => n.midi), MELODY.slice(0,14).map(n => n.midi))
  assert.equal(MELODY.reduce((sum,n) => sum+n.beats, 0), 48)
  for (let i = 0; i < 42; i++) { assert.equal(locateNote(MELODY[i]!.start + .001), i); assert.ok(MELODY[i]!.vowel) }
})

test('small jitter and vertical volume adjustments cannot start a song', () => {
  const conductor = new Conductor()
  let state = conductor.update(pose(700,220,'Right',1000), 1000, 700)
  for (let i = 1; i < 120; i++) state = conductor.update(pose(700 + (i % 2 ? 3 : -3), 100+i*3, 'Right', 1000+i*33), 1000+i*33, 700)
  assert.equal(state.active, false); assert.equal(state.elapsed, 0); assert.equal(state.noteIndex, 0)
})

test('left-right conducting advances the melody; stopping freezes the exact note and fraction, then resumes', () => {
  const conductor = new Conductor()
  let state = conduct(conductor, 1000, 4000)
  assert.ok(state.elapsed > 2 && state.noteIndex > 0); assert.equal(state.frequency, midiFrequency(MELODY[state.noteIndex]!.midi))
  const x = 700 + Math.sin(3960 / 600 * Math.PI * 2) * 95
  for (let t = 5033; t <= 5500; t += 33) state = conductor.update(pose(x,220,'Right',t), t, 700)
  const paused = { elapsed: state.elapsed, index: state.noteIndex, progress: state.noteProgress }
  for (let t = 5533; t < 7500; t += 33) state = conductor.update(pose(x + (t % 2 ? 2 : -2),220,'Right',t), t, 700)
  assert.equal(state.active, false); assert.equal(state.mouth, 0)
  assert.equal(state.elapsed, paused.elapsed); assert.equal(state.noteIndex, paused.index); assert.equal(state.noteProgress, paused.progress)
  state = conduct(conductor, 7600, 1200)
  assert.ok(state.elapsed > paused.elapsed && state.elapsed < paused.elapsed + 1.3)
})

test('hand height changes only singer volume; melody and timing remain identical', () => {
  const high = new Conductor(), low = new Conductor()
  let a = high.update(undefined,1000,700), b = low.update(undefined,1000,700)
  for (let t = 1033; t <= 11000; t += 33) {
    const x = 700 + Math.sin(t / 600 * Math.PI * 2) * 95
    a = high.update(pose(x,100,'Right',t),t,700); b = low.update(pose(x,580,'Right',t),t,700)
    assert.equal(a.noteIndex,b.noteIndex); assert.equal(a.frequency,b.frequency); assert.equal(a.elapsed,b.elapsed)
  }
  assert.ok(a.volume > b.volume + .6); assert.ok(volumeAtHeight(0,700) > volumeAtHeight(700,700))
})

test('tracking loss, background gaps and guide pauses cannot fast-forward or falsely retrigger the music', () => {
  const conductor = new Conductor(); let state = conduct(conductor,1000,1800)
  state = conductor.update(undefined,2850,700); const position = state.elapsed
  assert.equal(state.active,false)
  conductor.resetMotion()
  state = conductor.update(pose(900,100,'Right',20000),20000,700)
  assert.equal(state.active,false); assert.equal(state.elapsed,position)
  conductor.setEnabled(false); state = conduct(conductor,21000,1000)
  assert.equal(state.elapsed,position); assert.equal(state.mouth,0)
  conductor.setEnabled(true); state = conduct(conductor,23000,2000)
  assert.ok(state.elapsed > position)
})

test('complete performance stops at the final half note and lips follow vowel articulation', () => {
  const conductor = new Conductor(); const visited = new Set<number>(), vowels = new Set<string>()
  let state = conductor.update(undefined,1000,700)
  for (let t=1033;t<46000;t+=33) {
    state=conductor.update(pose(700+Math.sin(t/600*Math.PI*2)*95,200,'Right',t),t,700)
    if (state.active) { visited.add(state.noteIndex); vowels.add(state.vowel); assert.ok(state.mouth >= 0 && state.mouth <= 1.2) }
  }
  assert.equal(visited.size,42); assert.ok(vowels.size >= 4)
  assert.equal(state.completed,true); assert.equal(state.elapsed,SONG_DURATION); assert.equal(state.noteIndex,41); assert.equal(state.active,false)
})

test('the existing curtains, applause and spotlight order stays intact', () => {
  assert.equal(openingAt(0).curtain,0); assert.equal(openingAt(600).ovation,false)
  assert.equal(openingAt(2400).curtain,1); assert.ok(openingAt(2400).audience > 0)
  assert.equal(openingAt(4000).ready,true); assert.equal(openingAt(6700).musicReady,true)
})
