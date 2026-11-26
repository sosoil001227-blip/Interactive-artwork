const TAU = Math.PI * 2

function oval(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, angle = 0) {
  c.beginPath()
  c.ellipse(x, y, rx, ry, angle, 0, TAU)
  c.fillStyle = color
  c.fill()
}

function bird(c: CanvasRenderingContext2D, flap: number) {
  c.strokeStyle = '#201823'; c.lineWidth = 2.4; c.lineCap = 'round'
  for (const side of [-1, 1]) {
    c.save(); c.scale(side, 1); c.rotate(flap * .51)
    c.beginPath(); c.moveTo(16, 4); c.quadraticCurveTo(31, -22, 54, -19)
    c.quadraticCurveTo(51, 5, 28, 14); c.quadraticCurveTo(20, 14, 14, 11)
    c.fillStyle = '#171726'; c.fill(); c.stroke()
    c.strokeStyle = '#51435f'
    c.beginPath(); c.moveTo(24, 5); c.quadraticCurveTo(38, -2, 44, -13); c.stroke()
    c.restore()
  }
  c.beginPath(); c.moveTo(-11, 16); c.quadraticCurveTo(-23, 30, -18, 36)
  c.moveTo(11, 16); c.quadraticCurveTo(23, 30, 16, 36); c.stroke()
  oval(c, 0, 0, 21, 23, '#171523')
  oval(c, -10, -8, 12, 13, '#f5e7d8', -.15); oval(c, 10, -8, 12, 13, '#f5e7d8', .15)
  oval(c, -8, -7, 3.1, 4.1, '#211927'); oval(c, 8, -7, 3.1, 4.1, '#211927')
  c.beginPath(); c.moveTo(-2, 1); c.quadraticCurveTo(-14, 4, -18, 11)
  c.quadraticCurveTo(-20, 17, 1, 15); c.quadraticCurveTo(21, 17, 18, 11)
  c.quadraticCurveTo(14, 4, 3, 1); c.fillStyle = '#c5a379'; c.fill(); c.stroke()
  c.beginPath(); c.moveTo(-4, -21); c.quadraticCurveTo(-8, -34, -15, -39)
  c.moveTo(2, -22); c.quadraticCurveTo(2, -35, -5, -44)
  c.moveTo(7, -21); c.quadraticCurveTo(10, -30, 9, -38); c.stroke()
}

function mouse(c: CanvasRenderingContext2D, phase: number) {
  c.lineCap = 'round'; c.lineJoin = 'round'
  c.beginPath(); c.moveTo(20, 79); c.bezierCurveTo(31, 114, 72, 107, 57, 145 + phase * 3)
  c.strokeStyle = '#302637'; c.lineWidth = 7; c.stroke()
  c.strokeStyle = '#b49792'; c.lineWidth = 4; c.stroke()
  oval(c, -24, 6, 12, 16, '#ac918d', -.43)
  oval(c, 24, 6, 12, 16, '#ac918d', .43)
  oval(c, -26, 7, 6, 9, '#c8aba4', -.36); oval(c, 26, 7, 6, 9, '#c8aba4', .36)
  oval(c, -16, 100, 7, 12, '#ae999a', -.11); oval(c, 17, 100, 7, 12, '#ae999a', .12)
  oval(c, 0, 59, 34, 48, '#9a929f')
  oval(c, 1, 73, 23, 28, '#dce0d5')
  oval(c, 0, 25, 31, 26, '#ada3ae')
  oval(c, -22, 44, 11, 19, '#8b818b', .34); oval(c, 22, 44, 11, 19, '#8b818b', -.34)
  oval(c, -12, 25, 9, 10, '#f1e7dd'); oval(c, 12, 25, 9, 10, '#f1e7dd')
  oval(c, -10, 25, 3.3, 4, '#362c3a'); oval(c, 10, 25, 3.3, 4, '#362c3a')
  oval(c, 0, 35, 4.3, 2.8, '#6d4c55')
  c.beginPath(); c.moveTo(-12, 42); c.quadraticCurveTo(-6, 46, 0, 42)
  c.quadraticCurveTo(6, 46, 12, 42); c.strokeStyle = '#544452'; c.lineWidth = 1.25; c.stroke()
}

export function drawCompanions(c: CanvasRenderingContext2D, w: number, h: number, time: number, reduced: boolean) {
  const t = reduced ? .45 : time / 1000
  const size = Math.min(w, h)
  const scale = Math.min(1.33, size / 445)
  const flight = t * .78
  const birdX = w * (.50 + .35 * Math.cos(flight))
  const birdY = h * (.205 + .09 * Math.sin(flight * 1.25))
  const mouseX = w * (.50 + .355 * Math.cos(flight + 2.58))
  const mouseY = h * (.48 + .16 * Math.sin(flight + 1.19))

  c.save(); c.translate(mouseX, mouseY)
  c.rotate(Math.sin(flight * 1.4) * .23); c.scale(scale * .69, scale * .69)
  c.shadowColor = '#18142690'; c.shadowBlur = 7
  mouse(c, Math.sin(t * 3))
  c.restore()

  c.save(); c.translate(birdX, birdY)
  c.rotate(Math.sin(flight) * .27); c.scale(scale, scale)
  c.shadowColor = '#18142690'; c.shadowBlur = 7
  bird(c, Math.sin(t * 20))
  c.restore()
}
