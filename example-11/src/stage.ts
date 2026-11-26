import type { Hands } from './tracking'
import type { PuppetPose } from './rig'
import type { MusicState } from './music'
import { openingAt } from './opening.ts'
import { drawChristine, drawAudience } from './sprites.ts'
import type { TheatreSprites } from './sprites'
import { controllerLayout } from './props.ts'

const TAU = Math.PI * 2
export function microphoneLayout(width: number, height: number) {
  const unit = Math.min(height / 760, width / 500, 1.45), floor = height * .84
  const x = Math.min(width * .65, width * .47 + Math.max(width * .085,75 * unit))
  return { unit, floor, x, top: { x, y: floor - 298 * unit }, tip: { x, y: floor - 326 * unit } }
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius); ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h); ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius); ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y); ctx.closePath()
}

export class PuppetStage {
  private readonly ctx: CanvasRenderingContext2D
  private readonly floorTexture: HTMLCanvasElement
  sprites: TheatreSprites | undefined
  private width = 0
  private height = 0
  private microphoneStem: CanvasGradient | undefined
  private microphoneGold: CanvasGradient | undefined
  private reduced = matchMedia('(prefers-reduced-motion: reduce)')

  constructor(canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('이 브라우저에서 무대 화면을 준비하지 못했어요.')
    this.ctx = context; this.floorTexture = document.createElement('canvas'); this.resize()
  }

  resize() {
    this.width = innerWidth; this.height = innerHeight
    const dpr = Math.min(devicePixelRatio || 1, 1.5)
    this.ctx.canvas.width = Math.round(this.width * dpr); this.ctx.canvas.height = Math.round(this.height * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.cacheFloor(dpr)
    this.cacheMicrophone()
  }

  clear() { this.ctx.clearRect(0, 0, this.width, this.height) }

  private cacheFloor(dpr: number) {
    const w = this.width, h = this.height, floor = h * .84
    this.floorTexture.width = Math.round(w * dpr)
    this.floorTexture.height = Math.ceil((h - floor + 18) * dpr)
    const ctx = this.floorTexture.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.translate(0, -floor + 18)
    ctx.fillStyle = '#654b3c'; ctx.fillRect(0, floor - 18, w, h - floor + 18)
    // Project the boards toward a shared vanishing point; cache once per resize.
    const rows = [floor - 18, floor + h * .025, floor + h * .07, floor + h * .125, h + 20]
    const projected = (column: number, y: number) => w / 2 + column * w / 7 * (y - h * .48) / (h * .52)
    for (let row = 0; row < rows.length - 1; row++) {
      const far = rows[row]!, near = rows[row + 1]!
      ctx.strokeStyle = '#35291f40'; ctx.lineWidth = .7
      for (let column = -7; column < 7; column++) {
        const offset = column + (row % 2) * .5
        const farX = projected(offset, far), farR = projected(offset + 1, far)
        const nearX = projected(offset, near), nearR = projected(offset + 1, near)
        ctx.fillStyle = ['#65503f', '#6c5342', '#604b3c', '#705846'][Math.abs(column + row) % 4]!
        ctx.beginPath(); ctx.moveTo(farX, far); ctx.lineTo(farR, far); ctx.lineTo(nearR, near); ctx.lineTo(nearX, near); ctx.closePath(); ctx.fill(); ctx.stroke()
        ctx.strokeStyle = '#cbb59112'
        for (let grain = 1; grain < 4; grain++) {
          const y = far + (near - far) * grain / 4, x = projected(offset + .06, y), end = projected(offset + .94, y)
          ctx.beginPath(); ctx.moveTo(x, y)
          ctx.bezierCurveTo(x + (end - x) * .3, y - 1.2, end - (end - x) * .3, y + 1.2, end, y); ctx.stroke()
        }
        ctx.strokeStyle = '#35291f40'
      }
    }
    const wash = ctx.createLinearGradient(0, floor - 18, 0, h)
    wash.addColorStop(0, '#3b2a2355'); wash.addColorStop(.35, '#e7c3940b'); wash.addColorStop(1, '#241c184f')
    ctx.fillStyle = wash; ctx.fillRect(0, floor - 18, w, h - floor + 18)
  }

  private floor(pose: PuppetPose, intensity: number) {
    const ctx = this.ctx, floor = this.height * .84
    ctx.drawImage(this.floorTexture, 0, floor - 18, this.width, this.height - floor + 18)
    ctx.save(); ctx.translate(pose.head.x, floor); ctx.scale(1, .18)
    const pool = ctx.createRadialGradient(0, 0, 8, 0, 0, 230 * pose.scale)
    pool.addColorStop(0, `rgba(255,196,112,${.18 * intensity})`); pool.addColorStop(1, 'rgba(255,196,112,0)')
    ctx.fillStyle = pool; ctx.beginPath(); ctx.arc(0, 0, 230 * pose.scale, 0, TAU); ctx.fill(); ctx.restore()
    ctx.fillStyle = '#02060d80'; ctx.beginPath(); ctx.ellipse(pose.hip.x, floor + 3, 66 * pose.scale, 9 * pose.scale, 0, 0, TAU); ctx.fill()
  }

  private spotlight(pose: PuppetPose, intensity: number, playful: boolean) {
    const ctx = this.ctx, floor = this.height * .84
    const beam = ctx.createLinearGradient(pose.head.x, 0, pose.head.x, floor)
    beam.addColorStop(0, `rgba(${playful ? '242,196,214' : '255,220,177'},${.02 * intensity})`)
    beam.addColorStop(1, `rgba(${playful ? '242,196,214' : '255,220,177'},${.055 * intensity})`)
    ctx.fillStyle = beam; ctx.beginPath(); ctx.moveTo(this.width * .5, -25)
    ctx.lineTo(pose.hip.x + 210 * pose.scale, floor); ctx.lineTo(pose.hip.x - 210 * pose.scale, floor); ctx.closePath(); ctx.fill()
    const halo = ctx.createRadialGradient(pose.head.x, pose.head.y + 70 * pose.scale, 25 * pose.scale,
      pose.head.x, pose.head.y + 70 * pose.scale, 230 * pose.scale)
    halo.addColorStop(0, `rgba(255,189,101,${.075 * intensity})`); halo.addColorStop(.65, `rgba(217,106,43,${.025 * intensity})`)
    halo.addColorStop(1, 'rgba(217,106,43,0)')
    ctx.fillStyle = halo; ctx.fillRect(pose.head.x - 230 * pose.scale, pose.head.y - 160 * pose.scale, 460 * pose.scale, 460 * pose.scale)
  }

  private cacheMicrophone() {
    const ctx = this.ctx, { unit: u, x, tip } = microphoneLayout(this.width, this.height)
    const stem=ctx.createLinearGradient(x-3*u,0,x+3*u,0)
    stem.addColorStop(0,'#2f2c22');stem.addColorStop(.4,'#d3bd7f');stem.addColorStop(.6,'#80704b');stem.addColorStop(1,'#2d2d24')
    this.microphoneStem = stem
    ctx.save();ctx.translate(tip.x,tip.y)
    const gold=ctx.createLinearGradient(-12*u,0,12*u,0)
    gold.addColorStop(0,'#5b4930');gold.addColorStop(.25,'#c4a66b');gold.addColorStop(.48,'#e5d3a0');gold.addColorStop(.75,'#a38b54');gold.addColorStop(1,'#493e2d')
    this.microphoneGold = gold
    ctx.restore()
  }

  private microphone() {
    const ctx = this.ctx, { unit: u, x, floor, top, tip } = microphoneLayout(this.width, this.height)
    ctx.fillStyle='#17191a';ctx.beginPath();ctx.ellipse(x,floor+3*u,32*u,8*u,0,0,TAU);ctx.fill()
    ctx.strokeStyle='#9b8053';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(x,floor+1*u,30*u,6*u,0,0,TAU);ctx.stroke()
    ctx.fillStyle=this.microphoneStem!;ctx.fillRect(x-2.5*u,tip.y+20*u,5*u,floor-tip.y-20*u)
    ctx.fillStyle='#282a26';roundRect(ctx,x-4*u,floor-53*u,8*u,35*u,2*u);ctx.fill()
    ctx.strokeStyle='#b29b68';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x-4*u,top.y);ctx.lineTo(x+4*u,top.y);ctx.stroke()
    ctx.strokeStyle='#171b18';ctx.lineWidth=1.5*u;ctx.beginPath();ctx.moveTo(x+3*u,tip.y+22*u)
    ctx.bezierCurveTo(x+12*u,tip.y+60*u,x+7*u,floor-40*u,x+3*u,floor);ctx.bezierCurveTo(x+20*u,floor+9*u,x+50*u,floor+4*u,x+75*u,floor+14*u);ctx.stroke()
    ctx.save();ctx.translate(tip.x,tip.y)
    const gold=this.microphoneGold!
    ctx.fillStyle=gold;roundRect(ctx,-12*u,-24*u,24*u,46*u,10*u);ctx.fill()
    ctx.fillStyle='#232a24';roundRect(ctx,-8.5*u,-18*u,17*u,32*u,6*u);ctx.fill()
    ctx.strokeStyle='#cfb777';ctx.lineWidth=1.6*u
    for(let i=-14;i<=12;i+=4){ctx.beginPath();ctx.moveTo(-7.5*u,i*u);ctx.quadraticCurveTo(0,(i+1)*u,7.5*u,i*u);ctx.stroke()}
    ctx.strokeStyle='#8d764d';ctx.lineWidth=1.2*u;ctx.beginPath();ctx.moveTo(0,-17*u);ctx.lineTo(0,13*u);ctx.stroke()
    ctx.fillStyle=gold;roundRect(ctx,-6*u,20*u,12*u,8*u,3*u);ctx.fill()
    ctx.restore()
  }

  draw(now: number, elapsed: number, pose: PuppetPose, music: MusicState, hands: Hands, markers: boolean) {
    const ctx = this.ctx, opening = openingAt(elapsed, this.reduced.matches)
    this.clear()
    ctx.save()
    ctx.beginPath(); ctx.rect(this.width * .5 * (1 - opening.curtain), 0, this.width * opening.curtain, this.height); ctx.clip()
    this.spotlight(pose, opening.spotlight, false); this.floor(pose, opening.spotlight)
    ctx.globalAlpha = opening.puppet
    const controller = hands.left ? controllerLayout(hands.left) : undefined
    if (this.sprites) drawChristine(ctx, this.sprites.ivory, controller ? {...pose,anchors:controller.pins} : pose, music, now, false, this.reduced.matches)
    this.microphone()
    if (markers) for (const hand of [hands.left, hands.right]) {
      if (!hand) continue
      ctx.lineWidth = .7; ctx.strokeStyle = '#eadabc42'
      for (const bone of [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [0, 9, 10, 11, 12], [0, 13, 14, 15, 16], [0, 17, 18, 19, 20]]) {
        ctx.beginPath(); bone.forEach((index, i) => { const p = hand.points[index]!; if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y) }); ctx.stroke()
      }
    }
    ctx.restore()
    if (this.sprites) drawAudience(ctx, this.sprites.hands, opening.audience, now, this.width, this.height, this.reduced.matches)
  }
}
