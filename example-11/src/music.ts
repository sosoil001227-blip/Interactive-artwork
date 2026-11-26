import type { HandPose, Point } from './tracking'
import { MELODY, SONG_DURATION, locateNote, midiFrequency, noteName } from './song.ts'
import type { Vowel } from './song'
export { midiFrequency, noteName } from './song.ts'

export type MusicState = { controlActive: boolean; active: boolean; conducting: boolean; completed: boolean;
  midi: number; frequency: number; name: string; syllable: string; vowel: Vowel; energy: number; mouth: number;
  volume: number; elapsed: number; noteIndex: number; noteProgress: number; swing: number; baton?: { base: Point; tip: Point } }
const clamp = (n: number, low = 0, high = 1) => Math.max(low, Math.min(high, n))
export function volumeAtHeight(y: number, height: number) { return .12 + .88 * clamp((height * .88 - y) / Math.max(1, height * .72)) }

export class Conductor {
  private previousX: number | undefined
  private lastSeen = 0
  private previousNow = 0
  private lastMoved = -Infinity
  private extreme = 0
  private motionX = 0
  private direction = 0
  private swing = 0
  private volume = .6
  private elapsed = 0
  private lastClock: number | undefined
  private wasPlaying = false
  private enabled = true

  reset() { this.elapsed = 0; this.swing = 0; this.volume = .6; this.lastClock = undefined; this.wasPlaying = false; this.resetMotion() }
  resetMotion() { this.previousX = undefined; this.lastSeen = 0; this.previousNow = 0; this.lastMoved = -Infinity; this.direction = 0; this.wasPlaying = false; this.lastClock = undefined }
  setEnabled(enabled: boolean) { this.enabled = enabled; if (!enabled) this.resetMotion() }

  update(hand: HandPose | undefined, now: number, height: number, width = 1000, clock = now / 1000): MusicState {
    const dt = this.previousNow ? Math.max(0, Math.min(.05, (now - this.previousNow) / 1000)) : 1 / 60
    const clockDt = this.lastClock === undefined ? 0 : Math.max(0, Math.min(.05, clock - this.lastClock))
    this.lastClock = clock; this.previousNow = now
    let baton: MusicState['baton']
    if (hand) {
      const x = hand.center.x + (hand.points[8]!.x - hand.points[5]!.x) * .3
      const threshold = Math.max(9, width * .012)
      if (this.previousX === undefined || hand.seen - this.lastSeen > 280) {
        this.previousX = this.extreme = this.motionX = x; this.direction = 0; this.lastMoved = -Infinity
      } else if (hand.seen !== this.lastSeen) {
        const sampleDt = Math.max(.012, (hand.seen - this.lastSeen) / 1000), dx = x - this.previousX
        if (Math.abs(dx) / sampleDt > Math.max(45, width * .045) && Math.abs(x - this.motionX) >= threshold) { this.lastMoved = now; this.motionX = x }
        if (!this.direction && Math.abs(x - this.extreme) >= threshold) { this.direction = Math.sign(x - this.extreme); this.swing++ }
        else if (this.direction > 0) {
          if (x > this.extreme) this.extreme = x
          else if (this.extreme - x >= threshold) { this.direction = -1; this.extreme = x; this.swing++ }
        } else if (this.direction < 0) {
          if (x < this.extreme) this.extreme = x
          else if (x - this.extreme >= threshold) { this.direction = 1; this.extreme = x; this.swing++ }
        }
        this.previousX = x
      }
      this.lastSeen = hand.seen
      const target = volumeAtHeight(hand.center.y, height)
      this.volume += (target - this.volume) * (1 - Math.exp(-dt / .075))
      const index = hand.points[8]!, base = hand.points[5]!, dx = index.x - base.x, dy = index.y - base.y, length = Math.hypot(dx, dy) || 1
      baton = { base: { x: base.x, y: base.y }, tip: { x: index.x + dx / length * 125, y: index.y + dy / length * 125 } }
    } else { this.previousX = undefined; this.lastMoved = -Infinity; this.direction = 0 }
    const moving = !!hand && now - hand.seen < 150 && now - this.lastMoved < 160 && this.direction !== 0
    const playing = this.enabled && moving && this.elapsed < SONG_DURATION
    // Only two consecutive active frames advance the shared musical clock.
    // Pauses, dropped hands, hidden tabs and reacquisition cannot catch up or skip notes.
    if (playing && this.wasPlaying) this.elapsed = Math.min(SONG_DURATION, this.elapsed + clockDt)
    this.wasPlaying = playing
    const index = locateNote(this.elapsed), note = MELODY[index]!
    const progress = clamp((this.elapsed - note.start) / note.duration)
    const completed = this.elapsed >= SONG_DURATION
    const active = playing && !completed
    const articulation = Math.min(1, progress / .06) * Math.min(1, (1 - progress) / .12)
    const shape = note.vowel === 'oo' ? .56 : note.vowel === 'ih' ? .68 : 1
    const mouth = active ? (.04 + .90 * articulation) * shape * (.82 + (note.midi - 60) / 45) : 0
    return { controlActive: !!hand, active, conducting: moving, completed, midi: note.midi, frequency: midiFrequency(note.midi), name: noteName(note.midi),
      syllable: note.syllable, vowel: note.vowel, energy: active ? articulation : 0, mouth, volume: this.volume,
      elapsed: this.elapsed, noteIndex: index, noteProgress: progress, swing: this.swing, baton }
  }
}
