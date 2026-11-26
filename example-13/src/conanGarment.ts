import type { BodyFit, GlassFit } from './conanFit.ts'
import type { Vec3 } from './geometry.ts'
import { clamp } from './geometry.ts'

function path(c:CanvasRenderingContext2D,points:Vec3[]) {
  c.beginPath();points.forEach((p,i)=>{if(i)c.lineTo(p.x,p.y);else c.moveTo(p.x,p.y)});c.closePath()
}
export function drawTrackedGlasses(c:CanvasRenderingContext2D,fit:GlassFit,progress:number) {
  c.save();c.globalAlpha=progress
  path(c,fit.outline);c.clip()
  c.translate(0,(1-progress)*fit.width*.12)
  const stroke=clamp(fit.width*.012,1.5,4)
  c.lineJoin='round';c.lineCap='round'
  for(const lens of fit.lenses) {
    path(c,lens.points)
    const gradient=c.createLinearGradient(lens.outer.x,lens.outer.y-10,lens.inner.x,lens.inner.y+15)
    gradient.addColorStop(0,'#b4deff20');gradient.addColorStop(.5,'#e8f8ff05');gradient.addColorStop(1,'#c9edff22')
    c.fillStyle=gradient;c.fill();c.lineWidth=stroke;c.strokeStyle='#10161e';c.stroke()
    c.beginPath();lens.points.slice(19,40).forEach((p,i)=>{if(i)c.lineTo(p.x,p.y);else c.moveTo(p.x,p.y)})
    c.lineWidth=stroke*1.4;c.stroke()
    c.beginPath();c.moveTo(lens.outer.x,lens.outer.y);c.lineTo(lens.temple.x,lens.temple.y)
    c.lineWidth=stroke;c.stroke()
    const a=lens.points[25]!,b=lens.points[28]!
    c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.lineWidth=1;c.strokeStyle='#dff4ff88';c.stroke()
  }
  const [a,b]=fit.lenses
  c.beginPath();c.moveTo(a!.inner.x,a!.inner.y)
  c.quadraticCurveTo(fit.nose.x,fit.nose.y-fit.width*.035,b!.inner.x,b!.inner.y)
  c.lineWidth=stroke;c.strokeStyle='#0b1119';c.stroke();c.restore()
}

export function drawTrackedJacket(c:CanvasRenderingContext2D,body:BodyFit,progress:number) {
  c.save();c.globalAlpha=progress;c.lineJoin='round';c.lineCap='round'
  const stroke=Math.max(1,body.width*.006)
  const gradient=c.createLinearGradient(body.left.x,body.left.y,body.rightHip.x,body.rightHip.y)
  gradient.addColorStop(0,'#3e80cf');gradient.addColorStop(.4,'#255d9d');gradient.addColorStop(1,'#143c70')
  const shape=(points:Vec3[],fill:string|CanvasGradient,line='#123359')=>{
    path(c,points);c.fillStyle=fill;c.fill();c.strokeStyle=line;c.lineWidth=stroke;c.stroke()
  }
  const sleeve = ({ visible, outline, cuff }: BodyFit['arms'][number]) => {
    if (!visible) return
    shape(outline, gradient, '#173e6c')
    if (cuff.length === 2) {
      c.beginPath(); c.moveTo(cuff[0]!.x, cuff[0]!.y); c.lineTo(cuff[1]!.x, cuff[1]!.y)
      c.strokeStyle = '#f7f5ee'; c.lineWidth = stroke * 2.5; c.stroke()
    }
  }
  body.arms.filter(a=>!a.front).forEach(sleeve)
  shape(body.outline, gradient)
  c.save(); path(c, body.outline); c.clip()
  const leftCollar = body.collarAt(-.48, 0), rightCollar = body.collarAt(.48, 0)
  const collarCenter = body.collarAt(0, .46)
  shape([leftCollar,rightCollar,body.at(.28,.15),body.at(.02,.73),body.at(-.20,.41)],'#f6f5ef','#becbdb')
  shape([leftCollar,collarCenter,body.at(-.13,.18),body.at(-.35,.095)],'#fffef7','#aebfce')
  shape([rightCollar,collarCenter,body.at(.13,.18),body.at(.35,.095)],'#e7edf2','#aebfce')
  shape([leftCollar,...[[-.57,.035],[-.60,.16],[-.44,.19],[-.53,.235],[-.06,.78],[-.25,.23]].map(([x,y])=>body.at(x!,y!))],'#214f86')
  shape([rightCollar,...[[.57,.035],[.60,.16],[.44,.19],[.53,.235],[-.06,.78],[.25,.23]].map(([x,y])=>body.at(x!,y!))],'#346dad')
  const seamA=body.at(-.06,.72),seamB=body.at(-.06,1.02)
  c.beginPath();c.moveTo(seamA.x,seamA.y);c.lineTo(seamB.x,seamB.y);c.strokeStyle='#163960';c.lineWidth=stroke;c.stroke()
  for(const y of [.70,.91]){
    const p=body.at(-.03,y);c.beginPath();c.ellipse(p.x,p.y,body.width*.024,body.width*.030,0,0,Math.PI*2)
    c.fillStyle='#e5bd52';c.fill();c.strokeStyle='#987623';c.stroke()
  }
  const pocketA=body.at(.41,.29),pocketB=body.at(.74,.29)
  c.beginPath();c.moveTo(pocketA.x,pocketA.y);c.lineTo(pocketB.x,pocketB.y);c.strokeStyle='#12365b';c.stroke()
  c.restore()
  body.arms.filter(a=>a.front).forEach(sleeve)
  const bow=(points:number[][],fill:string)=>shape(points.map(([x,y])=>body.collarAt(x!,y!)) ,fill,'#79222c')
  bow([[-.025,.30],[-.36,.21],[-.40,.40],[-.29,.48],[-.025,.43]],'#c9373c')
  bow([[.025,.30],[.36,.21],[.40,.40],[.29,.48],[.025,.43]],'#a9212e')
  bow([[-.09,.285],[.09,.285],[.12,.43],[0,.49],[-.12,.43]],'#e84c45')
  c.restore()
}
