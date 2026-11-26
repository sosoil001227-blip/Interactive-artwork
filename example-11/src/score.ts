import type { MusicState } from './music'
import { MELODY, TEMPO } from './song.ts'
const degrees = [0,0,1,1,2,3,3,4,4,5,5,6]
export function staffStep(midi: number) { const n = Math.round(midi); return Math.floor(n / 12) * 7 + degrees[((n % 12) + 12) % 12]! - 37 }
export function heartNote(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, hollow: boolean) {
  ctx.beginPath(); ctx.moveTo(x, y + size * .75)
  ctx.bezierCurveTo(x - size * 1.6, y - size * .15, x - size * .9, y - size * 1.2, x, y - size * .35)
  ctx.bezierCurveTo(x + size * .9, y - size * 1.2, x + size * 1.6, y - size * .15, x, y + size * .75)
  ctx.closePath(); if (hollow) ctx.stroke(); else ctx.fill()
}

export class LiveScore {
  private readonly ctx: CanvasRenderingContext2D
  private width = 0
  private height = 0
  private lastDraw = 0
  private drawingKey = ''
  expanded = false
  constructor(canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('악보를 준비하지 못했어요.')
    this.ctx = context
    // Repaint a paused score once its local typeface has finished loading.
    if (typeof document !== 'undefined') void document.fonts?.ready.then(() => { this.drawingKey = '' })
  }
  draw(state: MusicState, now: number) {
    if (now - this.lastDraw < 33) return
    this.lastDraw = now
    const rect = this.ctx.canvas.getBoundingClientRect(), w = rect.width, h = rect.height
    if (!w || !h) return
    const dpr = Math.min(devicePixelRatio || 1, 1.5)
    const key = `${w}/${h}/${dpr}/${this.expanded}/${state.noteIndex}/${state.noteProgress}/${state.active}`
    if (key === this.drawingKey) return
    this.drawingKey = key
    const ctx = this.ctx
    if (w !== this.width || h !== this.height || ctx.canvas.width !== Math.round(w * dpr) || ctx.canvas.height !== Math.round(h * dpr)) {
      this.width = w; this.height = h
      ctx.canvas.width = Math.round(w * dpr); ctx.canvas.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    ctx.clearRect(0, 0, w, h)
    const rows = this.expanded ? 6 : w < 170 ? 1 : 2
    const startPhrase = this.expanded ? 0 : Math.floor(state.noteIndex / (rows * 7)) * rows
    const rowHeight = h / rows, gap = Math.min(this.expanded ? 6.5 : 5, (rowHeight - 24) / 7)
    for (let row = 0; row < rows; row++) {
      const phrase = startPhrase + row, bottom = row * rowHeight + rowHeight * .53, start = 35, usable = w - start - 13
      ctx.strokeStyle = '#a56b5b66'; ctx.lineWidth = .65
      for (let line = 0; line < 5; line++) { ctx.beginPath(); ctx.moveTo(7, bottom - line * gap); ctx.lineTo(w - 7, bottom - line * gap); ctx.stroke() }
      ctx.font = `${gap * 2.8}px Georgia,serif`; ctx.fillStyle = '#814b3c'; ctx.fillText('𝄞', 9, bottom - gap * .2)
      ctx.font = `${gap * 1.6}px Georgia,serif`; ctx.fillText('4', 23, bottom - gap * 2); ctx.fillText('4', 23, bottom)
      ctx.font = `${this.expanded ? 10 : 8}px SUIT,sans-serif`; ctx.fillStyle = '#9e8162'; ctx.fillText(`${phrase * 2 + 1}`, 7, row * rowHeight + 10)
      for (let beat = 4; beat <= 8; beat += 4) {
        const x = start + beat / 8 * usable
        ctx.strokeStyle = '#a69b8766'; ctx.beginPath(); ctx.moveTo(x, bottom - 4 * gap); ctx.lineTo(x, bottom); ctx.stroke()
      }
      for (let i = 0; i < 7; i++) {
        const index = phrase * 7 + i, note = MELODY[index]!
        const x = start + (i + .32) / 8 * usable, step = staffStep(note.midi), y = bottom - step * gap / 2
        const current = state.noteIndex === index, passed = state.noteIndex > index
        if (current) {
          ctx.fillStyle = state.active ? '#bd4d3929' : '#bd9f6b29'; ctx.beginPath(); ctx.ellipse(x, y, gap * 1.45, gap * 1.6, 0, 0, Math.PI * 2); ctx.fill()
        }
        ctx.strokeStyle = ctx.fillStyle = current ? '#a32332' : passed ? '#a56c53' : '#b6a18b'
        ctx.lineWidth = current ? 1.7 : 1
        if (step < -1) for (let s = -2; s >= step; s -= 2) { ctx.beginPath(); ctx.moveTo(x - gap, bottom - s * gap / 2); ctx.lineTo(x + gap, bottom - s * gap / 2); ctx.stroke() }
        heartNote(ctx, x, y, gap * .82, note.beats === 2)
        ctx.beginPath(); ctx.moveTo(x + gap * .57, y); ctx.lineTo(x + gap * .57, y - gap * 3.1); ctx.stroke()
        ctx.font = `${this.expanded ? 10 : 7}px SUIT,sans-serif`; ctx.textAlign = 'center'
        ctx.fillText(note.syllable, x, bottom + gap * 3.1); ctx.textAlign = 'left'
        if (current) {
          const cursor = start + (i + state.noteProgress * note.beats + .32) / 8 * usable
          ctx.strokeStyle = '#a03332b3'; ctx.lineWidth = 1
          ctx.beginPath(); ctx.moveTo(cursor, bottom - gap * 5.6); ctx.lineTo(cursor, bottom + gap * 3.5); ctx.stroke()
        }
      }
    }
    ctx.canvas.setAttribute?.('aria-label', `Twinkle, Twinkle, Little Star · ${TEMPO} BPM · ${state.noteIndex + 1}/42`)
  }
}
