import { beatMs, directions, offsets } from './dance.ts'
import type { Direction, PlayerCount, Step, Tracking } from './dance.ts'
import { ArcadePortrait, characters, fitFrame } from './avatar.ts'
import type { Box, Character } from './avatar.ts'
import { DancerSprite } from './dancer.ts'
import type { DancerMotion } from './dancer.ts'
import type { SwingEffect } from './gesture.ts'
import { leadIn, Round } from './round.ts'

export type Screen = 'home' | 'connecting' | 'camera' | 'select' | 'arena'
export interface PlayerView {
  look: Character
  motion: DancerMotion
  track?: Tracking
  lastStep?: Step
  round?: Round
}

interface StageState {
  now: number
  demo: boolean
  clock: number
  active: boolean
  reduced: boolean
  count: PlayerCount
  players: PlayerView[]
}

export const colors: Record<Direction, string> = {
  left: '#ffc261', up: '#bbff76', down: '#fb74d7', right: '#8aa5ff',
}
const angles: Record<Direction, number> = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }
const laneOrder: Direction[] = ['left', 'down', 'up', 'right']
const arrowOutline = [[0, -.67], [.64, -.085], [.44, .16], [.24, -.005], [.24, .57],
  [.145, .65], [-.145, .65], [-.24, .57], [-.24, -.005], [-.44, .16], [-.64, -.085]]

function polygon(c: CanvasRenderingContext2D, points: number[][]) {
  c.beginPath()
  points.forEach(([x, y], i) => i ? c.lineTo(x!, y!) : c.moveTo(x!, y!))
  c.closePath()
}

function arrow(c: CanvasRenderingContext2D, x: number, y: number, r: number, direction: Direction, filled: boolean, glow: boolean) {
  c.save()
  c.translate(x, y)
  c.rotate(angles[direction])
  c.scale(r, r)
  const tone = colors[direction]
  polygon(c, arrowOutline)
  c.lineJoin = 'round'
  c.strokeStyle = '#03081d'; c.lineWidth = .24; c.stroke()
  if (glow) { c.shadowColor = tone; c.shadowBlur = 18 }
  c.strokeStyle = filled ? tone : '#d0f4f4'; c.lineWidth = .13; c.stroke()
  c.shadowBlur = 0
  if (filled) {
    const chrome = c.createLinearGradient(-.5, -.7, .57, .65)
    chrome.addColorStop(0, '#fffbed'); chrome.addColorStop(.34, tone)
    chrome.addColorStop(.55, '#25246f'); chrome.addColorStop(1, tone)
    c.fillStyle = chrome
  } else c.fillStyle = '#0b1734ce'
  c.fill()
  if (filled) {
    c.beginPath()
    c.moveTo(-.37, -.08); c.lineTo(0, -.42); c.lineTo(.37, -.08)
    c.strokeStyle = '#ffffff'; c.lineWidth = .081; c.stroke()
    c.fillStyle = '#fff8df'; c.fillRect(-.07, .055, .14, .36)
  }
  c.restore()
}

// Tile rows follow the 16:9 artwork inside the stage frame.
const floorRows = [[.689, .071], [.742, .101], [.816, .149], [.937, .203]] as const

function floorTile(w: number, h: number, column: number, row: number) {
  const width = Math.min(w, h * 16 / 9), height = width * 9 / 16
  const project = (col: number, side: 0 | 1) => {
    const front = floorRows[row]!, back = floorRows[row + 1]!
    const t = side ? .91 : .09
    const y = front[0] + (back[0] - front[0]) * t
    const step = front[1] + (back[1] - front[1]) * t
    return [w / 2 + width * (col * step - .018), (h - height) / 2 + height * y]
  }
  return [project(column + .07, 0), project(column + .93, 0), project(column + .93, 1), project(column + .07, 1)]
}

export class DanceStage {
  private c: CanvasRenderingContext2D
  private width = 1
  private height = 1
  private deckTop = Infinity
  private deckRight = 0
  private fieldWidth = 1
  private fieldHeight = 1
  private fieldContext: CanvasRenderingContext2D
  private observer: ResizeObserver
  private portraits = [new ArcadePortrait(), new ArcadePortrait()]
  private dancer = new DancerSprite()

  constructor(private canvas: HTMLCanvasElement, private field: HTMLCanvasElement, private deck: HTMLElement) {
    this.c = canvas.getContext('2d')!
    this.fieldContext = field.getContext('2d')!
    this.observer = new ResizeObserver(this.resize)
    this.observer.observe(canvas)
    this.observer.observe(field)
    this.observer.observe(deck)
    this.resize()
  }

  private resize = () => {
    const r = this.canvas.getBoundingClientRect()
    this.width = Math.max(1, r.width); this.height = Math.max(1, r.height)
    const deck = this.deck.getBoundingClientRect()
    this.deckTop = deck.height > 0 ? deck.top - r.top : Infinity
    this.deckRight = deck.height > 0 ? deck.right - r.left : 0
    const ratio = Math.min(1.7, window.devicePixelRatio || 1)
    this.canvas.width = Math.max(1, Math.round(this.width * ratio))
    this.canvas.height = Math.max(1, Math.round(this.height * ratio))
    const field = this.field.getBoundingClientRect()
    this.fieldWidth = Math.max(1, field.width); this.fieldHeight = Math.max(1, field.height)
    this.field.width = Math.max(1, Math.round(this.fieldWidth * ratio))
    this.field.height = Math.max(1, Math.round(this.fieldHeight * ratio))
  }

  draw(state: StageState) {
    const c = this.c, w = this.width, h = this.height
    c.setTransform(this.canvas.width / w, 0, 0, this.canvas.height / h, 0, 0)
    c.clearRect(0, 0, w, h)
    const beat = state.active ? state.clock / beatMs : 0
    const progress = ((beat % 1) + 1) % 1
    const pulse = state.active && !state.reduced ? Math.exp(-progress * 5) : .12
    this.scenery(c, w, h, pulse)
    this.projectedPads(c, state.players, state.now)
    const pane = w / state.players.length
    state.players.forEach((player, index) => {
      const tall = h * (state.count === 2 ? .48 : .65)
      const left = index * pane + pane * (state.count === 2 ? .65 : .71)
      const bounds = { x: left, y: h * .89 - tall, width: pane * .29, height: tall }
      this.drawDancer(c, bounds, player, state.now, beat + index, state.demo && state.active && !state.reduced)
    })
    state.players.forEach((player, index) => this.arena(c, { x: index * pane, y: 0, width: pane, height: h }, player, state, index))
  }

  drawSamples(surfaces: HTMLCanvasElement[]) {
    surfaces.forEach((canvas, index) => {
      const c = canvas.getContext('2d')!
      const { width, height } = canvas
      const look = characters[index]!
      const fill = c.createRadialGradient(width * .53, height * .47, 6, width * .53, height * .53, width * .65)
      fill.addColorStop(0, look.color + '48'); fill.addColorStop(1, '#0d132b')
      c.fillStyle = fill; c.fillRect(0, 0, width, height)
      c.beginPath(); c.ellipse(width / 2, height * .91, width * .31, height * .045, 0, 0, 2 * Math.PI)
      c.fillStyle = look.color + '24'; c.fill()
      this.dancer.draw(c, { x: 0, y: 1, width, height: height - 12 }, look)
    })
  }

  drawPreview(players: PlayerView[], focus: number, now: number, animate: boolean, showDancers = true) {
    const c = this.c, w = this.width, h = this.height
    c.setTransform(this.canvas.width / w, 0, 0, this.canvas.height / h, 0, 0)
    c.clearRect(0, 0, w, h)
    this.projectedPads(c, players, now)
    if (!showDancers) return
    const slot = w / players.length
    players.forEach((player, index) => {
      const center = (index + .5) * slot
      this.drawDancer(c, { x: center - slot * .27, y: h * .13, width: slot * .54, height: h * .76 },
        player, now, now / beatMs + index, animate)
      c.textAlign = 'center'; c.font = `900 ${Math.max(10, Math.min(16, w * .024))}px monospace`
      c.fillStyle = index === focus ? player.look.color : '#dae8ff'
      c.fillText(`P${index + 1} / ${player.look.name}`, center, h * .92)
    })
  }

  private drawDancer(c: CanvasRenderingContext2D, box: Box, player: PlayerView, now: number, beat: number, automatic: boolean) {
    const cx = box.x + box.width / 2, y = box.y + box.height * .92
    const glow = c.createRadialGradient(cx, y, 1, cx, y, Math.max(2, box.width * .43))
    glow.addColorStop(0, player.look.color + '86'); glow.addColorStop(1, player.look.color + '00')
    c.fillStyle = glow
    c.fillRect(box.x, y - box.height * .20, box.width, box.height * .23)
    this.dancer.draw(c, box, player.look, player.motion.snapshot(now, beat, automatic))
  }

  aimAt(video: HTMLVideoElement, x: number, y: number) {
    const field = this.field.getBoundingClientRect()
    if (!field.width || !field.height || !video.videoWidth || !video.videoHeight) return
    const box = fitFrame({ x: field.left, y: field.top, width: field.width, height: field.height }, video.videoWidth / video.videoHeight)
    const point = { x: (x - box.x) / box.width, y: (y - box.y) / box.height }
    if (point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1) return point
  }

  drawField(video: HTMLVideoElement, players: PlayerView[], view: 'guide' | 'style' | 'raw', now: number, reduced: boolean, swing: SwingEffect) {
    const c = this.fieldContext, width = this.fieldWidth, height = this.fieldHeight
    c.setTransform(this.field.width / width, 0, 0, this.field.height / height, 0, 0)
    c.clearRect(0, 0, width, height)
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return
    const box = fitFrame({ x: 0, y: 0, width, height }, video.videoWidth / video.videoHeight)
    if (view === 'style') {
      const split = box.width / players.length
      players.forEach(({ look }, index) => {
        const slot = { ...box, x: box.x + index * split, width: split }
        this.portraits[index]!.draw(c, slot, video, look, players.length, index)
      })
    }
    if (view !== 'guide') swing.draw(c, box, now, reduced)
    this.trackGuides(c, box, players)
  }

  private trackGuides(c: CanvasRenderingContext2D, { x, y, width: w, height: h }: Box, players: PlayerView[]) {
    c.save()
    c.beginPath(); c.rect(x, y, w, h); c.clip()
    if (players.length === 2) {
      c.beginPath(); c.setLineDash([5, 7]); c.moveTo(x + w / 2, y); c.lineTo(x + w / 2, y + h)
      c.strokeStyle = '#ffffffa0'; c.stroke(); c.setLineDash([])
    }
    players.forEach(({ look, track }, i) => {
      const zoneWidth = w / players.length, zoneX = x + i * zoneWidth
      if (track?.floor) {
        const { x: fx, y: fy, dx, dy } = track.floor
        this.pad(c, zoneX + fx * zoneWidth, y + fy * h, dx * zoneWidth, dy * h, track, look.color)
      }
      for (const foot of track?.feet ?? []) {
        const px = zoneX + foot.point.x * zoneWidth, py = y + foot.point.y * h
        c.beginPath(); c.arc(px, py, 6, 0, Math.PI * 2)
        c.fillStyle = '#080e26'; c.fill()
        c.strokeStyle = foot.tile ? colors[foot.tile] : foot.side === 'left' ? '#86f8ff' : '#ffb5f0'
        c.lineWidth = 2; c.stroke()
        c.font = '900 7px monospace'; c.textAlign = 'center'
        c.fillStyle = '#fff'; c.fillText(foot.side === 'left' ? 'L' : 'R', px, py + 2.5)
      }
      c.font = '800 12px system-ui'
      c.textAlign = 'left'
      c.fillStyle = '#151231dc'; c.fillRect(zoneX + 10, y + h - 32, 32, 22)
      c.fillStyle = look.color; c.fillText(`P${i + 1}`, zoneX + 18, y + h - 17)
    })
    c.restore()
  }

  private scenery(c: CanvasRenderingContext2D, w: number, h: number, pulse: number) {
    const light = c.createRadialGradient(w * .50, h * .47, 1, w * .50, h * .47, Math.max(w * .58, 2))
    light.addColorStop(0, '#356aff4b'); light.addColorStop(.50, '#0574be29'); light.addColorStop(1, '#05133a00')
    c.save()
    c.globalAlpha = .5 + pulse * .43
    c.fillStyle = light; c.fillRect(0, h * .12, w, h * .88)
    c.restore()
  }

  private projectedPads(c: CanvasRenderingContext2D, players: PlayerView[], now: number) {
    const w = this.width, h = this.height
    c.save()
    players.forEach(({ look, track, lastStep }, index) => {
      const column = players.length === 1 ? -.5 : index ? 1.05 : -2.05
      const latest = lastStep && now - lastStep.at < 320 ? lastStep.direction : undefined
      const cells = [undefined, ...directions].map(direction => {
        const [dx, dy] = direction ? offsets[direction] : [0, 0]
        return { direction, points: floorTile(w, h, column + dx, 1 + dy) }
      })
      const behindDeck = cells.filter(({ points }) => points.some(([x]) => x! < this.deckRight + 5))
      const bottom = Math.max(-Infinity, ...behindDeck.flatMap(({ points }) => points.map(([, y]) => y!)))
      c.save()
      c.translate(0, -Math.max(0, bottom + 6 - this.deckTop))
      for (const { direction, points } of cells) {
        const pressed = direction ? direction === latest || !!track?.feet.some(foot => foot.tile === direction)
          : !!track?.feet.some(foot => foot.centered)
        const tone = direction ? colors[direction] : look.color
        polygon(c, points)
        c.fillStyle = pressed ? tone + 'b8' : '#0b1c38c9'; c.fill()
        c.strokeStyle = pressed ? '#f4ffff' : tone + 'b8'
        c.lineWidth = pressed ? 2 : 1; c.stroke()
        const x = points.reduce((sum, point) => sum + point[0]!, 0) / points.length
        const y = points.reduce((sum, point) => sum + point[1]!, 0) / points.length
        if (direction) {
          const r = Math.min(23, Math.max(5, (points[2]![1]! - points[0]![1]!) * .38))
          arrow(c, x, y, r, direction, pressed, false)
        } else {
          c.font = `850 ${Math.max(8, Math.min(12, w * .022))}px SUIT, sans-serif`
          c.fillStyle = pressed ? '#0d1b30' : '#f5fbff'
          c.textAlign = 'center'; c.fillText(players.length === 1 ? '중앙' : `P${index + 1}`, x, y + 3)
        }
      }
      c.restore()
    })
    c.restore()
  }

  private arena(c: CanvasRenderingContext2D, { x, width: w, height: h }: Box, player: PlayerView, state: StageState, index: number) {
    c.save()
    c.beginPath(); c.rect(x, 0, w, h); c.clip()
    if (index) { c.fillStyle = '#cffcff50'; c.fillRect(x, h * .17, 1, h * .72) }
    const recent = player.round?.judgement
    const elapsed = recent ? state.clock - recent.shownAt : Infinity
    const active = recent && elapsed < 300 && recent.judgement !== 'BAD' ? recent.direction : undefined
    const laneW = Math.min(w * (state.count === 2 ? .8 : .53), 420)
    const laneX = x + (w - laneW) / 2
    const cell = laneW / 4
    const arrowSize = Math.min(cell * .64, h * .108, 65)
    const receptorY = Math.max(h * .275, 68 + arrowSize * .68)
    const notesY = Math.min(h * .90, this.deckTop - arrowSize - 5)
    const runway = c.createLinearGradient(0, receptorY, 0, notesY)
    runway.addColorStop(0, '#060d34aa'); runway.addColorStop(.40, '#07095243'); runway.addColorStop(1, '#021a290a')
    c.fillStyle = runway; c.fillRect(laneX, receptorY - arrowSize, laneW, notesY - receptorY + arrowSize)
    for (let i = 0; i < laneOrder.length; i++) {
      const dir = laneOrder[i]!
      const column = laneX + i * cell
      c.fillStyle = colors[dir] + '38'; c.fillRect(column, receptorY - arrowSize, 1, notesY - receptorY + arrowSize)
      if (active === dir && !state.reduced) this.spark(c, column + cell / 2, receptorY, arrowSize, colors[dir], elapsed / 300)
      const pressed = player.track?.feet.some(foot => foot.tile === dir)
        || (player.lastStep?.direction === dir && state.now - player.lastStep.at < 260)
      arrow(c, column + cell / 2, receptorY, arrowSize, dir, active === dir || pressed, active === dir)
    }
    const strike = c.createLinearGradient(laneX, 0, laneX + laneW, 0)
    strike.addColorStop(0, '#14e3f600'); strike.addColorStop(.5, player.look.color); strike.addColorStop(1, '#14e3f600')
    c.fillStyle = strike; c.fillRect(laneX, receptorY + arrowSize * .79, laneW, 2)
    if (state.active && player.round) {
      player.round.chart.forEach((note, i) => {
        const t = (note.at - state.clock) / 1850
        if (!player.round!.pending(i) || t < -.13 || t > 1) return
        const column = laneX + (laneOrder.indexOf(note.direction) + .5) * cell
        arrow(c, column, receptorY + t * (notesY - receptorY), arrowSize * .88, note.direction, true, !state.reduced)
      })
      if (state.clock < leadIn && state.clock >= 0) {
        c.fillStyle = '#f7edff'; c.font = `italic 900 ${Math.min(w * .115, h * .17)}px Geist, system-ui`; c.textAlign = 'center'
        c.fillText(String(Math.max(1, Math.ceil((leadIn - state.clock) / beatMs))), laneX + laneW / 2, (receptorY + notesY) / 2 + arrowSize * .28)
      }
    }
    c.restore()
  }

  private spark(c: CanvasRenderingContext2D, x: number, y: number, size: number, tone: string, progress: number) {
    c.save()
    c.translate(x, y)
    c.globalAlpha = Math.max(0, 1 - progress)
    for (let ray = 0; ray < 6; ray++) {
      c.rotate(Math.PI / 3)
      const radius = size * (.73 + progress * .84)
      const width = Math.max(1.1, size * .068)
      polygon(c, [[radius, -width], [radius + size * .33, 0], [radius, width], [radius - width, 0]])
      c.fillStyle = ray % 2 ? '#fffcea' : tone
      c.fill()
    }
    c.restore()
  }

  private pad(c: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, track: Tracking, tone: string) {
    for (const [i, j] of [[0, 0], ...directions.map(direction => offsets[direction])]) {
      const tile = directions.find(direction => offsets[direction][0] === i && offsets[direction][1] === j)
      const px = x + dx * i!, py = y + dy * j!
      const color = tile ? colors[tile] : tone
      const pressed = tile ? track.feet.some(foot => foot.tile === tile) : track.feet.some(foot => foot.centered)
      c.fillStyle = pressed ? color : '#142338d4'
      c.strokeStyle = pressed ? '#fff' : color + 'ae'
      const w = dx * .88, h = dy * .85
      c.fillRect(px - w / 2, py - h / 2, w, h)
      c.strokeRect(px - w / 2, py - h / 2, w, h)
      if (tile) arrow(c, px, py, Math.min(w, h) * .53, tile, pressed, false)
    }
  }

  close() { this.observer.disconnect() }
}

