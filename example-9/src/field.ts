import type { GestureState, Spell, Vec2 } from './gestures'

const TAU = Math.PI * 2
const BONES = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [5, 9, 10, 11, 12], [9, 13, 14, 15, 16], [13, 17, 18, 19, 20], [17, 0]]
const AMBIENT = Array.from({ length: 38 }, (_, i) => ({
  x: (Math.sin(i * 127.1) * 43758.5453 % 1 + 1) % 1, y: i * 73.7, speed: 3 + i % 4,
}))
type Flight = Spell & { birth: number }
type Spark = Vec2 & { vx: number; vy: number; life: number; maxLife: number; size: number }

function makeSigil(layer: number) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1024
  const ctx = canvas.getContext('2d')!
  ctx.translate(512, 512); ctx.scale(460, 460)
  ctx.strokeStyle = '#ffffc2'; ctx.fillStyle = '#ffffe7'
  ctx.lineWidth = 1.8 / 460; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  ctx.shadowColor = '#daff42'; ctx.shadowBlur = 20
  const circle = (r: number) => { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke() }
  const polygon = (count: number, r: number, offset = 0) => {
    ctx.beginPath()
    for (let i = 0; i <= count; i++) {
      const angle = i / count * TAU + offset
      if (!i) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r)
      else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r)
    }
    ctx.stroke()
  }
  if (layer === 0) {
    circle(.96); circle(.945); circle(.77); circle(.755)
    for (let i = 0; i < 120; i++) {
      const a = i / 120 * TAU, inner = i % 5 ? .972 : .965, outer = i % 5 ? .984 : 1.01
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner)
      ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer); ctx.stroke()
    }
    // Original geometric rune alphabet; no font or image dependency.
    for (let i = 0; i < 28; i++) {
      ctx.save(); ctx.rotate(i / 28 * TAU); ctx.translate(0, -.855); ctx.scale(.045, .045)
      ctx.lineWidth = .065
      ctx.beginPath(); ctx.moveTo(0, -1); ctx.lineTo(0, 1)
      ctx.moveTo(-.55, -.45); ctx.lineTo(0, -.85); ctx.lineTo(.55, -.45)
      if (i % 3 === 0) { ctx.moveTo(-.6, .2); ctx.lineTo(.6, .2) }
      if (i % 3 === 1) { ctx.moveTo(0, -.1); ctx.lineTo(.6, .3); ctx.lineTo(0, .7) }
      if (i % 3 === 2) { ctx.moveTo(-.5, .65); ctx.lineTo(.5, -.1) }
      ctx.stroke(); ctx.restore()
    }
    for (let i = 0; i < 8; i++) {
      ctx.save(); ctx.rotate(i / 8 * TAU)
      ctx.beginPath(); ctx.moveTo(0, -1.07); ctx.lineTo(.018, -1.02); ctx.lineTo(0, -.99); ctx.lineTo(-.018, -1.02); ctx.closePath(); ctx.fill()
      ctx.restore()
    }
  } else if (layer === 1) {
    circle(.72); circle(.70); circle(.42)
    polygon(3, .70, -Math.PI / 2); polygon(3, .70, Math.PI / 2)
    polygon(6, .52)
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU
      ctx.beginPath(); ctx.arc(Math.cos(a) * .59, Math.sin(a) * .59, .036, 0, TAU); ctx.stroke()
      ctx.beginPath(); ctx.arc(0, 0, .64, a + .03, a + .33); ctx.stroke()
    }
  } else {
    circle(.37); circle(.34); circle(.22)
    polygon(4, .32, Math.PI / 4); polygon(4, .32)
    for (let i = 0; i < 8; i++) {
      ctx.save(); ctx.rotate(i / 8 * TAU)
      ctx.beginPath(); ctx.ellipse(0, -.12, .052, .17, 0, 0, TAU); ctx.stroke(); ctx.restore()
    }
    circle(.045)
    ctx.beginPath(); ctx.moveTo(-.08, 0); ctx.lineTo(.08, 0); ctx.moveTo(0, -.08); ctx.lineTo(0, .08); ctx.stroke()
  }
  return canvas
}

function makeBloom(core: HTMLCanvasElement) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 512
  const ctx = canvas.getContext('2d')!
  ctx.filter = 'blur(6px)'
  ctx.drawImage(core, 0, 0, 512, 512)
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = '#dfff38'; ctx.fillRect(0, 0, 512, 512)
  return canvas
}

export class SpellField {
  private readonly ctx: CanvasRenderingContext2D
  private readonly layers = [0, 1, 2].map(index => { const core = makeSigil(index); return { core, bloom: makeBloom(core) } })
  private state: GestureState | undefined
  private flights: Flight[] = []
  private sparks: Spark[] = []
  private lastTime = 0
  private opacity = 0
  private burst = 0
  private resonance = 0
  private empty = false
  live = false
  markers = true
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
    this.resize()
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2)
    this.ctx.canvas.width = Math.round(innerWidth * dpr)
    this.ctx.canvas.height = Math.round(innerHeight * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.empty = false
  }

  setState(state: GestureState, now: number) {
    this.state = state
    if (state.launch) {
      this.flights.push({ ...state.launch, birth: now })
      this.burst = 1
      for (let i = 0; i < 110; i++) {
        const angle = Math.random() * TAU, velocity = 70 + Math.random() * 350
        this.sparks.push({ x: state.x + Math.cos(angle) * state.radius * .75,
          y: state.y + Math.sin(angle) * state.radius * .75,
          vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity,
          life: .6 + Math.random(), maxLife: 1.6, size: .7 + Math.random() * 1.6 })
      }
    }
  }

  clear() { this.state = undefined; this.flights.length = 0; this.sparks.length = 0; this.opacity = 0; this.burst = 0; this.resonance = 0; this.lastTime = 0 }

  private sigil(x: number, y: number, radius: number, time: number, opacity: number, charge: number, tilt = 1, resonance = 0) {
    if (radius < 1 || opacity < .005) return
    const ctx = this.ctx
    const motion = this.reducedMotion ? 0 : resonance
    const amplitude = motion * Math.min(8, 2.5 + radius * .012)
    const shakeX = (Math.sin(time * TAU * 21) + Math.sin(time * TAU * 31) * .3) * amplitude
    const shakeY = (Math.sin(time * TAU * 18 + .6) + Math.cos(time * TAU * 27) * .3) * amplitude
    const pulse = 1 + Math.sin(time * TAU * 7) * motion * .018
    ctx.save(); ctx.translate(x + shakeX, y + shakeY)
    ctx.rotate(Math.sin(time * TAU * 17) * motion * .008)
    ctx.scale(pulse, tilt / pulse); ctx.globalAlpha = opacity
    const glow = ctx.createRadialGradient(0, 0, radius * .1, 0, 0, radius * 1.25)
    glow.addColorStop(0, `rgba(245,255,128,${.025 + charge * .025})`)
    glow.addColorStop(.65, `rgba(218,255,56,${.08 + charge * .04 + resonance * .06})`)
    glow.addColorStop(1, 'rgba(218,255,56,0)')
    ctx.fillStyle = glow; ctx.fillRect(-radius * 1.3, -radius * 1.3, radius * 2.6, radius * 2.6)
    this.layers.forEach((layer, index) => {
      ctx.save()
      ctx.rotate(this.reducedMotion ? index * .3 : time * [ .055, -.095, .13 ][index]! + Math.sin(time * 95 + index * 2) * motion * .014)
      const size = radius * 1024 / 460
      // Broad cached bloom plus a white-hot core keeps lines sharp while
      // spreading fluorescent light beyond them, including on the webcam.
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = opacity * (.8 + resonance * .5)
      ctx.drawImage(layer.bloom, -size / 2, -size / 2, size, size)
      ctx.globalAlpha = opacity
      ctx.drawImage(layer.core, -size / 2, -size / 2, size, size)
      ctx.restore()
    })
    // Charged energy travels around the circumference, following both hands.
    ctx.strokeStyle = '#ffffdb'; ctx.lineWidth = 2 + charge + resonance
    ctx.shadowColor = '#d6ff38'; ctx.shadowBlur = 24 + resonance * 12
    for (let i = 0; i < 3; i++) {
      const a = (this.reducedMotion ? 0 : time * .6) + i * TAU / 3
      ctx.beginPath(); ctx.arc(0, 0, radius * 1.025, a, a + .17 + charge * .30); ctx.stroke()
    }
    if (resonance > .03 && !this.reducedMotion) {
      ctx.strokeStyle = '#e4ff73'; ctx.lineWidth = 1 + resonance
      for (let i = 0; i < 3; i++) {
        const phase = (time * .9 + i / 3) % 1
        ctx.globalAlpha = opacity * resonance * (1 - phase) * .45
        ctx.beginPath(); ctx.arc(0, 0, radius * (1.025 + phase * .13), 0, TAU); ctx.stroke()
      }
    }
    ctx.restore()
  }

  draw(now: number) {
    const ctx = this.ctx, width = innerWidth, height = innerHeight
    const dt = Math.min(this.lastTime ? (now - this.lastTime) / 1000 : 1 / 60, .05)
    this.lastTime = now
    if (this.live && !this.state?.visible && this.opacity <= .005 && this.burst <= .01
      && !this.flights.length && !this.sparks.length && (!this.markers || !this.state?.palms.length)) {
      if (!this.empty) ctx.clearRect(0, 0, width, height)
      this.opacity += -this.opacity * (1 - Math.exp(-dt * 9))
      this.resonance += -this.resonance * (1 - Math.exp(-dt * 14))
      this.burst *= Math.exp(-dt * 9)
      this.empty = true
      return
    }
    this.empty = false
    const time = now / 1000
    ctx.clearRect(0, 0, width, height)
    ctx.globalCompositeOperation = 'screen'
    if (!this.live) {
      const mobile = width < 760
      this.sigil(width * (mobile ? .5 : .70), height * (mobile ? .28 : .46), Math.min(width * .25, height * .29), time, .82, .4, .96)
      for (let i = 0; i < 38; i++) {
        const mote = AMBIENT[i]!
        const x = mote.x * width
        const y = (mote.y + (this.reducedMotion ? 0 : time * mote.speed)) % height
        ctx.globalAlpha = .1 + (Math.sin(time * .7 + i) + 1) * .12
        ctx.fillStyle = '#d9ef9f'; ctx.fillRect(x, height - y, 1, 1)
      }
    }
    const targetOpacity = this.live && this.state?.visible ? 1 : 0
    this.opacity += (targetOpacity - this.opacity) * (1 - Math.exp(-dt * 9))
    const energy = this.live && this.state?.visible ? this.state.resonance || 0 : 0
    this.resonance += (energy - this.resonance) * (1 - Math.exp(-dt * 14))
    if (this.state && this.opacity > .005) {
      const state = this.state
      this.sigil(state.x, state.y, Math.min(state.radius, Math.max(width, height)), time, this.opacity, state.charge, 1, this.resonance)
      if (state.visible && !this.reducedMotion && Math.random() < .45 + this.resonance * .5) {
        const a = Math.random() * TAU
        this.sparks.push({ x: state.x + Math.cos(a) * state.radius, y: state.y + Math.sin(a) * state.radius,
          vx: Math.cos(a) * (10 + this.resonance * 45), vy: -15 - Math.random() * (25 + this.resonance * 40), life: .8, maxLife: .8, size: 1 + this.resonance })
      }
    }

    // Forward projection: expanding, recedingly spaced copies form a tunnel
    // from the palms toward the viewer, then pass outside the viewport.
    let flightCount = 0
    for (const flight of this.flights) if (now - flight.birth < 1450) this.flights[flightCount++] = flight
    this.flights.length = flightCount
    for (const flight of this.flights) {
      const age = (now - flight.birth) / 1450
      for (let i = 5; i >= 0; i--) {
        const travel = Math.max(0, age - i * .055)
        if (!travel) continue
        const scale = this.reducedMotion ? 1 + travel * .3 : 1 / Math.max(.09, 1 - travel * 1.28)
        const alpha = Math.pow(1 - age, .75) * (1 - i * .115) * .8
        this.sigil(flight.x + (flight.x - width / 2) * (scale - 1) * .15,
          flight.y + (flight.y - height / 2) * (scale - 1) * .15,
          flight.radius * scale, time + i * .2, alpha, 1)
      }
    }

    ctx.shadowBlur = 0; ctx.fillStyle = '#f4ffae'
    let sparkCount = 0
    for (const spark of this.sparks) if (spark.life > 0) this.sparks[sparkCount++] = spark
    const firstSpark = Math.max(0, sparkCount - 240)
    if (firstSpark) this.sparks.copyWithin(0, firstSpark, sparkCount)
    this.sparks.length = Math.min(sparkCount, 240)
    for (const spark of this.sparks) {
      spark.life -= dt
      spark.x += spark.vx * dt; spark.y += spark.vy * dt; spark.vy += 15 * dt
      ctx.globalAlpha = Math.max(0, spark.life / spark.maxLife)
      ctx.fillRect(spark.x, spark.y, spark.size, spark.size)
    }
    this.burst *= Math.exp(-dt * 9)
    if (this.burst > .01 && !this.reducedMotion) {
      ctx.globalAlpha = this.burst * .09; ctx.fillStyle = '#ffcd78'; ctx.fillRect(0, 0, width, height)
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'

    if (this.live && this.markers && this.state) for (const palm of this.state.palms) {
      ctx.lineWidth = .8; ctx.strokeStyle = '#ffe2af50'
      BONES.forEach(bone => {
        ctx.beginPath()
        bone.forEach((index, n) => { const p = palm.points[index]!; if (n) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y) })
        ctx.stroke()
      })
      for (const index of [4, 8, 12, 16, 20]) {
        const p = palm.points[index]!
        ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, TAU); ctx.fillStyle = '#fff0c5'; ctx.fill()
      }
      ctx.beginPath(); ctx.arc(palm.center.x, palm.center.y, 8, 0, TAU)
      ctx.strokeStyle = '#ffe2afb0'; ctx.stroke()
      ctx.beginPath(); ctx.moveTo(palm.center.x, palm.center.y)
      ctx.lineTo(palm.center.x + palm.normal.x * 28, palm.center.y + palm.normal.y * 28); ctx.stroke()
    }
  }
}
