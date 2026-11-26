import type { JellyState, Point } from './gesture'
import { advanceTreat } from './physics.ts'
import type { Treat } from './physics'
import { sprite } from './sprites.ts'
import type { SpriteKind } from './sprites'

const TAU = Math.PI * 2
const accents = ['#ff8edb', '#a58aff', '#7ccfff', '#8df7d5', '#ffe49b']
type Star = { x: number; y: number; size: number; phase: number; color: number }
type SpaceObject = Point & { vx: number; vy: number; angle: number; spin: number; size: number; art: HTMLCanvasElement }
type Dust = Point & { vx: number; vy: number; life: number; maxLife: number; size: number; color: number; star: boolean }

export class JellyUniverse {
  private readonly ctx: CanvasRenderingContext2D
  private readonly treatsArt = (['jelly', 'candy', 'gummy', 'blob'] as const).flatMap(kind => accents.map((_, i) => sprite(kind, i)))
  private readonly starArt = accents.map((_, i) => sprite('star', i))
  private readonly welcomePlanet = sprite('planet', 1)
  private readonly welcomeJelly = sprite('jelly', 0)
  private readonly welcomeCandy = sprite('candy', 2)
  private stars: Star[] = []
  private objects: SpaceObject[] = []
  private treats: Treat[] = []
  private dust: Dust[] = []
  private state: JellyState | undefined
  private lastTime = 0
  private width = 0
  private height = 0
  private pixel = 3
  private scale = 0
  private velocity = 0
  private closing = false
  private pulse = 0
  private popAge = 10
  private pending = 0
  private emissionTime = 0
  private center = { x: 0, y: 0, radiusX: 0, radiusY: 0 }
  private readonly onPop: () => void
  private readonly motionQuery = matchMedia('(prefers-reduced-motion: reduce)')
  live = false
  markers = true

  constructor(canvas: HTMLCanvasElement, onPop: () => void) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('이 브라우저에서 캔버스를 준비하지 못했어요.')
    this.ctx = ctx; this.onPop = onPop
    this.resize()
  }

  resize() {
    this.width = innerWidth; this.height = innerHeight
    this.pixel = this.width < 760 ? 2 : 3
    this.ctx.canvas.width = Math.ceil(this.width / this.pixel)
    this.ctx.canvas.height = Math.ceil(this.height / this.pixel)
    this.ctx.setTransform(1 / this.pixel, 0, 0, 1 / this.pixel, 0, 0)
    this.ctx.imageSmoothingEnabled = false
    this.stars = Array.from({ length: this.width < 760 ? 85 : 145 }, () => ({
      x: Math.random() * this.width, y: Math.random() * this.height,
      size: Math.random() < .8 ? this.pixel : this.pixel * 2, phase: Math.random() * TAU, color: Math.floor(Math.random() * 5),
    }))
    const kinds: SpriteKind[] = ['planet', 'ufo', 'star', 'moon', 'candy', 'star', 'planet', 'jelly']
    this.objects = Array.from({ length: this.width < 760 ? 16 : 24 }, (_, i) => ({
      x: Math.random() * this.width, y: Math.random() * this.height,
      vx: (Math.random() - .5) * 13, vy: (Math.random() - .5) * 12,
      angle: Math.random() * TAU, spin: (Math.random() - .5) * .35,
      size: 14 + Math.random() * 19, art: sprite(kinds[i % kinds.length]!, i % 5),
    }))
    this.reset()
  }

  reset() {
    this.state = undefined; this.scale = this.velocity = this.pulse = 0
    this.closing = false; this.pending = 0; this.treats.length = this.dust.length = 0
    this.lastTime = 0; this.popAge = 10
  }

  setState(state: JellyState, now: number) {
    this.state = state
    if (state.active) {
      this.center = { x: state.x, y: state.y, radiusX: state.radiusX, radiusY: state.radiusY }
      this.closing = false
    }
    if (state.opened) { this.pulse = .45; this.velocity += 1.5 }
    if (state.closed) { this.closing = true; this.pending = 0 }
    if (state.burst) {
      this.pending = this.motionQuery.matches ? 12 : 32
      this.emissionTime = now; this.pulse = 1
      this.velocity += 2.2
    }
  }

  private drawSprite(art: HTMLCanvasElement, x: number, y: number, size: number, angle = 0, squash = 0) {
    const ctx = this.ctx
    ctx.save(); ctx.translate(Math.round(x / this.pixel) * this.pixel, Math.round(y / this.pixel) * this.pixel)
    ctx.rotate(angle); ctx.scale(1 + squash, 1 - squash * .65)
    ctx.drawImage(art, -size / 2, -size / 2, size, size * art.height / art.width)
    ctx.restore()
  }

  private specks(x: number, y: number, count: number, force: number, stars = false) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU, speed = force * (.4 + Math.random() * .6)
      const life = .5 + Math.random() * .65
      this.dust.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        life, maxLife: life, size: 2 + Math.random() * 4, color: i % 5, star: stars && i % 3 === 0 })
    }
    if (this.dust.length > 200) this.dust.splice(0, this.dust.length - 200)
  }

  private emit() {
    if (this.treats.length >= 100) this.treats.shift()
    const size = 21 + Math.random() * 22
    const life = 5 + Math.random() * 4
    this.treats.push({ x: this.center.x + (Math.random() - .5) * this.center.radiusX * .6,
      y: this.center.y + this.center.radiusY * .1,
      vx: (Math.random() - .5) * 620, vy: -250 - Math.random() * 360,
      size, rotation: (Math.random() - .5) * .7, spin: (Math.random() - .5) * 5,
      life, maxLife: life, squash: -.22, bounces: 0, orbit: this.pending % 5 === 0,
      angle: Math.random() * TAU, sprite: Math.floor(Math.random() * this.treatsArt.length) })
    this.pending--
  }

  private space(dt: number, time: number) {
    const ctx = this.ctx, hole = this.center
    const reduced = this.motionQuery.matches
    const influence = this.state?.active && !reduced ? this.scale : 0
    const response = 1 - Math.exp(-dt * 3.5)
    for (const star of this.stars) {
      ctx.globalAlpha = .2 + (Math.sin(time * .65 + star.phase) + 1) * .23
      ctx.fillStyle = accents[star.color]!
      const x = Math.round(star.x / this.pixel) * this.pixel, y = Math.round(star.y / this.pixel) * this.pixel
      ctx.fillRect(x, y, star.size, star.size)
      if (star.size > this.pixel) { ctx.globalAlpha *= .35; ctx.fillRect(x - this.pixel, y + this.pixel, star.size * 2, this.pixel) }
    }
    ctx.globalAlpha = 1
    for (const object of this.objects) {
      const dx = object.x - hole.x, dy = object.y - hole.y, distance = Math.hypot(dx, dy) || 1
      if (influence && distance < hole.radiusX * 4 + 160) {
        // A strictly inward radial component avoids a stable orbit that would
        // leave ambient objects circling forever without being swallowed.
        const pull = influence * Math.min(1, (hole.radiusX * 2 + 100) / distance)
        const inward = (80 + hole.radiusX * .4) * pull, tangent = (90 + hole.radiusX * .65) * pull
        object.vx += ((-dx * inward - dy * tangent) / distance - object.vx) * response
        object.vy += ((-dy * inward + dx * tangent) / distance - object.vy) * response
        if (Math.hypot(dx / Math.max(1, hole.radiusX), dy / Math.max(1, hole.radiusY)) < .85) {
          this.specks(object.x, object.y, 3, 24)
          const angle = Math.random() * TAU
          object.x = hole.x + Math.cos(angle) * (Math.max(this.width, this.height) * .65)
          object.y = hole.y + Math.sin(angle) * (Math.max(this.width, this.height) * .65)
          object.vx = -Math.cos(angle) * 12; object.vy = -Math.sin(angle) * 12
          continue
        }
        ctx.globalAlpha = .13; ctx.fillStyle = '#b19aff'
        for (let i = 1; i <= 4; i++) ctx.fillRect(object.x - object.vx * i * .023, object.y - object.vy * i * .023, this.pixel, this.pixel)
      } else {
        object.vx += ((Math.sin(time * .2 + object.size) * 8) - object.vx) * dt * .35
        object.vy += ((Math.cos(time * .17 + object.size) * 6) - object.vy) * dt * .35
      }
      if (!reduced) { object.x += object.vx * dt; object.y += object.vy * dt; object.angle += object.spin * dt }
      const margin = 80
      if (object.x < -margin) object.x = this.width + margin
      if (object.x > this.width + margin) object.x = -margin
      if (object.y < -margin) object.y = this.height + margin
      if (object.y > this.height + margin) object.y = -margin
      ctx.globalAlpha = this.live ? .72 : .52
      this.drawSprite(object.art, object.x, object.y, object.size, object.angle)
    }
    ctx.globalAlpha = 1
  }

  // Each row is a full pixel: the rim undulates like jelly while keeping a
  // crisp dot silhouette. Nested bands supply glow without per-frame blur.
  private blob(rx: number, ry: number, color: string, time: number, wobble: number) {
    const ctx = this.ctx, p = this.pixel
    ctx.fillStyle = color
    const rows = Math.ceil(ry / p)
    for (let y = -rows; y <= rows; y++) {
      const v = y * p / ry
      if (Math.abs(v) > 1) continue
      const edge = Math.sqrt(1 - v * v) * rx
      const wave = wobble * (Math.sin(v * 5 + time * 2.6) + Math.sin(v * 9 - time * 1.8) * .42)
      const left = Math.round((-edge + wave) / p) * p
      const right = Math.round((edge + wave * .6) / p) * p
      ctx.fillRect(left, y * p, Math.max(p, right - left), p)
    }
  }

  private portal(time: number) {
    if (this.scale < .012) return
    const ctx = this.ctx, hole = this.center
    const motion = this.motionQuery.matches ? 0 : 1
    const rx = Math.max(this.pixel, hole.radiusX * this.scale)
    const ry = Math.max(this.pixel, hole.radiusY * this.scale)
    const stretch = 1 + Math.sin(time * 3.1) * .025 * motion + this.pulse * .055
    const wobble = Math.min(rx, ry) * (.035 + this.pulse * .045) * motion
    ctx.save(); ctx.translate(hole.x, hole.y); ctx.scale(stretch, 1 / stretch)
    this.blob(rx * 1.21, ry * 1.22, '#6741be14', time, wobble)
    this.blob(rx * 1.12, ry * 1.12, '#8657e32a', time, wobble)
    this.blob(rx * 1.04, ry * 1.05, '#6541ac', time, wobble)
    this.blob(rx, ry, '#b28bff', time, wobble)
    this.blob(rx - this.pixel * 2, ry - this.pixel * 2, '#ff98d9', time, wobble)
    this.blob(Math.max(2, rx - this.pixel * 4), Math.max(2, ry - this.pixel * 4), '#5d398d', time, wobble)
    this.blob(Math.max(1, rx - this.pixel * 5), Math.max(1, ry - this.pixel * 5), '#080616', time, wobble)
    // Tiny inward spirals live inside the portal, distinct from outside dust.
    for (let i = 0; i < 32; i++) {
      const travel = (i / 32 + time * .11 * motion) % 1
      const angle = i * 2.4 + time * .7 * motion - travel * 3.4
      ctx.globalAlpha = Math.min(1, travel * 3) * .55
      ctx.fillStyle = accents[i % 5]!
      ctx.fillRect(Math.cos(angle) * rx * travel * .75, Math.sin(angle) * ry * travel * .72, this.pixel, this.pixel)
    }
    ctx.globalAlpha = 1
    // A broken candy-colored orbit keeps the silhouette playful, not realistic.
    for (let i = 0; i < 76; i++) {
      if (i % 12 > 8) continue
      const angle = i / 76 * TAU + time * .32 * motion
      const x = Math.cos(angle) * rx * 1.18, y = Math.sin(angle) * ry * .36 + Math.cos(angle) * ry * .18
      if (Math.sin(angle) < 0) continue
      ctx.globalAlpha = .8; ctx.fillStyle = accents[Math.floor(i / 15) % 5]!
      ctx.fillRect(Math.round(x / this.pixel) * this.pixel, Math.round(y / this.pixel) * this.pixel, this.pixel * 2, this.pixel)
    }
    ctx.restore(); ctx.globalAlpha = 1
  }

  private welcome(time: number) {
    if (this.live) return
    const mobile = this.width < 760
    const x = this.width * (mobile ? .69 : .74), y = this.height * (mobile ? .22 : .46)
    const size = Math.min(this.width * (mobile ? .22 : .17), 210)
    const bob = this.motionQuery.matches ? 0 : Math.sin(time * .8) * 9
    const ctx = this.ctx
    ctx.save(); ctx.translate(x, y + bob); ctx.rotate(-.22)
    ctx.fillStyle = '#8e6dff0c'; ctx.fillRect(-size, -size * .8, size * 2, size * 1.6)
    this.drawSprite(this.welcomePlanet, 0, 0, size)
    for (let i = 0; i < 52; i++) {
      const angle = i / 52 * TAU
      if (Math.sin(angle) < -.2) continue
      ctx.fillStyle = i % 5 === 0 ? '#ffb5e1' : '#9b84da'
      ctx.fillRect(Math.cos(angle) * size * .72, Math.sin(angle) * size * .18, this.pixel * 2, this.pixel * 2)
    }
    ctx.restore()
    this.drawSprite(this.welcomeJelly, x - size * .8, y + size * .6 + bob, size * .32, -.15)
    this.drawSprite(this.welcomeCandy, x + size * .7, y - size * .65 - bob, size * .3, .3)
    this.drawSprite(this.starArt[4]!, x - size * .8, y - size * .6, size * .16)
  }

  private hands(time: number) {
    if (!this.live || !this.markers || !this.state) return
    const ctx = this.ctx
    for (const hand of this.state.hands) {
      const color = hand.role === 'lower-left' ? '#a9b7ff' : hand.role === 'upper-right' ? '#ffacd9' : '#c6b3e0'
      ctx.lineCap = 'square'; ctx.lineJoin = 'miter'
      ctx.strokeStyle = hand.valid ? color : '#bdb1dc70'; ctx.lineWidth = this.pixel
      for (const chain of [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [5, 9, 13, 17, 0]]) {
        ctx.beginPath()
        chain.forEach((index, i) => { const point = hand.points[index]!; if (i) ctx.lineTo(point.x, point.y); else ctx.moveTo(point.x, point.y) })
        ctx.stroke()
      }
      if (hand.valid) {
        ctx.lineWidth = this.pixel * 2; ctx.strokeStyle = color
        ctx.beginPath(); ctx.moveTo(hand.index.x, hand.index.y); ctx.lineTo(hand.corner.x, hand.corner.y)
        ctx.lineTo(hand.thumb.x, hand.thumb.y); ctx.stroke()
      }
      for (const index of [4, 8]) {
        const p = hand.points[index]!
        ctx.fillStyle = color; ctx.fillRect(p.x - this.pixel * 1.5, p.y - this.pixel * 1.5, this.pixel * 3, this.pixel * 3)
      }
      if (hand.valid && !this.state.active) {
        const blink = .4 + (Math.sin(time * 4) + 1) * .2
        ctx.globalAlpha = blink; ctx.fillStyle = color
        ctx.fillRect(hand.corner.x - 5, hand.corner.y - 5, 10, 10); ctx.globalAlpha = 1
      }
    }
  }

  draw(now: number) {
    const dt = Math.min(this.lastTime ? (now - this.lastTime) / 1000 : 1 / 60, .05)
    this.lastTime = now
    const time = now / 1000, ctx = this.ctx
    const target = this.state?.active ? 1 : 0
    let remaining = dt
    while (remaining > .000001) {
      const step = Math.min(remaining, 1 / 120); remaining -= step
      this.velocity += ((target - this.scale) * 135 - this.velocity * 15) * step
      this.scale = Math.max(0, Math.min(1.25, this.scale + this.velocity * step))
    }
    if (this.closing && this.scale < .11) {
      this.closing = false; this.scale = this.velocity = 0
      this.specks(this.center.x, this.center.y, this.motionQuery.matches ? 12 : 32, 190, true)
      this.popAge = 0; this.onPop()
    }
    while (this.pending > 0 && now >= this.emissionTime) {
      this.emit(); this.emissionTime += this.motionQuery.matches ? 30 : 13
    }
    ctx.clearRect(0, 0, this.width, this.height)
    this.space(dt, time); this.welcome(time); this.portal(time)
    let count = 0
    for (const body of this.treats) {
      advanceTreat(body, dt, this.width, this.height, this.state?.active ? this.center : undefined)
      if (body.life <= 0 || body.y > this.height + body.size * 2) continue
      this.treats[count++] = body
      ctx.globalAlpha = Math.min(1, body.life / .7)
      this.drawSprite(this.treatsArt[body.sprite]!, body.x, body.y, body.size, body.rotation, body.squash)
    }
    this.treats.length = count; ctx.globalAlpha = 1
    count = 0
    const dustDrag = Math.exp(-dt * 1.8)
    for (const particle of this.dust) {
      particle.life -= dt
      if (particle.life <= 0) continue
      this.dust[count++] = particle
      particle.x += particle.vx * dt; particle.y += particle.vy * dt
      particle.vx *= dustDrag; particle.vy *= dustDrag
      ctx.globalAlpha = particle.life / particle.maxLife
      if (particle.star) this.drawSprite(this.starArt[particle.color]!, particle.x, particle.y, particle.size * 3)
      else { ctx.fillStyle = accents[particle.color]!; ctx.fillRect(particle.x, particle.y, particle.size, particle.size) }
    }
    this.dust.length = count
    this.popAge += dt
    if (this.popAge < .55) {
      ctx.globalAlpha = 1 - this.popAge / .55; ctx.fillStyle = '#ffd1ed'
      ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center'
      ctx.fillText('POP!', this.center.x, this.center.y - this.popAge * 45)
    }
    ctx.globalAlpha = 1; this.hands(time)
    this.pulse *= Math.exp(-dt * 6)
  }
}
