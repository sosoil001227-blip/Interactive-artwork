import { clamp, ease } from './geometry.ts'
import { crayonColors } from './shinchanGesture.ts'

const outline = '#332114', skin = '#f8c999'
function shape(c: CanvasRenderingContext2D, path: string, color: string, width = 4) {
  const p = new Path2D(path)
  c.fillStyle = color; c.strokeStyle = outline; c.lineWidth = width; c.lineJoin = 'round'; c.lineCap = 'round'
  c.fill(p); c.stroke(p)
}
function oval(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, angle = 0, stroke = true) {
  c.beginPath(); c.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2); c.fillStyle = color; c.fill()
  if (stroke) { c.strokeStyle = outline; c.lineWidth = 3.6; c.stroke() }
}

/** A code-native illustration based on the supplied beret, crayon and outfit references. */
export function drawCrayon(c: CanvasRenderingContext2D, x: number, y: number, scale: number, angle = -.25, color: string = crayonColors.peach) {
  c.save(); c.translate(x, y); c.rotate(angle); c.scale(scale, scale)
  shape(c, 'M-8 7 L-8-48 L0-65 L8-48 L8 7 Z', '#fff1bc', 2.8)
  shape(c, 'M-8-48 L0-65 L8-48 Z', color, 2.2)
  c.fillStyle = color; c.fillRect(-7, -37, 14, 28)
  c.fillStyle = '#fff1bc'; c.fillRect(-7, -32, 14, 4); c.fillRect(-7, -17, 14, 4)
  c.fillStyle = outline; c.font = '700 7px system-ui'; c.textAlign = 'center'; c.save(); c.rotate(-Math.PI / 2); c.fillText('CRAYON', 23, 3); c.restore()
  c.restore()
}

export function drawShinchan(c: CanvasRenderingContext2D, x: number, y: number, scale: number,
  clock: number, pose: 'arriving' | 'lifting' | 'searching' | 'offering' | 'drawing', reduced: boolean) {
  const dance = pose === 'drawing', t = reduced ? 0 : clock / 1000
  const sway = dance ? Math.sin(t * 6.8) : Math.sin(t * 4) * .2
  const bounce = reduced ? 0 : dance ? Math.abs(Math.sin(t * 6.8)) * 5 : Math.sin(t * 3.5) * 1.2
  c.save(); c.translate(x, y - bounce * scale); c.scale(scale, scale)
  c.lineJoin = 'round'; c.lineCap = 'round'
  oval(c, 91, 252 + bounce, dance ? 68 : 58, 6, '#15121b35', 0, false)
  if (dance) {
    // A fully clothed, rear-facing hip dance with alternating steps and side-to-side sway.
    const hip = sway * 13, step = Math.sin(t * 6.8)
    shape(c, `M58 211 L71 211 L${73 + step * 5} 237 L${61 + step * 5} 240 Z`, skin)
    shape(c, `M105 211 L118 211 L${115 - step * 5} 240 L${103 - step * 5} 236 Z`, skin)
    shape(c, `M${59 + step * 5} 232 L${73 + step * 5} 233 L${79 + step * 5} 246 Q63 253 ${49 + step * 5} 246 Z`, '#ffe265')
    shape(c, `M${102 - step * 5} 234 L${116 - step * 5} 232 L${129 - step * 5} 246 Q111 253 ${99 - step * 5} 245 Z`, '#ffe265')
    c.save(); c.translate(hip, 0); c.rotate(sway * .06)
    shape(c, 'M41 146 Q20 153 12 137 L5 142 Q10 169 43 171 L62 167 L113 166 Q145 168 160 143 L153 137 Q138 153 121 144 Z', '#ed2941')
    oval(c, 9, 139, 7, 6, skin); oval(c, 157, 139, 7, 6, skin)
    shape(c, 'M52 133 Q85 124 119 136 L129 172 L43 173 Z', '#ed2941')
    shape(c, 'M36 157 Q32 118 67 118 Q86 117 88 140 Q93 116 113 121 Q145 128 141 160 L139 188 Q127 211 91 208 Q57 216 35 193 Z', '#fff35a')
    shape(c, 'M35 172 Q84 182 141 170 L142 203 Q120 218 96 211 L90 198 L83 214 Q54 216 35 204 Z', '#fff35a')
    c.strokeStyle = '#a8962e'; c.lineWidth = 2.8
    c.beginPath(); c.moveTo(88, 133); c.bezierCurveTo(94, 149, 93, 160, 89, 174); c.stroke()
    c.beginPath(); c.moveTo(43, 178); c.lineTo(56, 181); c.moveTo(123, 180); c.lineTo(135, 176); c.stroke()
    // Small black hair and red collar remain visible above the exaggerated yellow shorts.
    shape(c, 'M60 124 Q53 104 64 91 Q88 76 108 94 L116 125 Z', '#17130f')
    c.restore()
    if (!reduced) {
      c.strokeStyle = '#fff396'; c.lineWidth = 3
      for (const side of [-1, 1]) { c.beginPath(); c.moveTo(88 + side * 88, 139); c.quadraticCurveTo(88 + side * 100, 151, 88 + side * 85, 163); c.stroke() }
    }
    c.restore(); return
  }
  const lean = pose === 'searching' ? -.10 : pose === 'lifting' ? -.05 : 0
  c.translate(80, 220); c.rotate(lean); c.translate(-80, -220)
  // Socks and little yellow shoes.
  shape(c, 'M57 205 L75 205 L72 237 L61 238 Z', skin)
  shape(c, 'M105 205 L124 205 L118 238 L107 237 Z', skin)
  shape(c, 'M59 224 L73 224 L71 239 L61 239 Z', '#fff9e8', 2.6)
  shape(c, 'M107 224 L121 224 L117 239 L106 239 Z', '#fff9e8', 2.6)
  shape(c, 'M61 233 L70 237 L80 247 Q61 255 44 248 Q44 241 57 239 Z', '#ffe174')
  shape(c, 'M109 235 L118 233 L132 247 Q120 254 100 248 L103 240 Z', '#ffe174')
  shape(c, 'M40 177 L139 178 L139 210 L96 212 L87 201 L80 214 L42 211 Z', '#fff36f')
  // The reference's blue smock, with loose crayon hatch marks.
  shape(c, 'M47 109 Q88 118 130 108 L145 169 L133 190 Q89 182 42 193 L31 161 Z', '#7cc6df')
  c.save(); c.beginPath(); c.rect(42, 122, 94, 62); c.clip()
  for (let i = 0; i < 15; i++) {
    c.strokeStyle = ['#efb15d', '#edec74', '#6ea47a', '#6d94d2'][i % 4]!
    c.lineWidth = 2.4
    const px = 49 + i % 5 * 19, py = 133 + Math.floor(i / 5) * 20
    for (let j = 0; j < 3; j++) { c.beginPath(); c.moveTo(px + j * 3, py + 7); c.lineTo(px + j * 3 + 4, py - 5); c.stroke() }
  }
  c.restore()
  // Left hand opens the lower-left corner; the right hand triumphantly presents the crayon.
  const reach = pose === 'lifting' || pose === 'searching'
  shape(c, reach ? 'M39 128 L22 133 L9 190 L23 194 L49 150 Z' : 'M40 125 L27 135 L24 170 L41 173 L52 144 Z', '#7cc6df')
  oval(c, reach ? 15 : 32, reach ? 191 : 174, 10, 8, skin)
  if (pose === 'offering') {
    const raised = reduced ? 1 : ease((clock - 4400) / 800)
    const hx = 141 + 33 * raised, hy = 174 - 119 * raised
    shape(c, `M127 123 L142 131 L${hx + 5} ${hy + 6} L${hx - 10} ${hy - 4} L125 99 Z`, '#7cc6df')
    drawCrayon(c, hx + 4, hy - 6, .88, .12)
    oval(c, hx, hy, 10, 9, skin)
  } else {
    shape(c, 'M129 123 L143 132 L150 165 L135 174 L120 142 Z', '#7cc6df')
    oval(c, 141, 174, 10, 8, skin)
  }
  // Large off-center cheeks, round black eyes, and characteristic zigzag eyebrows.
  shape(c, 'M38 41 Q62 12 111 25 Q144 37 148 79 Q167 65 174 86 Q184 117 150 114 Q102 133 52 117 Q9 115 12 83 Q12 60 38 61 Z', skin)
  oval(c, 65, 77, 17, 19, '#16120e', -.12, false)
  oval(c, 116, 80, 17, 19, '#16120e', -.12, false)
  oval(c, 69, 72, 6.4, 6.4, '#fffdf4', 0, false)
  oval(c, 120, 76, 6.4, 6.4, '#fffdf4', 0, false)
  shape(c, 'M43 43 Q56 29 65 31 L78 43 Q84 58 73 58 L62 47 L53 54 Q40 57 43 43 Z', '#17120d', 1.8)
  shape(c, 'M96 43 L113 34 Q123 31 138 51 Q143 65 130 61 L119 49 L108 56 Q93 60 96 43 Z', '#17120d', 1.8)
  c.strokeStyle = outline; c.lineWidth = 1.9
  c.beginPath(); c.moveTo(46, 64); c.quadraticCurveTo(59, 47, 78, 64); c.moveTo(99, 65); c.quadraticCurveTo(115, 51, 133, 70); c.stroke()
  oval(c, 54, 111, 15, 20, '#b95d65', .5)
  // Scarlet artist's beret, including its little stalk.
  shape(c, 'M109 11 L112-5 Q131-7 124 11 L118 20 Z', '#d5334d')
  shape(c, 'M30 31 Q7 9 32-6 Q67-23 107-3 Q150 6 170 48 Q181 72 151 86 L143 63 Q134 36 111 28 Q69 10 42 37 Z', '#d92e4c')
  shape(c, 'M31 36 Q47 25 59 24 L72 39 Q75 47 66 48 L56 37 L44 44 Q31 48 31 36 Z', '#17120d', 1.8)
  // A few colorful marks on each cheek, like the first reference.
  for (const [px, py, color] of [[26, 83, '#7f9ad8'], [139, 102, '#80aa6c'], [32, 67, '#d99d68']] as const) {
    c.strokeStyle = color; c.lineWidth = 2.5
    for (let j = 0; j < 3; j++) { c.beginPath(); c.moveTo(px + j * 4, py + 7); c.lineTo(px + j * 4 + 4, py - 3); c.stroke() }
  }
  c.restore()
}

export function drawSpeech(c: CanvasRenderingContext2D, text: string, x: number, y: number, width: number) {
  c.save(); c.font = `800 ${clamp(width / 11, 10, 15)}px system-ui,sans-serif`
  const w = Math.min(width, c.measureText(text).width + 23), h = 30
  const left = x - w / 2, top = y - h, r = 10
  c.beginPath(); c.moveTo(left + r, top); c.lineTo(left + w - r, top); c.quadraticCurveTo(left + w, top, left + w, top + r)
  c.lineTo(left + w, y - r); c.quadraticCurveTo(left + w, y, left + w - r, y); c.lineTo(left + r, y)
  c.quadraticCurveTo(left, y, left, y - r); c.lineTo(left, top + r); c.quadraticCurveTo(left, top, left + r, top); c.closePath()
  c.fillStyle = '#fff9da'; c.strokeStyle = '#78533a'; c.lineWidth = 1.4; c.fill(); c.stroke()
  c.beginPath(); c.moveTo(x - 5, y); c.lineTo(x - 1, y + 8); c.lineTo(x + 6, y); c.fill()
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#543822'; c.fillText(text, x, y - h / 2, w - 12); c.restore()
}
