import type { HandPose, Point } from './tracking'
import type { MusicState } from './music'
const TAU = Math.PI * 2
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n))

export function controllerLayout(hand: HandPose) {
  const a = hand.points[5]!, b = hand.points[17]!
  let angle = Math.atan2(b.y - a.y, b.x - a.x)
  if (angle > Math.PI / 2) angle -= Math.PI
  if (angle < -Math.PI / 2) angle += Math.PI
  const width = clamp(hand.size * 1.55, 68, 180), center = { x: hand.center.x, y: hand.center.y - hand.size * .1 }
  const offsets = [[-.46,0],[.46,0],[0,-.35],[.17,0],[0,.35]]
  const pins: Point[] = offsets.map(([x,y]) => ({ x:center.x + width * (x! * Math.cos(angle) - y! * Math.sin(angle)),
    y:center.y + width * (x! * Math.sin(angle) + y! * Math.cos(angle)) }))
  return { center, angle, width, pins }
}

export function drawController(ctx: CanvasRenderingContext2D, hand: HandPose) {
  const { center, angle, width, pins } = controllerLayout(hand)
  ctx.save(); ctx.translate(center.x, center.y); ctx.rotate(angle)
  for (const [rotation,length] of [[Math.PI/2,width*.8],[0,width]]) {
    ctx.save(); ctx.rotate(rotation!)
    const wood=ctx.createLinearGradient(0,-6,0,8);wood.addColorStop(0,'#cba274');wood.addColorStop(.4,'#806043');wood.addColorStop(1,'#493523')
    ctx.fillStyle='#32261d';ctx.fillRect(-length!/2+2,0,length!,12)
    ctx.fillStyle=wood;ctx.fillRect(-length!/2,-6,length!,12)
    ctx.strokeStyle='#e8cc9a66';ctx.lineWidth=.8
    ctx.beginPath();ctx.moveTo(-length!/2+7,-3);ctx.bezierCurveTo(-length!/4,-1,length!/4,-4,length!/2-7,-2);ctx.stroke()
    ctx.strokeStyle='#33231566';ctx.beginPath();ctx.moveTo(-length!/2+5,2);ctx.lineTo(length!/2-5,3);ctx.stroke();ctx.restore()
  }
  ctx.fillStyle='#c6a260';ctx.beginPath();ctx.arc(0,0,3,0,TAU);ctx.fill();ctx.restore()
  pins.forEach((pin,i)=>{
    ctx.strokeStyle='#d3c19c';ctx.lineWidth=1;ctx.beginPath();ctx.arc(pin.x,pin.y,2.5,0,TAU);ctx.stroke()
    const tip=hand.points[[4,8,12,16,20][i]!]!
    ctx.strokeStyle='#eee1c157';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(tip.x,tip.y);ctx.lineTo(pin.x,pin.y);ctx.stroke()
  })
}

export function drawWand(ctx: CanvasRenderingContext2D, baton: NonNullable<MusicState['baton']>, size: number) {
  const {base,tip}=baton,length=Math.hypot(tip.x-base.x,tip.y-base.y),u=clamp(size/73,.65,1.4)
  if(length<1)return
  ctx.save();ctx.translate(base.x,base.y);ctx.rotate(Math.atan2(tip.y-base.y,tip.x-base.x))
  const wood=ctx.createLinearGradient(0,-5*u,0,5*u);wood.addColorStop(0,'#edcb8d');wood.addColorStop(.35,'#a4773f');wood.addColorStop(1,'#4f351f')
  ctx.fillStyle=wood;ctx.beginPath();ctx.moveTo(-11*u,-5*u);ctx.lineTo(length,-.8*u);ctx.lineTo(length,.8*u);ctx.lineTo(-11*u,5*u);ctx.closePath();ctx.fill()
  ctx.fillStyle='#80623b';ctx.fillRect(-12*u,-7*u,43*u,14*u)
  ctx.strokeStyle='#d6b779';ctx.lineWidth=1.3*u
  for(let i=0;i<6;i++){const x=(i*6-10)*u;ctx.beginPath();ctx.moveTo(x,-6*u);ctx.lineTo(x+6*u,6*u);ctx.stroke()}
  ctx.fillStyle='#3e2d23';ctx.fillRect(31*u,-6*u,4*u,12*u)
  ctx.strokeStyle='#6a461f';ctx.lineWidth=.8*u
  for(let x=52*u;x<length-18*u;x+=22*u){ctx.beginPath();ctx.moveTo(x,0);ctx.bezierCurveTo(x+4*u,-5*u,x+12*u,5*u,x+14*u,0);ctx.stroke()}
  const jewel=ctx.createRadialGradient(-19*u,-3*u,1,-17*u,0,10*u)
  jewel.addColorStop(0,'#edaaa0');jewel.addColorStop(.25,'#a73538');jewel.addColorStop(.6,'#65141e');jewel.addColorStop(1,'#210d12')
  ctx.fillStyle=jewel;ctx.beginPath();ctx.arc(-17*u,0,9*u,0,TAU);ctx.fill();ctx.strokeStyle='#b48d4d';ctx.lineWidth=1;ctx.stroke();ctx.restore()
}
