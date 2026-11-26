import { clamp, ease } from './geometry.ts'
import type { Vec3 } from './geometry.ts'
import type { BodyFit } from './conanFit.ts'

const yellow = ['#fff187', '#ecc336', '#d49a15', '#805113'] as const
const night = ['#0b3460', '#145681', '#37417f', '#624082', '#3a4d89', '#145d80'] as const
const light = ['#348ab9', '#60acd2', '#787ec5', '#aa6cb5', '#7e80c2', '#469fc3'] as const

function polygon(c: CanvasRenderingContext2D, points: readonly { x: number; y: number }[]) {
  c.beginPath()
  for (const [i, p] of points.entries()) {
    if (i === 0) c.moveTo(p.x, p.y)
    else c.lineTo(p.x, p.y)
  }
  c.closePath()
}

function stitch(c: CanvasRenderingContext2D, points: Vec3[], color: string, width: number) {
  c.beginPath(); c.moveTo(points[0]!.x, points[0]!.y)
  for (const p of points.slice(1)) c.lineTo(p.x, p.y)
  c.strokeStyle = color; c.lineWidth = width; c.stroke()
}

export function drawRaincoat(c: CanvasRenderingContext2D, body: BodyFit, alpha: number) {
  const { width, left, right } = body
  const lacquer = c.createLinearGradient(left.x, left.y, right.x, right.y + width * .12)
  yellow.forEach((color, i) => lacquer.addColorStop([0, .27, .68, 1][i]!, color))
  const sleevePaint = c.createLinearGradient(left.x, left.y, right.x, right.y)
  sleevePaint.addColorStop(0, '#b67908'); sleevePaint.addColorStop(.46, '#fbdc54'); sleevePaint.addColorStop(1, '#cd9e19')
  const softEdge = Math.max(.9, width * .008)
  c.save(); c.globalAlpha *= alpha; c.lineJoin = c.lineCap = 'round'
  const sleeve = ({ visible, outline, cuff }: BodyFit['arms'][number]) => {
    if (!visible) return
    polygon(c, outline)
    c.fillStyle = sleevePaint; c.fill()
    c.strokeStyle = '#85530f'; c.lineWidth = softEdge; c.stroke()
    if (cuff.length === 2) stitch(c, cuff, '#ffe987', softEdge * 2.6)
  }
  body.arms.filter(arm => !arm.front).forEach(sleeve)
  polygon(c, body.outline)
  c.fillStyle = lacquer; c.fill(); c.strokeStyle = '#926016'; c.lineWidth = softEdge; c.stroke()
  c.save(); c.clip()
  const fold = (side: number) => [body.at(side * .79, .07), body.at(side * .52, .43), body.at(side * .62, .97)]
  stitch(c, fold(-1), '#8152115e', softEdge)
  stitch(c, fold(1), '#fff09573', softEdge)
  stitch(c, [body.at(0, -.19), body.at(.01, .30), body.at(.025, 1.09)], '#a77214', softEdge * 2.5)
  stitch(c, [body.at(-.023, -.19), body.at(-.013, .30), body.at(.002, 1.09)], '#fff088', softEdge)
  for (const side of [-1, 1]) {
    const flap = [[.33, .60], [.77, .55], [.74, .72], [.37, .77]].map(([x, y]) => body.at(side * x!, y!))
    polygon(c, flap); c.fillStyle = '#c99519a8'; c.fill()
    stitch(c, flap.slice(0, 2), '#ffe487', softEdge)
  }
  c.restore()
  const collar = [[-.55, .02], [-.43, .42], [0, .65], [.44, .38], [.55, .02]].map(([x, y]) => body.collarAt(x!, y!))
  stitch(c, collar, '#a16d15', softEdge * 5)
  stitch(c, collar, '#ffe26b', softEdge * 3)
  for (const t of [.13, .39, .64, .88]) {
    const p = body.at(.09, t)
    c.beginPath(); c.arc(p.x, p.y, Math.max(1.5, width * .013), 0, Math.PI * 2)
    c.fillStyle = '#9a6412'; c.fill()
    c.beginPath(); c.arc(p.x - softEdge * .4, p.y - softEdge * .4, Math.max(.7, width * .0065), 0, Math.PI * 2)
    c.fillStyle = '#fff199'; c.fill()
  }
  body.arms.filter(arm => arm.front).forEach(sleeve)
  c.restore()
}

export function drawButton(c: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, turn = 0, squash = 1) {
  c.save(); c.translate(x, y); c.rotate(turn); c.scale(1, squash)
  const surface = c.createRadialGradient(-radius * .29, -radius * .40, radius * .02, 0, 0, radius)
  surface.addColorStop(0, color); surface.addColorStop(.76, '#1f1b32'); surface.addColorStop(1, '#080713')
  c.beginPath(); c.arc(0, 0, radius, 0, Math.PI * 2); c.fillStyle = surface; c.fill()
  c.strokeStyle = '#070611'; c.lineWidth = radius * .15; c.stroke()
  c.beginPath(); c.arc(0, 0, radius * .78, -Math.PI * .94, Math.PI * .08)
  c.strokeStyle = '#c6b3d963'; c.lineWidth = radius * .075; c.stroke()
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    c.beginPath(); c.arc(sx * radius * .24, sy * radius * .24, radius * .108, 0, Math.PI * 2)
    c.fillStyle = '#050410'; c.fill()
  }
  c.beginPath(); c.moveTo(-radius * .24, -radius * .24); c.lineTo(radius * .24, radius * .24)
  c.moveTo(radius * .24, -radius * .24); c.lineTo(-radius * .24, radius * .24)
  c.strokeStyle = '#b49ab6'; c.lineWidth = radius * .072; c.lineCap = 'round'; c.stroke()
  c.restore()
}

export function drawDoll(c: CanvasRenderingContext2D, x: number, y: number, size: number, turn: number, buttons: boolean) {
  c.save(); c.translate(x, y); c.rotate(turn); c.scale(size / 160, size / 160)
  c.lineCap = c.lineJoin = 'round'
  c.strokeStyle = '#492a44'; c.lineWidth = 7
  for (const side of [-1, 1]) {
    c.beginPath(); c.moveTo(side * 12, 35); c.lineTo(side * 14, 73); c.stroke()
    c.strokeStyle = '#a45e70'; c.lineWidth = 2.8
    for (const y of [45, 51, 57, 63, 69]) {
      c.beginPath(); c.moveTo(side * 13 - 2, y); c.lineTo(side * 13 + 2, y + 1); c.stroke()
    }
    c.strokeStyle = '#492a44'; c.lineWidth = 7
    c.beginPath(); c.moveTo(side * 14, 65); c.lineTo(side * 15, 77); c.lineTo(side * 21, 77)
    c.strokeStyle = '#d9a81c'; c.lineWidth = 10; c.stroke()
  }
  const coat = c.createLinearGradient(-32, -5, 32, 36)
  coat.addColorStop(0, '#fff18a'); coat.addColorStop(.48, '#f2cc39'); coat.addColorStop(1, '#a66712')
  c.beginPath(); c.moveTo(-11, -15); c.quadraticCurveTo(-27, -15, -33, 5); c.lineTo(-39, 23)
  c.lineTo(-29, 26); c.lineTo(-23, 17); c.lineTo(-25, 40); c.quadraticCurveTo(0, 44, 25, 40)
  c.lineTo(23, 17); c.lineTo(29, 26); c.lineTo(39, 23); c.lineTo(33, 5)
  c.quadraticCurveTo(26, -15, 11, -15); c.closePath()
  c.fillStyle = coat; c.fill(); c.strokeStyle = '#775019'; c.lineWidth = 1.4; c.stroke()
  c.beginPath(); c.moveTo(0, -12); c.lineTo(0, 40); c.strokeStyle = '#b98214'; c.stroke()
  for (const y of [1, 12, 23, 34]) { c.beginPath(); c.arc(4, y, 1.9, 0, Math.PI * 2); c.fillStyle = '#8c5b17'; c.fill() }
  c.beginPath(); c.moveTo(-11, -11); c.quadraticCurveTo(0, -4, 11, -11); c.strokeStyle = '#fff18c'; c.lineWidth = 3; c.stroke()

  const hair = c.createLinearGradient(-28, -62, 24, -19)
  hair.addColorStop(0, '#638be5'); hair.addColorStop(.22, '#223f9f'); hair.addColorStop(.58, '#13204d'); hair.addColorStop(1, '#344ea5')
  c.beginPath(); c.moveTo(-37, -49); c.bezierCurveTo(-34, -79, 20, -91, 34, -63)
  c.quadraticCurveTo(45, -46, 32, -21); c.lineTo(21, -13); c.lineTo(-20, -12)
  c.quadraticCurveTo(-41, -25, -37, -49); c.closePath(); c.fillStyle = hair; c.fill()
  const clay = c.createRadialGradient(-9, -48, 3, 0, -46, 38)
  clay.addColorStop(0, '#fff0ce'); clay.addColorStop(.73, '#ecc2a2'); clay.addColorStop(1, '#a9707e')
  c.beginPath(); c.ellipse(0, -45, 29, 29, 0, 0, Math.PI * 2); c.fillStyle = clay; c.fill()
  c.beginPath(); c.moveTo(-34, -45); c.quadraticCurveTo(-43, -72, -8, -77)
  c.quadraticCurveTo(17, -83, 31, -67); c.quadraticCurveTo(43, -50, 30, -23)
  c.quadraticCurveTo(32, -58, 7, -68); c.quadraticCurveTo(-6, -54, -29, -54)
  c.quadraticCurveTo(-32, -41, -24, -26); c.quadraticCurveTo(-33, -30, -34, -45); c.fillStyle = hair; c.fill()
  c.beginPath(); c.moveTo(-24, -61); c.quadraticCurveTo(-9, -63, 1, -73)
  c.moveTo(13, -73); c.quadraticCurveTo(30, -66, 34, -49)
  c.strokeStyle = '#729de793'; c.lineWidth = 1.5; c.stroke()
  c.beginPath(); c.moveTo(-27, -55); c.lineTo(-19, -59); c.strokeStyle = '#f2db97'; c.lineWidth = 2.1; c.stroke()
  for (const side of [-1, 1]) {
    c.beginPath(); c.moveTo(side * 7, -52); c.quadraticCurveTo(side * 13, -56, side * 20, -52)
    c.strokeStyle = '#674153'; c.lineWidth = 1.4; c.stroke()
    if (buttons) drawButton(c, side * 12, -44, 9.5, '#51425f', side * .12)
    else {
      c.beginPath(); c.ellipse(side * 12, -43, 7, 8, 0, 0, Math.PI * 2); c.fillStyle = '#fff8ed'; c.fill()
      c.beginPath(); c.ellipse(side * 12 + 1, -43, 3.9, 5, 0, 0, Math.PI * 2); c.fillStyle = '#46547d'; c.fill()
      c.beginPath(); c.arc(side * 12, -45, 1.25, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill()
    }
    for (const [dx, dy] of [[16, 0], [20, 3], [12, 4]]) {
      c.beginPath(); c.arc(side * dx!, -35 + dy!, .9, 0, Math.PI * 2); c.fillStyle = '#9a655e'; c.fill()
    }
  }
  c.beginPath(); c.moveTo(-6, -26); c.quadraticCurveTo(0, -23, 7, -27); c.strokeStyle = '#804258'; c.lineWidth = 1.5; c.stroke()
  c.restore()
}

export function drawTunnel(c: CanvasRenderingContext2D, w: number, h: number, time: number, alpha: number, cx: number, cy: number) {
  c.save(); c.globalAlpha *= alpha
  c.fillStyle = '#070c22'; c.fillRect(0, 0, w, h)
  const radius = Math.max(Math.hypot(cx, cy), Math.hypot(w - cx, h - cy),
    Math.hypot(cx, h - cy), Math.hypot(w - cx, cy)) * 1.24
  const phase = time * .00055
  c.translate(cx, cy)
  for (let i = 15; i >= 0; i--) {
    const r = radius * (i + 1) / 15
    const outline = (offset: number) => {
      c.beginPath()
      for (let j = 0; j <= 76; j++) {
        const a = j / 76 * Math.PI * 2
        const twist = a * 3 + i * .44 + phase
        const edge = r * (1 + Math.sin(twist) * .095 + Math.sin(a * 7 - i * .72 - phase * .8) * .032) - offset
        const x = Math.cos(a) * edge, y = Math.sin(a) * edge * .87
        if (j === 0) c.moveTo(x, y)
        else c.lineTo(x, y)
      }
      c.closePath()
    }
    const shade = c.createRadialGradient(0, 0, r * .77, -r * .09, r * .04, r * 1.14)
    shade.addColorStop(0, '#091026'); shade.addColorStop(.46, night[i % night.length]!)
    shade.addColorStop(.78, light[(i + 2) % light.length]!); shade.addColorStop(1, '#141737')
    outline(0); c.fillStyle = shade; c.fill()
    c.strokeStyle = '#110e2d9c'; c.lineWidth = Math.max(2, radius * .013); c.stroke()
    outline(radius * .013); c.strokeStyle = '#cad0f331'; c.lineWidth = Math.max(.8, radius * .003); c.stroke()
  }
  c.restore()
}

const fraction = (i: number) => {
  const n = Math.sin(i * 13.879 + 5.12) * 28157.138
  return n - Math.floor(n)
}

export function drawFallingObjects(c: CanvasRenderingContext2D, w: number, h: number, elapsed: number, reduced: boolean) {
  if (elapsed < 0) return
  const unit = Math.min(w, h)
  const colors = ['#8d71af', '#4b79b8', '#a58958', '#7f575e']
  c.save()
  for (let i = 0; i < 23; i++) {
    const t = (elapsed - i * 57) / (820 + fraction(i + 20) * 850)
    if (t < 0 || t > 1 || reduced) continue
    const x = w * (.04 + fraction(i) * .92) + Math.sin(t * 5 + i) * unit * .05
    const y = h * (-.13 + 1.32 * t ** 1.6)
    c.globalAlpha = Math.min(1, t * 11, (1 - t) * 9)
    drawButton(c, x, y, unit * (.018 + fraction(i + 4) * .029), colors[i % colors.length]!, i + t * 6,
      .38 + Math.abs(Math.sin(i + t * 7)) * .62)
  }
  c.globalAlpha = 1
  for (const [delay, position, end, size, tilt] of [[200, .20, 1.21, .22, -.51], [520, .82, .76, .29, .16]] as const) {
    if (elapsed < delay && !reduced) continue
    const t = reduced ? 1 : clamp((elapsed - delay) / 1190)
    const fall = clamp(t / .87) ** 1.75
    const y = -unit * .22 + (h * end + unit * .22) * fall
    const bounce = reduced || t <= .87 ? 0 : Math.sin((t - .87) / .13 * Math.PI) * unit * .045
    c.globalAlpha = reduced ? ease(elapsed / 400) : 1
    drawDoll(c, w * position, y - bounce, unit * size, tilt + (reduced ? 0 : (1 - fall) * 3.3), true)
  }
  c.restore()
}
