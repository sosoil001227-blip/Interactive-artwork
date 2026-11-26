import { visible } from './dance.ts'
import type { Landmark, Point } from './dance.ts'
import type { Box, Character } from './avatar.ts'

const spriteWidth = 108
const spriteHeight = 144
const joints = [0, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 31, 32]
type Fabric = readonly [light: string, mid: string, shade: string]
type Hair = 'knot' | 'ponytail' | 'bob' | 'ribbons'
interface Outfit {
  skin: Fabric
  top: Fabric
  trousers: Fabric
  hair: Fabric
  shoe: Fabric
  accent: string
  belt: string
  style: Hair
  sleeve: number
  waist: number
  leg: readonly [thigh: number, knee: number, cuff: number]
}

const outfits: Record<Character['name'], Outfit> = {
  VOLT: { skin: ['#fff', '#e4ffff', '#77bce2'], top: ['#a7fbff', '#00d6ef', '#145abc'],
    trousers: ['#fefff9', '#e9f8ac', '#72baca'], hair: ['#79f5fe', '#1767ba', '#29288b'],
    shoe: ['#ffb5fc', '#a659ee', '#502590'], accent: '#ebff57', belt: '#f26bbe',
    style: 'knot', sleeve: .12, waist: .9, leg: [6.2, 3.55, 2.8] },
  ROXY: { skin: ['#fff9ff', '#ffe6ed', '#d189c9'], top: ['#ffe7f8', '#fb5ba6', '#7f3da5'],
    trousers: ['#fcb6ec', '#cc569e', '#63358e'], hair: ['#ff9de0', '#ab438f', '#4d2d72'],
    shoe: ['#d1ffef', '#68edc3', '#318a9d'], accent: '#9effdf', belt: '#ffcb79',
    style: 'ponytail', sleeve: .27, waist: .69, leg: [7.3, 4.5, 6.3] },
  BIT: { skin: ['#fff', '#dffbff', '#8ca8de'], top: ['#f2ffff', '#83cbff', '#343f99'],
    trousers: ['#b2ffff', '#4e91df', '#313177'], hair: ['#b9ecff', '#6184c6', '#33346d'],
    shoe: ['#f0ffff', '#8cecff', '#535abb'], accent: '#91fff4', belt: '#bcb4ff',
    style: 'bob', sleeve: .92, waist: .77, leg: [7.7, 5.9, 3.9] },
  NOVA: { skin: ['#fffdf7', '#fff0d6', '#d3a4dd'], top: ['#f9d7ff', '#a482f7', '#5a37b0'],
    trousers: ['#e6c0ff', '#9a68e0', '#52369e'], hair: ['#f6d6ff', '#ac6bdc', '#503397'],
    shoe: ['#fff6b6', '#f995ab', '#8846a6'], accent: '#ffcd7a', belt: '#ef9bef',
    style: 'ribbons', sleeve: .06, waist: 1, leg: [6.4, 4.1, 3.35] },
}

const neutral: Record<number, Point> = {
  0: { x: 55, y: 26 }, 7: { x: 61, y: 25 }, 8: { x: 47, y: 26 }, 11: { x: 65, y: 40 }, 12: { x: 47, y: 44 },
  13: { x: 83, y: 33 }, 14: { x: 31, y: 58 }, 15: { x: 66, y: 18 }, 16: { x: 14, y: 48 },
  23: { x: 67, y: 78 }, 24: { x: 54, y: 81 }, 25: { x: 79, y: 98 }, 26: { x: 45, y: 102 },
  27: { x: 70, y: 124 }, 28: { x: 42, y: 126 }, 31: { x: 78, y: 129 }, 32: { x: 38, y: 131 },
}

function mix(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}
const limit = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))

export class DancerMotion {
  private points: Record<number, Point> = {}
  private measured = .62
  private seen = -Infinity

  clear() { this.points = {}; this.measured = .62; this.seen = -Infinity }

  update(pose: Landmark[], aspect: number, at: number) {
    const nose = pose[0], a = pose[23], b = pose[24]
    const s0 = pose[11], s1 = pose[12]
    if (!visible(nose, .48) || !visible(s0, .52) || !visible(s1, .52)) return
    const shoulders = mix(s0, s1, .5)
    const hips = visible(a, .50) && visible(b, .50) ? mix(a, b, .5)
      : { x: shoulders.x, y: shoulders.y + this.measured * .39 }
    const left = pose[27], right = pose[28]
    const elapsed = at - this.seen
    if (visible(left, .52) && visible(right, .52)) {
      const measure = limit((left.y + right.y) / 2 - nose.y, .30, .92)
      this.measured = elapsed > 300 ? measure : this.measured * .92 + measure * .08
    }
    const unit = 99 / this.measured
    const blend = elapsed > 300 ? 1 : limit(1 - Math.exp(-elapsed / 42), .20, .87)
    for (const index of joints) {
      const source = pose[index]
      if (!visible(source, .50)) continue
      const point = {
        x: limit(54 + (hips.x - source.x) * unit * aspect, -2, 110),
        y: limit(78 + (source.y - hips.y) * unit, 8, 133),
      }
      this.points[index] = mix(this.points[index] ?? neutral[index]!, point, blend)
    }
    this.seen = at
  }

  snapshot(now: number, dance: number, automatic: boolean): Record<number, Point> {
    const tracking = limit(1 - (now - this.seen - 240) / 520, 0, 1)
    const sway = automatic ? Math.sin(dance * Math.PI / 2) * 6 : 0
    const bounce = automatic ? Math.cos(dance * Math.PI) * 3 : 0
    const points: Record<number, Point> = {}
    for (const index of joints) {
      const p = neutral[index]!
      const action = automatic && index === 16 ? Math.sin(dance * Math.PI / 2) * 15 : 0
      const heel = automatic && [25, 27, 31].includes(index) ? Math.sin(dance * Math.PI / 2) * 9 : 0
      const idle = { x: p.x + sway + heel, y: p.y + bounce + action }
      points[index] = mix(idle, this.points[index] ?? idle, tracking)
    }
    return points
  }
}

function unit(a: Point, b: Point): Point {
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  return length > .05 ? { x: (b.x - a.x) / length, y: (b.y - a.y) / length } : { x: 0, y: 1 }
}
function shift(p: Point, axis: Point, amount: number): Point {
  return { x: p.x + axis.x * amount, y: p.y + axis.y * amount }
}
function normal(axis: Point): Point { return { x: -axis.y, y: axis.x } }

function gradient(c: CanvasRenderingContext2D, a: Point, b: Point, colors: Fabric) {
  const paint = c.createLinearGradient(a.x, a.y, b.x, b.y)
  paint.addColorStop(0, colors[0])
  paint.addColorStop(.46, colors[1])
  paint.addColorStop(1, colors[2])
  return paint
}

function silhouette(c: CanvasRenderingContext2D, points: Point[], paint: CanvasGradient | string, rim?: string) {
  const center = mix(points[0]!, points.at(-1)!, .5)
  c.beginPath()
  c.moveTo(center.x, center.y)
  points.forEach((p, index) => {
    const next = mix(p, points[(index + 1) % points.length]!, .5)
    c.quadraticCurveTo(p.x, p.y, next.x, next.y)
  })
  c.closePath()
  c.fillStyle = paint
  c.fill()
  if (rim) { c.strokeStyle = rim; c.lineWidth = .75; c.stroke() }
}

function seam(c: CanvasRenderingContext2D, points: Point[], color: string, width: number) {
  c.beginPath()
  c.moveTo(points[0]!.x, points[0]!.y)
  points.slice(1).forEach(({ x, y }) => c.lineTo(x, y))
  c.strokeStyle = color
  c.lineWidth = width
  c.lineCap = 'round'
  c.lineJoin = 'round'
  c.stroke()
}

function fabric(c: CanvasRenderingContext2D, points: Point[], widths: number[], colors: Fabric) {
  const sides = points.map((p, index) => {
    const before = points[index - 1], after = points[index + 1]
    const from = before && unit(before, p), to = after && unit(p, after)
    const tangent = from && to
      ? unit({ x: 0, y: 0 }, { x: from.x + to.x, y: from.y + to.y })
      : from ?? to!
    const axis = normal(tangent), size = widths[index]!
    return [shift(p, axis, size), shift(p, axis, -size)] as const
  })
  const light = sides[0]!, shade = sides.at(-1)!
  silhouette(c, [...sides.map(p => p[0]), ...sides.map(p => p[1]).reverse()],
    gradient(c, light[0], shade[1], colors), '#f4fbff68')
}

function cuff(c: CanvasRenderingContext2D, axis: Point, point: Point, width: number, color: string) {
  const across = normal(axis)
  seam(c, [shift(point, across, -width), shift(point, across, width)], color, 1.45)
}

function drawLeg(c: CanvasRenderingContext2D, hip: Point, knee: Point, ankle: Point, toe: Point, outfit: Outfit) {
  const [thigh, narrow, hem] = outfit.leg
  const outer = normal(unit(hip, ankle))
  const press = mix(knee, ankle, .62)
  fabric(c, [hip, mix(hip, knee, .42), knee, press, ankle], [thigh, thigh * .93, narrow, (narrow + hem) / 2, hem], outfit.trousers)
  seam(c, [shift(mix(hip, knee, .1), outer, thigh * .55), shift(knee, outer, narrow * .51),
    shift(mix(knee, ankle, .9), outer, hem * .51)], outfit.accent, 1.65)
  for (const [position, size] of [[.29, 1.6], [.43, 1], [.68, 1.3]] as const) {
    const p = shift(mix(knee, ankle, position), outer, -1.05)
    c.fillStyle = outfit.accent
    c.fillRect(Math.round(p.x), Math.round(p.y), size, .9)
  }
  cuff(c, unit(knee, ankle), mix(knee, ankle, .93), hem * .66, outfit.accent)

  const ending = Math.hypot(ankle.x - toe.x, ankle.y - toe.y) < 2 ? { x: ankle.x + 4, y: ankle.y + 3 } : toe
  const tip = shift(ending, unit(ankle, ending), 3)
  fabric(c, [{ x: ankle.x, y: ankle.y - 2 }, mix(ankle, ending, .68), tip], [3.75, 4, 2.5], outfit.shoe)
  seam(c, [{ x: ankle.x - 1.5, y: ankle.y + 3 }, { x: tip.x, y: tip.y + 1.8 }], '#f4f9ff', 1.45)
}

function drawArm(c: CanvasRenderingContext2D, shoulder: Point, elbow: Point, wrist: Point, outfit: Outfit) {
  const forearm = unit(elbow, wrist)
  const palm = shift(wrist, forearm, 2.7), fingers = shift(wrist, forearm, 5.2)
  fabric(c, [shoulder, mix(shoulder, elbow, .46), elbow, mix(elbow, wrist, .48), wrist, palm, fingers],
    [4.15, 3.65, 2.7, 2.75, 1.65, 2.15, 1.45], outfit.skin)
  const sleeveEnd = mix(shoulder, elbow, outfit.sleeve)
  if (outfit.sleeve >= .8) {
    const wristband = mix(elbow, wrist, .78)
    fabric(c, [shoulder, mix(shoulder, elbow, .42), elbow, mix(elbow, wrist, .4), wristband],
      [5.15, 4.95, 3.65, 3.55, 2.45], outfit.top)
    cuff(c, forearm, wristband, 2.1, outfit.accent)
  } else if (outfit.sleeve >= .2) {
    fabric(c, [shoulder, mix(shoulder, sleeveEnd, .45), sleeveEnd], [5.4, 5, 4.1], outfit.top)
    cuff(c, unit(shoulder, elbow), sleeveEnd, 2.7, outfit.accent)
  }
  cuff(c, forearm, wrist, 1.8, outfit.accent)
}

function drawBody(c: CanvasRenderingContext2D, shoulderA: Point, shoulderB: Point, hipA: Point, hipB: Point, outfit: Outfit) {
  const [left, right] = shoulderA.x < shoulderB.x ? [shoulderA, shoulderB] : [shoulderB, shoulderA]
  const [leftHip, rightHip] = hipA.x < hipB.x ? [hipA, hipB] : [hipB, hipA]
  const shoulders = mix(left, right, .5)
  const hips = mix(leftHip, rightHip, .5)
  const up = unit(hips, shoulders)
  const span = unit(left, right)
  const chestL = shift(left, span, -3.5), chestR = shift(right, span, 3.5)
  const bottomL = { x: leftHip.x - 5.3, y: leftHip.y + 6 }, bottomR = { x: rightHip.x + 5.3, y: rightHip.y + 6 }
  const waistL = mix(chestL, bottomL, .63), waistR = mix(chestR, bottomR, .63)
  waistL.x += 2.5; waistR.x -= 2.5
  const neckL = shift(shift(shoulders, up, 3.5), span, -3)
  const neckR = shift(shift(shoulders, up, 3.5), span, 3)
  silhouette(c, [neckL, neckR, chestR, waistR, bottomR, bottomL, waistL, chestL],
    gradient(c, chestL, bottomR, outfit.skin))
  const hemL = mix(waistL, bottomL, (outfit.waist - .63) / .37)
  const hemR = mix(waistR, bottomR, (outfit.waist - .63) / .37)
  const collar = shift(shoulders, up, -2)
  silhouette(c, [chestL, neckL, collar, neckR, chestR, waistR, hemR, hemL, waistL],
    gradient(c, chestL, hemR, outfit.top), outfit.top[0] + 'b0')
  const bandL = mix(waistL, bottomL, .75), bandR = mix(waistR, bottomR, .75)
  silhouette(c, [bandL, bandR, bottomR, bottomL], gradient(c, bandL, bottomR, outfit.trousers))
  // Sewn highlights follow the same curved shoulder and hip anchors as the garment.
  seam(c, [mix(chestL, neckL, .43), mix(chestL, waistL, .74), mix(hemL, hemR, .20)], outfit.accent, 1.4)
  seam(c, [mix(chestR, neckR, .30), mix(chestR, waistR, .68), mix(hemL, hemR, .80)], outfit.top[0], 1)
  seam(c, [bandL, mix(hips, mix(bottomL, bottomR, .5), .52), bandR], outfit.belt, 2.8)
  const badge = mix(shoulders, hips, .31)
  c.fillStyle = outfit.accent
  c.fillRect(Math.round(badge.x), Math.round(badge.y), 3, 1)
  c.fillRect(Math.round(badge.x) + 1, Math.round(badge.y) + 2, 3, 1)
}

function drawHead(c: CanvasRenderingContext2D, face: Point, earA: Point, earB: Point, outfit: Outfit) {
  c.save()
  c.translate(face.x, face.y)
  c.rotate(limit(Math.atan2(earA.y - earB.y, Math.max(2, Math.abs(earA.x - earB.x))), -.45, .45))
  const shade = gradient(c, { x: -10, y: -12 }, { x: 6, y: 6 }, outfit.hair)
  if (outfit.style === 'knot') {
    silhouette(c, [{ x: -12, y: -9 }, { x: -9, y: -16 }, { x: -3, y: -15 }, { x: 0, y: -10 }, { x: -6, y: -7 }], shade)
  } else if (outfit.style === 'ponytail') {
    silhouette(c, [{ x: -5, y: -8 }, { x: -13, y: -12 }, { x: -19, y: -8 }, { x: -20, y: 1 },
      { x: -15, y: 7 }, { x: -13, y: 0 }, { x: -6, y: -4 }], shade, outfit.hair[0] + '85')
  } else if (outfit.style === 'bob') {
    silhouette(c, [{ x: -9, y: -10 }, { x: -12, y: -2 }, { x: -11, y: 7 }, { x: 1, y: 9 }, { x: 9, y: 5 }, { x: 8, y: -6 }], shade)
  } else {
    silhouette(c, [{ x: -4, y: -10 }, { x: -12, y: -8 }, { x: -17, y: -2 },
      { x: -13, y: 6 }, { x: -19, y: 12 }, { x: -9, y: 7 }, { x: -10, y: 0 }, { x: 0, y: -3 }], shade)
    seam(c, [{ x: -10, y: -5 }, { x: -14, y: 0 }, { x: -12, y: 5 }], outfit.accent, 1.25)
  }
  const skin = gradient(c, { x: 4, y: -8 }, { x: -7, y: 7 }, outfit.skin)
  silhouette(c, [{ x: -7, y: -8 }, { x: -1, y: -12 }, { x: 6, y: -9 }, { x: 7, y: -3 },
    { x: 9, y: .5 }, { x: 5, y: 1.4 }, { x: 5, y: 5.7 }, { x: 1, y: 8 }, { x: -5, y: 5 }, { x: -8, y: -1 }],
  skin, '#f7fdff9c')
  silhouette(c, [{ x: -9, y: .5 }, { x: -11, y: -4 }, { x: -8, y: -12 }, { x: -2, y: -14 },
    { x: 5, y: -11 }, { x: 7, y: -7 }, { x: 1, y: -8 }, { x: -4, y: -5 }, { x: -6, y: .5 }], shade)
  seam(c, [{ x: -8, y: -6 }, { x: -4, y: -9.5 }, { x: 3, y: -9.5 }], outfit.accent, 1.25)
  c.fillStyle = '#f8ffff'
  c.fillRect(-6, 2, 1.2, 1.2)
  c.restore()
}

const showcase: Record<Character['name'], Record<number, Point>> = {
  VOLT: neutral,
  ROXY: { ...neutral, 13: {x: 88, y: 54}, 15: {x: 99, y: 42}, 14: {x: 28, y: 42}, 16: {x: 18, y: 27} },
  BIT: { ...neutral, 13: {x: 79, y: 58}, 15: {x: 69, y: 68}, 14: {x: 28, y: 47}, 16: {x: 17, y: 61} },
  NOVA: { ...neutral, 13: {x: 82, y: 27}, 15: {x: 91, y: 12}, 14: {x: 38, y: 57}, 16: {x: 41, y: 69} },
}

export class DancerSprite {
  private buffer = document.createElement('canvas')
  private sprite = this.buffer.getContext('2d')!

  constructor() { this.buffer.width = spriteWidth * 2; this.buffer.height = spriteHeight * 2 }

  draw(output: CanvasRenderingContext2D, box: Box, look: Character, pose = showcase[look.name]) {
    const c = this.sprite, outfit = outfits[look.name]
    c.setTransform(2, 0, 0, 2, 0, 0)
    c.clearRect(0, 0, spriteWidth, spriteHeight)
    const s0 = pose[11]!, s1 = pose[12]!, h0 = pose[23]!, h1 = pose[24]!, face = pose[0]!
    drawLeg(c, h0, pose[25]!, pose[27]!, pose[31]!, outfit)
    drawLeg(c, h1, pose[26]!, pose[28]!, pose[32]!, outfit)
    drawArm(c, s0, pose[13]!, pose[15]!, outfit)
    const shoulders = mix(s0, s1, .5)
    fabric(c, [shoulders, mix(shoulders, face, .38), face], [4.1, 3.25, 3], outfit.skin)
    drawBody(c, s0, s1, h0, h1, outfit)
    drawHead(c, face, pose[7]!, pose[8]!, outfit)
    drawArm(c, s1, pose[14]!, pose[16]!, outfit)

    const scale = Math.min(box.width / spriteWidth, box.height / spriteHeight)
    const w = spriteWidth * scale, h = spriteHeight * scale
    output.save()
    output.imageSmoothingEnabled = false
    output.shadowColor = look.color + '57'
    output.shadowBlur = Math.min(13, h * .034)
    output.drawImage(this.buffer, Math.round(box.x + (box.width - w) / 2), Math.round(box.y + box.height - h), Math.round(w), Math.round(h))
    output.restore()
  }
}
