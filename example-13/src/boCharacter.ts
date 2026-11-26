import { mix } from './geometry.ts'
import type { BoFit } from './boMorph.ts'

const skin = '#e8c59e', shadow = '#d3b393', ink = '#302a24'
function fill(c: CanvasRenderingContext2D, path: string, color: string) { c.fillStyle = color; c.fill(new Path2D(path)) }
function oval(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, angle = 0) {
  c.beginPath(); c.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2); c.fillStyle = color; c.fill()
}

/** Flat-color, seated Boh, drawn as a whole character rather than a wearable face plate. */
export function drawBo(c: CanvasRenderingContext2D, fit: BoFit, faceAlpha: number, bodyAlpha: number, blush: number, clock: number, reduced: boolean, growBody = 1) {
  c.save(); c.translate(fit.x, fit.y); c.rotate(fit.roll); c.scale(fit.width / 260, fit.height / 280); c.translate(-250, -175)
  if (bodyAlpha > 0) drawBody(c, bodyAlpha, growBody)
  if (faceAlpha > 0) drawHead(c, faceAlpha, blush, clock, reduced)
  c.restore()
}

function drawBody(c: CanvasRenderingContext2D, bodyAlpha: number, growBody: number) {
  c.save(); c.globalAlpha *= bodyAlpha
  c.translate(250, 298); c.scale(.72 + growBody * .28, .25 + growBody * .75); c.translate(-250, -298)
  oval(c, 250, 527, 198, 14, '#76272e40')
  fill(c, 'M145 295 Q103 304 85 366 Q65 421 79 468 L121 483 L174 407 L328 407 L379 483 L426 468 Q440 415 412 361 Q393 315 356 298 Z', skin)
  fill(c, 'M106 350 Q89 400 89 440 L118 446 Q113 397 135 354 Z', shadow)
  fill(c, 'M366 332 Q417 368 420 433 L398 449 Q397 400 364 372 Z', shadow)
  fill(c, 'M176 298 Q248 325 324 298 Q367 331 386 390 Q397 442 368 479 Q324 516 248 523 Q173 518 133 485 Q105 454 119 407 Q130 344 176 298 Z', '#c94346')
  fill(c, 'M183 317 Q242 340 324 314 Q357 343 365 375 Q307 349 243 364 Q176 378 138 420 Q135 362 183 317 Z', '#d74d50')
  fill(c, 'M126 440 Q110 425 98 436 Q81 428 73 441 Q55 438 51 451 Q30 452 39 472 Q26 486 43 502 Q59 527 95 522 L181 513 Q212 502 205 486 Q190 472 169 481 Q147 455 126 440 Z', skin)
  fill(c, 'M373 440 Q389 425 402 437 Q421 428 427 443 Q444 438 449 453 Q469 452 461 474 Q477 489 458 504 Q442 527 406 522 L323 512 Q291 500 299 485 Q313 474 331 480 Q354 455 373 440 Z', skin)
  fill(c, 'M43 490 Q68 502 97 481 Q118 462 146 485 Q155 493 186 487 Q207 488 192 502 L97 519 Q54 526 43 506 Z', shadow)
  fill(c, 'M311 491 Q339 494 354 484 Q383 462 405 484 Q431 503 458 492 L455 509 Q439 525 404 519 L328 510 Z', shadow)
  c.save(); c.translate(251, 409); c.rotate(-.035); c.fillStyle = '#fffdf1'
  c.font = '900 142px "Kaiti SC","STKaiti","Songti SC","Noto Serif CJK SC",serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('坊', 0, 8, 222); c.restore()
  c.restore()
}

function drawHead(c: CanvasRenderingContext2D, faceAlpha: number, blush: number, clock: number, reduced: boolean) {
  c.save(); c.globalAlpha *= faceAlpha
  fill(c, 'M143 145 Q128 137 123 162 L124 211 Q119 236 139 245 L365 245 Q383 231 377 207 L376 163 Q373 140 360 146 Z', shadow)
  fill(c, 'M250 35 Q170 30 146 76 Q128 111 128 161 Q125 185 116 213 Q109 258 143 291 Q167 319 205 308 Q252 326 291 309 Q338 321 366 286 Q394 257 383 215 Q374 190 372 158 Q370 106 354 76 Q331 34 250 35 Z', skin)
  fill(c, 'M139 211 Q125 252 153 277 Q183 296 218 288 Q228 307 251 308 Q287 315 304 296 Q342 309 367 277 Q349 322 302 312 Q275 327 249 318 Q215 327 190 313 Q148 321 127 288 Q109 262 117 229 Z', shadow)
  oval(c, 161, 110, 7, 34, '#f5dab1', .30)
  oval(c, 142, 241, 6, 24, '#f4d8ad', .33)
  oval(c, 325, 232, 12, 9, '#f4d8ad', -.55)
  c.globalAlpha *= .18 + blush * .34
  oval(c, 167, 235, 35, 29, '#d96561'); oval(c, 333, 235, 35, 29, '#d96561')
  c.restore()

  c.save(); c.globalAlpha *= faceAlpha
  const blink = !reduced && clock % 5300 > 5160 ? .12 : 1
  for (const side of [-1, 1]) {
    const x = 250 + side * 59
    oval(c, x, 196, 13, 10 * blink, '#fffef5')
    if (blink > .5) oval(c, x - side * 1.5, 199, 4, 4.5, '#191d19')
    c.strokeStyle = ink; c.lineWidth = 2.2; c.lineCap = 'round'
    c.beginPath(); c.moveTo(x - 10, 181); c.quadraticCurveTo(x - 3, 174, x + 6, 180); c.stroke()
    c.beginPath(); c.moveTo(x - 8, 137); c.quadraticCurveTo(x, 130, x + 9, 137); c.stroke()
    c.beginPath(); c.moveTo(x - 22, 217); c.quadraticCurveTo(x - 9, 208, x + 7, 216); c.stroke()
    oval(c, x - side * 19, 225, 4, 12, '#c3ad98', -side * .65)
  }
  oval(c, 246, 213, 1.6, 1.4, ink); oval(c, 256, 213, 1.6, 1.4, ink)
  c.strokeStyle = ink; c.lineWidth = mix(1.3, 2, faceAlpha); c.lineCap = 'round'
  c.beginPath(); c.moveTo(233, 263); c.quadraticCurveTo(243, 258, 249, 261); c.quadraticCurveTo(259, 255, 270, 266); c.stroke()
  c.restore()
}
