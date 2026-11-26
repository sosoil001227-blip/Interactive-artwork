import { beatMs, cueAt } from './dance.ts'
import type { Direction, Judgement, Step } from './dance.ts'

export const leadIn = beatMs * 8
export const noteCount = 48
export const duration = leadIn + noteCount * beatMs + 1_000
export const hitWindow = 190
const captureGrace = 300

export interface Note { direction: Direction; at: number }
export interface JudgedNote extends Note { judgement: Judgement; shownAt: number }

export class Round {
  readonly chart: Note[]
  private results = new Map<number, JudgedNote>()
  private next = 0
  judgement?: JudgedNote
  combo = 0
  best = 0
  score = 0
  energy = .67
  counts = { PERFECT: 0, GREAT: 0, BAD: 0 }

  constructor(player: number) {
    this.chart = Array.from({ length: noteCount }, (_, i) => ({
      at: leadIn + i * beatMs, direction: cueAt(i + player * 5),
    }))
  }

  pending(index: number) { return !this.results.has(index) }

  advance(clock: number) {
    while (this.next < this.chart.length) {
      if (this.results.has(this.next)) { this.next++; continue }
      if (clock <= this.chart[this.next]!.at + hitWindow + captureGrace) break
      this.grade(this.next++, 'BAD', clock)
    }
  }

  hit(step: Step, clock: number) {
    const index = Math.round((step.at - leadIn) / beatMs)
    const note = this.chart[index]
    if (!note || !this.pending(index)) return
    const offset = Math.abs(note.at - step.at)
    if (offset > hitWindow) return
    while (this.next < index) {
      if (this.pending(this.next)) this.grade(this.next, 'BAD', clock)
      this.next++
    }
    const judgement = note.direction !== step.direction ? 'BAD' : offset <= 105 ? 'PERFECT' : 'GREAT'
    this.grade(index, judgement, clock)
  }

  private grade(index: number, judgement: Judgement, clock: number) {
    const result = { ...this.chart[index]!, judgement, shownAt: clock }
    this.results.set(index, result)
    this.judgement = result
    this.counts[judgement]++
    this.combo = judgement === 'BAD' ? 0 : this.combo + 1
    this.best = Math.max(this.best, this.combo)
    this.score += judgement === 'PERFECT' ? 1000 : judgement === 'GREAT' ? 600 : 0
    this.energy = Math.max(0, Math.min(1, this.energy + (judgement === 'BAD' ? -.115 : .055)))
  }
}
