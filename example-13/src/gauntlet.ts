import { partMotion } from './animation.ts'
import { clamp, mix } from './geometry.ts'
import type { Point, Vec3 } from './geometry.ts'
import { gauntletAssemblyMs } from './handGesture.ts'
import type { HandGesture, HandPose } from './handGesture.ts'
import { gauntletShell } from './gauntletGeometry.ts'
import type { GauntletShell } from './gauntletGeometry.ts'

type Project = (point: Vec3) => Vec3
type Location = { x: number; y: number }
type Place = ([x, y]: Point) => Location
type Alloy = 'red' | 'gold' | 'steel' | 'joint'
type Lane = 'top' | 'bottom' | 'left' | 'right'
type Pulse = { born: number; origin: Location; vx: number; vy: number; size: number }

const metal: Record<Alloy, readonly string[]> = {
  red: ['#581522', '#d16a60', '#9a2637', '#500e20', '#a03b49'],
  gold: ['#876038', '#ffe3a8', '#d9a35d', '#906131', '#e7bc78'],
  steel: ['#222a34', '#98a7b0', '#475362', '#202832', '#5b6876'],
  joint: ['#08090d', '#31333c', '#17171d', '#08090c', '#202229'],
}

const digits = [
  { root: 1, color: 'gold', lane: 'right', delay: 180 },
  { root: 5, color: 'gold', lane: 'right', delay: 60 },
  { root: 9, color: 'red', lane: 'top', delay: 0 },
  { root: 13, color: 'red', lane: 'top', delay: 45 },
  { root: 17, color: 'red', lane: 'left', delay: 105 },
] as const

function drawOpaqueShell(c: CanvasRenderingContext2D, shell: GauntletShell) {
  c.save()
  c.globalAlpha = 1
  c.lineCap = c.lineJoin = 'round'
  c.beginPath()
  shell.palm.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))
  c.closePath()
  const minY = Math.min(...shell.palm.map(p => p.y)), maxY = Math.max(...shell.palm.map(p => p.y))
  const palm = c.createLinearGradient(0, minY, 0, maxY)
  palm.addColorStop(0, '#45232c'); palm.addColorStop(.48, '#2b2530'); palm.addColorStop(1, '#161923')
  c.fillStyle = palm; c.strokeStyle = palm; c.lineWidth = shell.palmPadding * 2
  c.fill(); c.stroke()
  for (const finger of shell.fingers) {
    const start = finger.joints[0]!, tip = finger.joints[3]!
    const finish = c.createLinearGradient(start.center.x - start.radius, start.center.y,
      tip.center.x + tip.radius, tip.center.y)
    finish.addColorStop(0, '#24151d'); finish.addColorStop(.45, '#662b37'); finish.addColorStop(1, '#20232c')
    c.beginPath()
    for (let j = 0; j < 3; j++) {
      const a = finger.joints[j]!, b = finger.joints[j + 1]!
      const dx = b.center.x - a.center.x, dy = b.center.y - a.center.y, span = Math.hypot(dx, dy)
      if (span < .001) continue
      const nx = -dy / span, ny = dx / span
      c.moveTo(a.center.x - nx * a.radius, a.center.y - ny * a.radius)
      c.lineTo(b.center.x - nx * b.radius, b.center.y - ny * b.radius)
      c.lineTo(b.center.x + nx * b.radius, b.center.y + ny * b.radius)
      c.lineTo(a.center.x + nx * a.radius, a.center.y + ny * a.radius)
      c.closePath()
    }
    for (const [j, joint] of finger.joints.entries()) {
      const prior = finger.joints[Math.max(0, j - 1)]!.center
      const angle = j === 3 ? Math.atan2(joint.center.y - prior.y, joint.center.x - prior.x) : 0
      const axial = joint.capRadius ?? joint.radius
      c.moveTo(joint.center.x + Math.cos(angle) * axial, joint.center.y + Math.sin(angle) * axial)
      c.ellipse(joint.center.x, joint.center.y, axial, joint.radius, angle, 0, Math.PI * 2)
      c.closePath()
    }
    c.fillStyle = finish; c.fill()
    c.strokeStyle = '#1b141c'; c.lineWidth = Math.max(1, shell.size * .008); c.stroke()
  }
  c.restore()
}

function panel(c: CanvasRenderingContext2D, place: Place, corners: readonly Point[], finish: Alloy, shade = 1) {
  const points = corners.map(place)
  const first = points[0]!, opposite = points[Math.floor(points.length / 2)]!
  const paint = c.createLinearGradient(first.x, first.y, opposite.x, opposite.y)
  metal[finish].forEach((color, i) => paint.addColorStop(i / 4, color))
  c.save()
  c.globalAlpha *= shade
  c.beginPath()
  c.moveTo(first.x, first.y)
  for (const point of points.slice(1)) c.lineTo(point.x, point.y)
  c.closePath()
  c.fillStyle = paint; c.fill()
  c.strokeStyle = finish === 'gold' ? '#ffe3a47d' : finish === 'red' ? '#ec837461' : '#a3b3be41'
  c.lineWidth = .8; c.stroke()
  c.restore()
}

function disk(c: CanvasRenderingContext2D, place: Place, x: number, y: number, rx: number, ry: number, fill: string, line?: string) {
  c.beginPath()
  for (let i = 0; i <= 32; i++) {
    const angle = i * Math.PI / 16
    const p = place([x + Math.cos(angle) * rx, y + Math.sin(angle) * ry])
    if (i) c.lineTo(p.x, p.y)
    else c.moveTo(p.x, p.y)
  }
  c.closePath()
  c.fillStyle = fill; c.fill()
  if (line) { c.strokeStyle = line; c.lineWidth = 1; c.stroke() }
}

function drawHand(c: CanvasRenderingContext2D, pose: HandPose, project: Project, elapsed: number, width: number, height: number) {
  const points = pose.points.map(project)
  const outline = pose.outline ? { ...pose.outline,
    palm: pose.outline.palm.map(p => project({ ...p, z: pose.center.z })),
  } : undefined
  const shell = gauntletShell(points, outline)
  if (!shell) return
  const wrist = points[0]!, index = points[5]!, middle = points[9]!, ring = points[13]!, little = points[17]!
  const across = { x: index.x - little.x, y: index.y - little.y }
  const up = { x: (middle.x + ring.x) / 2 - wrist.x, y: (middle.y + ring.y) / 2 - wrist.y }
  const size = shell.size
  const center = { x: wrist.x + up.x * .49, y: wrist.y + up.y * .49 }
  const place: Place = ([x, y]) => ({ x: center.x + across.x * x + up.x * y, y: center.y + across.y * x + up.y * y })
  const locked = elapsed >= gauntletAssemblyMs
  if (locked) drawOpaqueShell(c, shell)

  function fly(anchor: Location, lane: Lane, delay: number, duration: number, draw: () => void) {
    const motion = partMotion(locked ? 'locked' : 'assembling', elapsed, delay, duration)
    if (!motion.visible) return
    const x = lane === 'left' ? -size : lane === 'right' ? width + size : anchor.x
    const y = lane === 'top' ? -size : lane === 'bottom' ? height + size : anchor.y
    const dx = (x - anchor.x) * (1 - motion.approach), dy = (y - anchor.y) * (1 - motion.approach)
    c.save()
    c.translate(dx, dy)
    if (motion.trail > .06) {
      c.strokeStyle = 'rgba(255,204,143,' + (motion.trail * .60) + ')'
      c.lineWidth = Math.max(1, size * .017)
      for (const offset of [-.10, .08]) {
        c.beginPath()
        c.moveTo(anchor.x + offset * size, anchor.y)
        c.lineTo(anchor.x + offset * size + (x - anchor.x) * .12 * motion.trail, anchor.y + (y - anchor.y) * .12 * motion.trail)
        c.stroke()
      }
    }
    c.translate(anchor.x, anchor.y)
    c.rotate((lane === 'left' || lane === 'bottom' ? -1 : 1) * (1 - motion.approach) * .38)
    const scale = .68 + .32 * clamp(motion.approach)
    c.scale(scale, scale)
    c.translate(-anchor.x, -anchor.y)
    draw()
    if (motion.latch > .2) {
      c.strokeStyle = 'rgba(255,229,170,' + (motion.latch * .75) + ')'
      c.lineWidth = Math.max(1, size * .011)
      for (let i = 0; i < 5; i++) {
        const angle = i * Math.PI * .4
        const r = size * (.12 + .2 * (1 - motion.latch))
        c.beginPath()
        c.moveTo(anchor.x + Math.cos(angle) * r, anchor.y + Math.sin(angle) * r)
        c.lineTo(anchor.x + Math.cos(angle) * r * 1.2, anchor.y + Math.sin(angle) * r * 1.2)
        c.stroke()
      }
    }
    c.restore()
  }

  fly(wrist, 'bottom', 55, 555, () => {
    panel(c, place, [[-.50,-.23],[-.50,-.60],[-.33,-.78],[.30,-.78],[.47,-.61],[.50,-.23]], 'joint')
    panel(c, place, [[-.49,-.40],[-.46,-.63],[-.31,-.75],[.26,-.75],[.43,-.64],[.47,-.40],[.28,-.52],[-.27,-.53]], 'red')
    panel(c, place, [[-.28,-.66],[-.21,-.75],[.22,-.75],[.32,-.64],[.16,-.68]], 'gold')
  })

  fly(center, 'bottom', 120, 570, () => {
    panel(c, place, [[-.59,.35],[-.32,.53],[.25,.57],[.57,.43],[.65,.17],[.56,-.31],[.35,-.53],[-.36,-.50],[-.56,-.27]], 'joint')
    panel(c, place, [[-.44,.30],[-.22,.41],[.22,.43],[.48,.29],[.50,-.30],[.27,-.51],[-.30,-.52],[-.48,-.32]], 'red')
    panel(c, place, [[-.14,-.22],[.14,-.22],[.23,-.44],[.14,-.54],[-.14,-.54],[-.23,-.46]], 'steel')
  })

  fly(little, 'left', 160, 510, () => {
    panel(c, place, [[-.57,.40],[-.29,.50],[-.08,.21],[-.25,.11],[-.57,.18]], 'red')
    panel(c, place, [[-.57,.14],[-.30,.12],[-.21,-.13],[-.35,-.38],[-.51,-.42],[-.57,-.25]], 'red')
    panel(c, place, [[-.53,-.38],[-.32,-.33],[-.21,-.16],[-.26,-.36],[-.38,-.45],[-.50,-.45]], 'gold')
  })

  fly(index, 'right', 190, 500, () => {
    panel(c, place, [[.11,.22],[.29,.51],[.53,.41],[.64,.25],[.54,.11],[.26,.12]], 'red')
    panel(c, place, [[.26,.09],[.57,.10],[.66,-.11],[.49,-.38],[.28,-.52],[.21,-.36],[.13,-.16]], 'gold')
    panel(c, place, [[.57,.01],[.66,-.10],[.58,-.22],[.43,-.15],[.43,-.05]], 'joint')
  })

  for (const digit of digits) {
    const base = points[digit.root]!
    const sleeve = shell.fingers.find(finger => finger.root === digit.root)!
    fly(base, digit.lane, digit.delay, 470, () => {
      for (let j = 0; j < 3; j++) {
        const a = points[digit.root + j]!, b = points[digit.root + j + 1]!
        const dx = b.x - a.x, dy = b.y - a.y, span = Math.hypot(dx, dy)
        if (span < .8) continue
        const w = (sleeve.joints[j]!.radius + sleeve.joints[j + 1]!.radius) * .99
        const placeDigit: Place = ([x, y]) => ({ x: a.x + dx * y - dy / span * x * w, y: a.y + dy * y + dx / span * x * w })
        panel(c, placeDigit, [[-.44,-.09],[.43,-.09],[.45,.86],[.30,1.06],[-.31,1.03],[-.43,.80]], 'joint')
        if (j === 2) {
          // Close the fingertip in the same material as its plate; the landmark is inside the cap, not its cut edge.
          disk(c, placeDigit, 0, 1.01, .49, (sleeve.joints[3]!.capRadius ?? w * .25) / span,
            digit.color === 'gold' ? '#d9a35d' : '#9a2637', '#39212a')
        }
        panel(c, placeDigit, [[-.49,.12],[-.30,.05],[.36,.07],[.49,.20],[.37,j === 2 ? 1.04 : .77],[.20,j === 2 ? 1.11 : .84],[-.31,j === 2 ? .99 : .79]], digit.color)
        panel(c, placeDigit, [[-.44,.18],[-.30,.13],[-.21,.20],[-.24,.70],[-.34,.76]], digit.color, .56)
        if (j < 2) disk(c, placeDigit, -.27, .90, .080, .055, '#a48f77')
      }
    })
  }

  const energized = locked && pose.normal.z < -.38
  fly(center, 'top', 295, 510, () => {
    if (pose.normal.z > .20) {
      panel(c, place, [[-.29,.23],[-.08,.36],[.22,.29],[.36,.10],[.20,-.26],[-.22,-.28],[-.37,-.12]], 'red')
      panel(c, place, [[-.18,.18],[.16,.20],[.23,.04],[.13,-.14],[-.13,-.18],[-.22,.02]], 'gold')
      return
    }
    panel(c, place, [[-.41,.22],[-.33,.25],[-.12,.09],[-.19,.02]], 'steel')
    panel(c, place, [[.12,.08],[.37,.19],[.41,.12],[.17,.00]], 'steel')
    panel(c, place, [[-.055,.19],[-.025,.42],[.08,.43],[.07,.17]], 'steel')
    disk(c, place, 0, 0, .28, .25, '#121922', '#cdb999')
    disk(c, place, 0, 0, .239, .214, '#586676', '#a7b3ba')
    disk(c, place, 0, 0, .198, .178, '#354451', '#bca784')
    disk(c, place, 0, 0, .157, .142, '#262e39', '#92a9b8')
    c.save()
    c.shadowColor = '#7eeaff'; c.shadowBlur = energized ? Math.min(24, size * .22) : 0
    disk(c, place, 0, 0, .108, .10, energized ? '#efffff' : '#5d7278', '#a0e6ef')
    c.restore()
  })
  return { center, size, energized }
}

export class GauntletEffects {
  private pulses: Pulse[] = []

  clear() { this.pulses = [] }

  draw(c: CanvasRenderingContext2D, hands: HandGesture, project: Project, now: number, width: number, height: number, reduced: boolean, imageTimestamp?: number) {
    for (const track of hands.active(now, imageTimestamp)) {
      if (track.mountedAt === undefined) continue
      const hand = drawHand(c, track.pose, project, now - track.mountedAt, width, height)
      if (!hand) continue
      const { center, size, energized } = hand
      if (!energized || now - (track.lastShot ?? -Infinity) < (reduced ? 650 : 230)) continue
      const normal = track.pose.normal
      // A palm aimed at the lens projects almost straight out. Add perspective
      // divergence so the pulse still travels on screen with a frontal palm.
      let vx = -normal.x * 1.9 + (center.x / width - .5) * 1.45
      let vy = normal.y * 1.9 + (center.y / height - .5) * 1.3 - .28
      if (Math.hypot(vx, vy) < .13) { vx += .12; vy -= .27 }
      const distance = Math.hypot(vx, vy), speed = Math.max(width, height) * 1.26
      this.pulses.push({ origin: center, born: now, vx: vx / distance * speed, vy: vy / distance * speed, size })
      track.lastShot = now
    }
    this.pulses = this.pulses.filter(pulse => now - pulse.born < 980)
    for (const pulse of this.pulses) {
      const dt = (now - pulse.born) / 1000
      const x = pulse.origin.x + pulse.vx * dt, y = pulse.origin.y + pulse.vy * dt
      const radius = clamp(pulse.size * mix(.073, .15, dt), 3, 23)
      const trail = Math.min(dt, reduced ? .020 : .096)
      const tx = x - pulse.vx * trail, ty = y - pulse.vy * trail
      if (x < -180 || y < -180 || x > width + 180 || y > height + 180) continue
      c.save()
      c.globalAlpha = clamp((.98 - dt) * 3) * (reduced ? .75 : 1)
      const gradient = c.createLinearGradient(tx, ty, x, y)
      gradient.addColorStop(0, '#42cfff00'); gradient.addColorStop(.75, '#49cfff'); gradient.addColorStop(1, '#f1ffff')
      c.lineCap = 'round'
      c.shadowColor = '#13aefa'; c.shadowBlur = reduced ? 6 : 22
      c.beginPath(); c.moveTo(tx, ty); c.lineTo(x, y)
      c.lineWidth = radius * 2; c.strokeStyle = gradient; c.stroke()
      c.beginPath(); c.arc(x, y, radius * .63, 0, Math.PI * 2)
      c.fillStyle = '#f0ffff'; c.fill()
      c.restore()
    }
  }
}
