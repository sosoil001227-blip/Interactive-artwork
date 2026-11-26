import { clamp, ease, mix } from './geometry.ts'
import type { Vec3 } from './geometry.ts'
import type { MaskState } from './animation.ts'
import { partMotion } from './animation.ts'
import type { TrackingFrame, TrackedHand } from './tracking.ts'
import { MarioGesture, brickDropMs, extendedFingers, gloveAssemblyMs, upwardHit } from './marioGesture.ts'
import type { HitBox } from './marioGesture.ts'
import { MarioSound } from './marioSound.ts'
import { gauntletShell } from './gauntletGeometry.ts'
import type { HandOutline } from './gauntletGeometry.ts'
import { HandContourSampler } from './handContour.ts'
import { marioBrickLayout, marioCapBounds } from './marioLayout.ts'
import type { MarioCapBounds } from './marioLayout.ts'

export type MarioProjection = (point: Vec3) => Vec3
interface Coin { x: number; y: number; vx: number; vy: number; age: number; size: number; phase: number }
interface Spark { x: number; y: number; vx: number; vy: number; age: number }
interface HandSample { points: Vec3[]; at: number }
const tau = Math.PI * 2

function ellipse(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient) {
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, tau); c.fillStyle = fill; c.fill()
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient) {
  c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = fill; c.fill()
}

function cap(c: CanvasRenderingContext2D) {
  c.save()
  const red = c.createRadialGradient(-.4, -.72, .02, .05, -.32, 1.25)
  red.addColorStop(0, '#ff6a58'); red.addColorStop(.3, '#f72c26'); red.addColorStop(.7, '#df0717'); red.addColorStop(1, '#800316')
  c.shadowColor = '#31030d55'; c.shadowBlur = 8
  c.beginPath(); c.moveTo(-1.03, .06)
  c.bezierCurveTo(-1.25, -.08, -1.06, -.40, -.88, -.47)
  c.bezierCurveTo(-.79, -1.16, .47, -1.21, .88, -.61)
  c.bezierCurveTo(1.04, -.39, 1.10, -.12, 1.03, .06)
  c.bezierCurveTo(.52, .30, -.60, .30, -1.03, .06)
  c.fillStyle = red; c.fill(); c.shadowBlur = 0
  c.strokeStyle = '#a50a1c'; c.lineWidth = .018; c.stroke()
  c.beginPath(); c.moveTo(-.83, -.41); c.bezierCurveTo(-.56, -.94, .19, -1.09, .62, -.71)
  c.strokeStyle = '#ffaca144'; c.lineWidth = .025; c.stroke()
  const badge = c.createLinearGradient(-.22, -.92, .22, -.38)
  badge.addColorStop(0, '#fff'); badge.addColorStop(1, '#dcdfe6')
  ellipse(c, .04, -.63, .285, .31, '#990514')
  ellipse(c, .03, -.65, .271, .298, badge)
  c.strokeStyle = '#b1afb2'; c.lineWidth = .012; c.stroke()
  // The emblem is a path so it stays correctly oriented in the mirrored camera.
  c.beginPath(); c.moveTo(-.16, -.45); c.lineTo(-.13, -.84); c.lineTo(.035, -.67)
  c.lineTo(.19, -.84); c.lineTo(.23, -.45); c.lineTo(.13, -.45)
  c.lineTo(.105, -.65); c.lineTo(.035, -.56); c.lineTo(-.045, -.65); c.lineTo(-.06, -.45)
  c.closePath(); c.fillStyle = '#e51b2b'; c.fill()
  const brim = c.createLinearGradient(0, -.03, 0, .35)
  brim.addColorStop(0, '#ff3c32'); brim.addColorStop(.4, '#ed1523'); brim.addColorStop(1, '#9a071e')
  c.beginPath(); c.moveTo(-1.06, .045)
  c.bezierCurveTo(-.54, -.16, .57, -.18, 1.06, .045)
  c.bezierCurveTo(1.31, .13, 1.32, .26, 1.08, .30)
  c.bezierCurveTo(.60, .43, -.50, .43, -1.09, .25)
  c.bezierCurveTo(-1.29, .19, -1.27, .12, -1.06, .045)
  c.fillStyle = brim; c.fill()
  c.strokeStyle = '#9b0619'; c.lineWidth = .018; c.stroke()
  c.beginPath(); c.moveTo(-1.08, .08); c.bezierCurveTo(-.45, -.10, .54, -.10, 1.10, .11)
  c.strokeStyle = '#ff867399'; c.lineWidth = .023; c.stroke()
  c.restore()
}

function moustache(c: CanvasRenderingContext2D) {
  const hair = c.createLinearGradient(0, -.28, 0, .58)
  hair.addColorStop(0, '#352019'); hair.addColorStop(.45, '#241610'); hair.addColorStop(1, '#0c0909')
  c.beginPath(); c.moveTo(-1.05, -.26)
  c.bezierCurveTo(-1.10, .12, -.97, .51, -.71, .37)
  c.bezierCurveTo(-.63, .63, -.37, .65, -.25, .43)
  c.bezierCurveTo(-.15, .69, .15, .69, .25, .43)
  c.bezierCurveTo(.37, .65, .63, .63, .71, .37)
  c.bezierCurveTo(.97, .51, 1.10, .12, 1.05, -.26)
  c.bezierCurveTo(.82, .01, .47, -.04, .22, -.20)
  c.bezierCurveTo(.10, -.29, -.10, -.29, -.22, -.20)
  c.bezierCurveTo(-.47, -.04, -.82, .01, -1.05, -.26)
  c.closePath(); c.fillStyle = hair; c.fill()
  c.strokeStyle = '#110c0a'; c.lineWidth = .024; c.stroke()
  for (const side of [-1, 1]) {
    c.beginPath(); c.moveTo(side * .20, -.10); c.bezierCurveTo(side * .43, .10, side * .76, .25, side * .93, .03)
    c.strokeStyle = '#82604d66'; c.lineWidth = .022; c.stroke()
  }
}

function nose(c: CanvasRenderingContext2D) {
  const skin = c.createRadialGradient(-.30, -.33, .03, .12, .16, 1.04)
  skin.addColorStop(0, '#ffe1b3'); skin.addColorStop(.35, '#ffc38d'); skin.addColorStop(.72, '#ee9c64'); skin.addColorStop(1, '#b95e3d')
  ellipse(c, .03, .13, 1, .88, '#5b241e30')
  ellipse(c, 0, 0, 1, .89, skin)
  ellipse(c, -.30, -.36, .29, .14, '#fff1cf55')
}

function glove(c: CanvasRenderingContext2D, points: Vec3[], outline?: HandOutline) {
  const shell = gauntletShell(points, outline)
  if (!shell) return
  const wrist = points[0]!, middle = points[9]!, index = points[5]!, pinky = points[17]!
  const palmWidth = Math.hypot(index.x - pinky.x, index.y - pinky.y)
  const radius = shell.size * .22
  c.save()
  const white = c.createLinearGradient(index.x - radius * 3, index.y - radius * 3, pinky.x + radius * 3, wrist.y + radius * 3)
  white.addColorStop(0, '#fff'); white.addColorStop(.52, '#f7f8fa'); white.addColorStop(1, '#b8c0cd')
  c.lineCap = c.lineJoin = 'round'
  const fingers = new Path2D()
  for (const finger of shell.fingers) {
    const joints = finger.joints.map(joint => ({ ...joint, radius: joint.radius * 1.12 }))
    for (let i = 0; i < 3; i++) {
      const a = joints[i]!, b = joints[i + 1]!
      const dx = b.center.x - a.center.x, dy = b.center.y - a.center.y
      const length = Math.hypot(dx, dy)
      if (length < .01) continue
      const nx = -dy / length, ny = dx / length
      fingers.moveTo(a.center.x - nx * a.radius, a.center.y - ny * a.radius)
      fingers.lineTo(b.center.x - nx * b.radius, b.center.y - ny * b.radius)
      fingers.lineTo(b.center.x + nx * b.radius, b.center.y + ny * b.radius)
      fingers.lineTo(a.center.x + nx * a.radius, a.center.y + ny * a.radius)
      fingers.closePath()
    }
    for (const [i, joint] of joints.entries()) {
      const prior = joints[Math.max(0, i - 1)]!.center
      const angle = i === 3 ? Math.atan2(joint.center.y - prior.y, joint.center.x - prior.x) : 0
      const reach = joint.capRadius === undefined ? joint.radius : Math.max(joint.radius * .70, joint.capRadius)
      fingers.moveTo(joint.center.x + Math.cos(angle) * reach, joint.center.y + Math.sin(angle) * reach)
      fingers.ellipse(joint.center.x, joint.center.y, reach, joint.radius, angle, 0, tau)
      fingers.closePath()
    }
  }
  const palm = new Path2D()
  shell.palm.forEach((point, i) => i ? palm.lineTo(point.x, point.y) : palm.moveTo(point.x, point.y))
  palm.closePath()
  const palmPadding = Math.max(shell.palmPadding, shell.size * .185)
  c.strokeStyle = '#8d96a6'; c.lineWidth = 2.4; c.stroke(fingers)
  c.lineWidth = palmPadding * 2 + 2.4; c.stroke(palm); c.fillStyle = '#8d96a6'; c.fill(palm)
  c.fillStyle = white; c.fill(fingers); c.fill(palm)
  c.strokeStyle = white; c.lineWidth = palmPadding * 2; c.stroke(palm)
  const angle = Math.atan2(middle.y - wrist.y, middle.x - wrist.x) + Math.PI / 2
  c.save(); c.translate(wrist.x, wrist.y); c.rotate(angle)
  roundRect(c, -palmWidth * .44 - radius, -radius * .30, palmWidth * .88 + radius * 2, radius * 2.7, radius * .65, '#e9edf4')
  c.strokeStyle = '#a6afbf'; c.lineWidth = 1.4; c.stroke()
  c.beginPath(); c.moveTo(-palmWidth * .43, radius * 1.7); c.lineTo(palmWidth * .43, radius * 1.7)
  c.strokeStyle = '#fff'; c.stroke(); c.restore()
  for (const id of [5, 9, 13]) {
    const p = points[id]!, dx = (wrist.x - p.x) * .27, dy = (wrist.y - p.y) * .27
    c.beginPath(); c.moveTo(p.x + dx * .45, p.y + dy * .45); c.lineTo(p.x + dx, p.y + dy)
    c.lineWidth = Math.max(1, radius * .12); c.strokeStyle = '#aab3c055'; c.stroke()
  }
  c.restore()
}

export class MarioWorld {
  readonly gesture = new MarioGesture()
  readonly sound = new MarioSound()
  score = 0
  private frame?: TrackingFrame
  private handReceived = -Infinity
  private coins: Coin[] = []
  private sparks: Spark[] = []
  private before = new Map<string, HandSample>()
  private lastHit = -Infinity
  private bumpAt = -Infinity
  private demoStart?: number
  private demoHit = false
  private lastNow = 0
  private lastCapture = -Infinity
  private lastBox?: HitBox
  private contours = new HandContourSampler()
  private outlines = new Map<TrackedHand['label'], HandOutline>()

  reset() {
    this.gesture.reset(); this.frame = undefined; this.handReceived = -Infinity
    this.coins = []; this.sparks = []; this.before.clear()
    this.score = 0; this.lastHit = this.bumpAt = -Infinity
    this.demoStart = undefined; this.demoHit = false; this.lastNow = 0; this.lastCapture = -Infinity
    this.lastBox = undefined; this.outlines.clear(); this.contours.clear()
  }

  update(frame: TrackingFrame, now: number, reduced: boolean, image?: ImageBitmap) {
    this.frame = frame; this.handReceived = now
    this.gesture.update(frame, now, reduced)
    const previous = this.outlines
    this.outlines = new Map()
    if (!image || this.gesture.glovesAt === undefined) return
    for (const hand of frame.hands ?? []) {
      const points = hand.landmarks.map(p => ({ x: p.x * frame.width, y: p.y * frame.height, z: p.z * frame.width }))
      const outline = this.contours.sample(image, points, previous.get(hand.label))
      if (outline) this.outlines.set(hand.label, outline)
    }
  }

  status(now: number) {
    const hands = now - this.handReceived < 450 ? (this.frame?.hands ?? []).filter(hand => hand.landmarks.length === 21) : []
    return { stage: this.gesture.stage(now), score: this.score, hands: hands.length,
      fingers: hands.reduce((sum, hand) => sum + extendedFingers(hand), 0) }
  }

  demo(now: number, reduced: boolean) {
    this.reset(); this.demoStart = now
    this.gesture.glovesAt = now + (reduced ? 0 : 1500)
    this.gesture.bricksAt = now + (reduced ? 0 : 2800)
  }

  private burst(box: HitBox, now: number, reduced: boolean, audible: boolean) {
    if (now - this.lastHit < 400) return
    this.lastHit = this.bumpAt = now
    const count = reduced ? 4 : 12
    this.score += count
    for (let i = 0; i < count; i++) {
      this.coins.push({ x: box.x + box.size * .5, y: box.y + box.size * .14,
        vx: (Math.random() - .5) * box.size * 3.4, vy: -box.size * (3.3 + Math.random() * 3),
        age: -i * .018, size: box.size * (.11 + Math.random() * .04), phase: Math.random() * tau })
    }
    if (!reduced) for (let i = 0; i < 16; i++) {
      const angle = Math.random() * tau, speed = box.size * (1 + Math.random() * 2)
      this.sparks.push({ x: box.x + box.size / 2, y: box.y + box.size / 2,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, age: 0 })
    }
    this.coins = this.coins.slice(-144); this.sparks = this.sparks.slice(-64)
    if (audible) this.sound.hit()
  }

  private collide(hands: TrackedHand[], frame: TrackingFrame, project: MarioProjection, box: HitBox, now: number, reduced: boolean) {
    if (frame.timestamp === this.lastCapture) return
    this.lastCapture = frame.timestamp
    const priorBox = this.lastBox
    if (priorBox && Math.hypot(box.x - priorBox.x, box.y - priorBox.y, box.size - priorBox.size) > box.size * .18) this.before.clear()
    this.lastBox = box
    const present = new Set<string>()
    for (const hand of hands) {
      if (hand.landmarks.length !== 21) continue
      const key = hand.label
      present.add(key)
      const points = hand.landmarks.map(p => project({ x: p.x * frame.width, y: p.y * frame.height, z: p.z * frame.width }))
      const before = this.before.get(key)
      if (before && this.gesture.stage(now) === 'play') {
        // Fingertips and knuckles both work, so an open hand and a fist can hit.
        if ([4, 8, 12, 16, 20, 5, 9, 13, 17].some(id => upwardHit(before.points[id]!, points[id]!, box, frame.timestamp - before.at))) {
          this.burst(box, now, reduced, true)
        }
      }
      this.before.set(key, { points, at: frame.timestamp })
    }
    for (const key of this.before.keys()) if (!present.has(key)) this.before.delete(key)
  }

  drawFace(c: CanvasRenderingContext2D, frame: TrackingFrame, project: MarioProjection,
    state: MaskState, elapsed: number, w: number, h: number, reduced: boolean) {
    if (state === 'off' || ![454, 234, 10, 1, 13].every(i => {
      const p = frame.face[i]
      return p && [p.x, p.y, p.z].every(Number.isFinite)
    })) return
    const point = (i: number) => { const p = frame.face[i]!; return project({ x: p.x * frame.width, y: p.y * frame.height, z: p.z * frame.width }) }
    const a = point(454), b = point(234), forehead = point(10), tip = point(1), lip = point(13)
    const faceWidth = Math.max(10, Math.hypot(b.x - a.x, b.y - a.y))
    const roll = Math.atan2(b.y - a.y, b.x - a.x)
    const items = [
      { draw: cap, center: forehead, scale: faceWidth * .56, delay: 0, lane: 0 },
      { draw: moustache, center: { ...lip, y: mix(tip.y, lip.y, .73) }, scale: faceWidth * .38, delay: 180, lane: 2 },
      { draw: nose, center: tip, scale: faceWidth * .165, delay: 390, lane: 1 },
    ]
    for (const item of items) {
      const motion = partMotion(state, elapsed, item.delay, 790)
      if (!motion.visible) continue
      const approach = reduced ? 1 : motion.approach
      const remaining = 1 - approach
      const draw = (lane: number, ghost: boolean) => {
        const angle = lane * Math.PI / 2 - Math.PI / 2 + remaining * Math.PI * 1.6
        const radius = remaining * Math.max(w, h) * .90
        c.save()
        c.globalAlpha = ghost ? clamp(remaining) * .38 : state === 'releasing' ? clamp(approach * 1.6) : 1
        c.translate(item.center.x + Math.cos(angle) * radius, item.center.y + Math.sin(angle) * radius)
        c.rotate(roll + remaining * (lane % 2 ? -1 : 1) * tau * 1.4)
        const scale = item.scale * (.5 + .5 * clamp(approach))
        c.scale(scale, scale)
        item.draw(c); c.restore()
      }
      if (state === 'assembling' && remaining > .035 && !reduced) {
        for (let lane = 0; lane < 4; lane++) if (lane !== item.lane) draw(lane, true)
      }
      draw(item.lane, false)
      if (motion.latch > .2 && !reduced) {
        c.save(); c.globalAlpha = motion.latch * .8; c.strokeStyle = '#ffe58a'; c.lineWidth = 2
        for (let i = 0; i < 8; i++) {
          const angle = i * tau / 8, r = item.scale * (1.25 + (1 - motion.latch) * .5)
          c.beginPath(); c.moveTo(item.center.x + Math.cos(angle) * r, item.center.y + Math.sin(angle) * r)
          c.lineTo(item.center.x + Math.cos(angle) * (r + 7), item.center.y + Math.sin(angle) * (r + 7)); c.stroke()
        }
        c.restore()
      }
    }
    if (state === 'locked') return marioCapBounds(forehead.x, forehead.y, faceWidth * .56, roll)
  }

  draw(c: CanvasRenderingContext2D, project: MarioProjection, now: number, w: number, h: number, reduced: boolean, preview: boolean, cap?: MarioCapBounds) {
    const dt = this.lastNow ? clamp((now - this.lastNow) / 1000, 0, .05) : 0
    this.lastNow = now
    const box = this.gesture.bricksAt === undefined ? undefined : marioBrickLayout(w, h, cap)
    const frame = this.frame
    const fresh = frame && now - this.handReceived < 390
    const glovesAt = this.gesture.glovesAt
    if (glovesAt === undefined && fresh && !preview) {
      this.drawHandGuides(c, frame, project)
    }
    if (glovesAt !== undefined && now >= glovesAt) {
      if (preview) this.drawDemoHands(c, now, w, h, box, reduced)
      else if (fresh) {
        for (const hand of frame.hands ?? []) {
          const points = hand.landmarks.map(p => project({ x: p.x * frame.width, y: p.y * frame.height, z: p.z * frame.width }))
          if (points.length !== 21) continue
          const t = ease((now - glovesAt) / gloveAssemblyMs)
          const wrist = points[0]!
          const fall = (1 - t) * (h + wrist.y + 100)
          const turn = reduced ? 0 : (1 - t) * .45
          const land = (p: Vec3): Vec3 => {
            const dx = p.x - wrist.x, dy = p.y - wrist.y
            return { x: wrist.x + dx * Math.cos(turn) - dy * Math.sin(turn),
              y: wrist.y + dx * Math.sin(turn) + dy * Math.cos(turn) - fall, z: p.z }
          }
          const measured = this.outlines.get(hand.label)
          const outline = measured && { ...measured, palm: measured.palm.map(p => land(project({ ...p, z: 0 }))) }
          glove(c, points.map(land), outline)
        }
      }
    }
    if (box && this.gesture.bricksAt !== undefined && now >= this.gesture.bricksAt) {
      const t = clamp((now - this.gesture.bricksAt) / brickDropMs)
      const drop = reduced ? 1 : clamp(1 - Math.pow(1 - t, 3) + Math.sin(t * Math.PI * 3) * (1 - t) * .055)
      for (let i = -2; i <= 2; i++) {
        const x = box.x + i * box.size, y = box.y - (1 - drop) * (h * .5 + box.size)
        const bounce = i === 0 && now - this.bumpAt < 240 ? -Math.sin((now - this.bumpAt) / 240 * Math.PI) * box.size * .20 : 0
        this.drawBlock(c, x, y + bounce, box.size, i === 0, now)
      }
      if (fresh && !preview && t >= 1) this.collide(frame.hands ?? [], frame, project, box, now, reduced)
      if (preview && this.demoStart !== undefined && now - this.demoStart > (reduced ? 900 : 4200) && !this.demoHit) {
        this.demoHit = true; this.burst(box, now, reduced, true)
      }
    } else { this.before.clear(); this.lastBox = undefined }
    this.drawCoins(c, dt, h, now, reduced)
    this.drawHud(c, w)
  }

  private drawHandGuides(c: CanvasRenderingContext2D, frame: TrackingFrame, project: MarioProjection) {
    c.save(); c.lineWidth = 1.7; c.lineCap = 'round'
    for (const hand of frame.hands ?? []) {
      if (hand.landmarks.length !== 21) continue
      const points = hand.landmarks.map(p => project({ x: p.x * frame.width, y: p.y * frame.height, z: p.z * frame.width }))
      const count = extendedFingers(hand)
      c.strokeStyle = count >= 4 ? '#baffcb99' : '#ffe5a299'
      for (const chain of [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [5, 9, 10, 11, 12], [9, 13, 14, 15, 16], [13, 17, 18, 19, 20], [17, 0]]) {
        c.beginPath()
        chain.forEach((id, i) => { const p = points[id]!; if (i) c.lineTo(p.x, p.y); else c.moveTo(p.x, p.y) })
        c.stroke()
      }
      for (const id of [4, 8, 12, 16, 20]) ellipse(c, points[id]!.x, points[id]!.y, 3, 3, count >= 4 ? '#c3ffd5' : '#ffe5a2')
      const wrist = points[0]!
      roundRect(c, wrist.x - 22, wrist.y + 11, 44, 23, 5, '#10202cdd')
      c.fillStyle = '#fff4ce'; c.font = '600 12px ui-monospace, monospace'; c.textAlign = 'center'
      c.fillText(`${count}/5`, wrist.x, wrist.y + 27)
    }
    c.restore()
  }

  private drawBlock(c: CanvasRenderingContext2D, x: number, y: number, s: number, question: boolean, now: number) {
    c.save(); c.translate(x, y)
    c.shadowColor = '#0006'; c.shadowBlur = 9; c.shadowOffsetY = 4
    roundRect(c, 1, 1, s - 2, s - 2, s * .05, question ? '#a87c08' : '#542a1b')
    c.shadowBlur = c.shadowOffsetY = 0
    if (question) {
      const gold = c.createLinearGradient(0, 0, s, s)
      gold.addColorStop(0, '#fff384'); gold.addColorStop(.45, '#f5d53e'); gold.addColorStop(1, '#dba814')
      roundRect(c, s * .045, s * .025, s * .91, s * .91, s * .035, gold)
      c.strokeStyle = '#fff6aa'; c.lineWidth = s * .025
      c.beginPath(); c.moveTo(s * .08, s * .83); c.lineTo(s * .08, s * .07); c.lineTo(s * .91, s * .07); c.stroke()
      c.fillStyle = '#947714'
      for (const dx of [.11, .87]) for (const dy of [.11, .84]) ellipse(c, s * dx, s * dy, s * .035, s * .035, '#927516')
      // Pixel-style question mark with a raised white face, matching the reference block.
      const rows = ['011110', '110011', '000011', '000110', '001100', '001100', '000000', '001100']
      const unit = s * .080, left = s * .26, top = s * .18
      for (const [j, row] of rows.entries()) for (let i = 0; i < row.length; i++) if (row[i] === '1') {
        c.fillStyle = '#9f862a'; c.fillRect(left + i * unit + 2, top + j * unit + 3, unit + .7, unit + .7)
      }
      for (const [j, row] of rows.entries()) for (let i = 0; i < row.length; i++) if (row[i] === '1') {
        c.fillStyle = '#fffde8'; c.fillRect(left + i * unit, top + j * unit, unit + .7, unit + .7)
      }
      if (now - this.bumpAt < 180) { c.fillStyle = '#fff8'; c.fillRect(3, 3, s - 6, s - 6) }
    } else {
      const gap = s * .038, rowH = s / 3
      for (let row = 0; row < 3; row++) {
        const offset = row === 1 ? -s * .25 : 0
        for (let column = 0; column < 3; column++) {
          const left = Math.max(gap, offset + column * s * .51 + gap)
          const right = Math.min(s - gap, offset + (column + 1) * s * .51 - gap)
          if (right <= left) continue
          const top = row * rowH + gap
          roundRect(c, left, top, right - left, rowH - gap * 2, gap * .3, '#955434')
          c.strokeStyle = '#d99b70'; c.lineWidth = gap * .65
          c.beginPath(); c.moveTo(left, top + rowH - gap * 3); c.lineTo(left, top); c.lineTo(right, top); c.stroke()
          c.strokeStyle = '#64351f'; c.beginPath(); c.moveTo(right, top); c.lineTo(right, top + rowH - gap * 2); c.lineTo(left, top + rowH - gap * 2); c.stroke()
        }
      }
    }
    c.restore()
  }

  private drawCoins(c: CanvasRenderingContext2D, dt: number, h: number, now: number, reduced: boolean) {
    for (const coin of this.coins) {
      coin.age += dt
      if (coin.age < 0) continue
      coin.vy += 630 * dt; coin.x += coin.vx * dt; coin.y += coin.vy * dt
      const flip = reduced ? 1 : Math.max(.12, Math.abs(Math.cos(now / 85 + coin.phase)))
      c.save(); c.translate(coin.x, coin.y); c.scale(flip, 1)
      c.globalAlpha = clamp((2.8 - coin.age) * 2)
      const gold = c.createLinearGradient(-coin.size, 0, coin.size, 0)
      gold.addColorStop(0, '#b97004'); gold.addColorStop(.25, '#fff198'); gold.addColorStop(.5, '#ffe353'); gold.addColorStop(1, '#d38c08')
      ellipse(c, 0, 0, coin.size * .72, coin.size, '#a66809')
      ellipse(c, -1, -1, coin.size * .60, coin.size * .90, gold)
      c.strokeStyle = '#fff3a0'; c.lineWidth = Math.max(1, coin.size * .08); c.stroke()
      roundRect(c, -coin.size * .08, -coin.size * .55, coin.size * .14, coin.size * 1.05, 1, '#ba7c18')
      c.restore()
    }
    this.coins = this.coins.filter(coin => coin.age < 2.8 && coin.y < h + 60)
    for (const spark of this.sparks) {
      spark.age += dt; spark.x += spark.vx * dt; spark.y += spark.vy * dt; spark.vy += 250 * dt
      c.save(); c.globalAlpha = clamp(1 - spark.age * 2.4); c.translate(spark.x, spark.y); c.rotate(Math.PI / 4 + spark.age)
      c.fillStyle = '#fff2ad'; c.fillRect(-2, -2, 4, 4); c.restore()
    }
    this.sparks = this.sparks.filter(spark => spark.age < .45)
  }

  private drawHud(c: CanvasRenderingContext2D, w: number) {
    c.save()
    const width = 112
    roundRect(c, w - width - 16, 16, width, 35, 6, '#171b24d9')
    ellipse(c, w - width + 2, 33.5, 5, 8, '#ffdc47')
    c.fillStyle = '#fff5ce'; c.font = '700 15px ui-monospace, monospace'; c.textAlign = 'right'
    c.fillText(`× ${String(this.score).padStart(3, '0')}`, w - 28, 39)
    c.restore()
  }

  private drawDemoHands(c: CanvasRenderingContext2D, now: number, w: number, h: number, box: HitBox | undefined, reduced: boolean) {
    const t = ease((now - this.gesture.glovesAt!) / gloveAssemblyMs)
    const hitTime = reduced ? 900 : 4200
    const hitProgress = box && this.demoStart !== undefined ? now - this.demoStart - hitTime : -Infinity
    const reach = ease(1 - Math.abs(hitProgress) / 400)
    const size = Math.min(w / 12, h / 10)
    for (const side of [-1, 1]) {
      const x = w * (.5 + side * .31), y = h * .71 - (1 - t) * h
      const centerX = side === 1 && box ? mix(x, box.x + box.size / 2, reach) : x
      const centerY = side === 1 && box ? mix(y, box.y + box.size + size * 1.56, reach) : y
      const points: Vec3[] = [{ x: centerX, y: centerY + size * .8, z: 0 }]
      for (let finger = 0; finger < 5; finger++) {
        const angle = (-.88 + finger * .39) * side
        for (let joint = 0; joint < 4; joint++) {
          const reach = (.45 + joint * .38) * (finger === 0 ? .8 : finger === 4 ? .85 : 1)
          points.push({ x: centerX + Math.sin(angle) * size * reach,
            y: centerY - Math.cos(angle) * size * reach, z: 0 })
        }
      }
      glove(c, points)
    }
  }

  close() { this.reset(); this.sound.close() }
}
