import test from 'node:test'
import assert from 'node:assert/strict'
import {fitBody,fitGlasses,conanImpact} from '../src/conanFit.ts'
import {sampleFrame} from '../src/rig.ts'
import type {BodyLandmark,TrackingFrame} from '../src/tracking.ts'
const project=(p:{x:number;y:number;z:number})=>({x:720-p.x,y:p.y,z:p.z})
function bodyFrame():TrackingFrame{
  const body:BodyLandmark[]=Array.from({length:33},()=>({x:.5,y:.5,z:0,visibility:1,presence:1}))
  for(const [index,x,y] of [[11,.72,.35],[12,.28,.38],[13,.82,.54],[14,.19,.47],[15,.77,.74],[16,.12,.30],[23,.66,.82],[24,.35,.84]])body[index!]={x:x!,y:y!,z:0,visibility:1,presence:1}
  return {...sampleFrame,body}
}

test('each glasses lens follows its own eye anchors under translation and head yaw',()=>{
  const original=fitGlasses(sampleFrame,project)!
  assert.equal(original.lenses.length,2)
  const moved=fitGlasses({...sampleFrame,face:sampleFrame.face.map(p=>({...p,x:p.x+.07,y:p.y+.04}))},project)!
  for(let i=0;i<2;i++){
    assert.ok(Math.abs(moved.lenses[i]!.center.x-original.lenses[i]!.center.x+.07*720)<1e-6)
    assert.ok(Math.abs(moved.lenses[i]!.center.y-original.lenses[i]!.center.y-.04*720)<1e-6)
  }
  const yaw=.64,c=Math.cos(yaw),s=Math.sin(yaw)
  const turned=fitGlasses({...sampleFrame,face:sampleFrame.face.map(p=>({x:.5+(p.x-.5)*c+p.z*s,y:p.y,z:p.z*c-(p.x-.5)*s}))},project)!
  const span=(fit:typeof original)=>fit.lenses.reduce((sum,lens)=>sum+Math.max(...lens.points.map(p=>p.x))-Math.min(...lens.points.map(p=>p.x)),0)
  assert.ok(span(turned)<span(original),'lenses must foreshorten with the head')
  assert.ok(turned.lenses.every(lens=>lens.points.every(p=>[p.x,p.y,p.z].every(Number.isFinite))))
  assert.equal(fitGlasses({...sampleFrame,face:[]},project),undefined)
})

test('the jacket is pinned to shoulders, hips, elbows and wrists independently of the face',()=>{
  const frame=bodyFrame(),fit=fitBody(frame,project)!
  const shoulder=frame.body![11]!,wrist=frame.body![16]!
  assert.deepEqual(fit.at(-1,0),project({x:shoulder.x*720,y:shoulder.y*720,z:0}))
  assert.deepEqual(fit.arms[1]!.wrist,project({x:wrist.x*720,y:wrist.y*720,z:0}))
  const faceMoved=fitBody({...frame,face:frame.face.map(p=>({...p,x:p.x+.1,y:p.y-.15}))},project)!
  assert.deepEqual(faceMoved.neck,fit.neck)
  assert.deepEqual(faceMoved.at(.3,.7),fit.at(.3,.7))
  const tilted={...frame,body:frame.body!.map(p=>({...p,x:p.x+.07,y:p.y+.1*(p.x-.5)}))}
  const bent=fitBody(tilted,project)!
  assert.notEqual(bent.at(.3,.2).x,fit.at(.3,.2).x)
  assert.notEqual(bent.left.y,bent.right.y)
})

test('missing shoulders hide the garment instead of reverting to a face-sized costume',()=>{
  const frame=bodyFrame()
  assert.equal(fitBody({...frame,body:undefined},project),undefined)
  frame.body![11]!.visibility=.05
  assert.equal(fitBody(frame,project),undefined)
  const upper=bodyFrame();upper.body![23]!.visibility=0;upper.body![24]!.visibility=0
  assert.ok(fitBody(upper,project),'waist-up framing may infer the offscreen hem from the shoulders')
})

test('garment outer edges expand independently to the left and right of the pose joints', () => {
  const frame = bodyFrame()
  const width = 100, height = 100, alpha = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const neck = y < 31
    alpha.fill(255, y * width + (neck ? 39 : 13), y * width + (neck ? 57 : 77))
  }
  const fitted = fitBody({ ...frame, personMask: { width, height, alpha } }, p => p)!
  const xMin = Math.min(...fitted.outline.map(p => p.x))
  const xMax = Math.max(...fitted.outline.map(p => p.x))
  assert.ok(xMin < fitted.right.x - 50, 'the left edge extends beyond the joint')
  assert.ok(xMax > fitted.left.x + 30, 'the right edge extends beyond the joint')
  assert.ok((fitted.right.x - xMin) > (xMax - fitted.left.x), 'asymmetry is preserved')
  const mirrored = fitBody({ ...frame, personMask: { width, height, alpha } }, project)!
  assert.ok(Math.abs(Math.min(...mirrored.outline.map(p => p.x)) - (720 - xMax)) < .001)
})

test('the bow tie scales with the sampled neck width', () => {
  const frame = bodyFrame()
  const fit = (left: number, right: number) => {
    const width = 100, height = 100, alpha = new Uint8Array(width * height)
    for (let y = 0; y < height; y++) alpha.fill(255, y * width + (y < 35 ? left : 15), y * width + (y < 35 ? right : 85))
    return fitBody({ ...frame, personMask: { width, height, alpha } }, p => p)!
  }
  const narrow = fit(44, 54), wide = fit(40, 61)
  assert.ok(wide.neckWidth > narrow.neckWidth)
  assert.ok(wide.collarAt(.4, .35).x < narrow.collarAt(.4, .35).x)
  assert.ok(wide.collarAt(0, .35).y > wide.neck.y)
})

test('pose ears and mouth lead the collar above the shoulder joints without a face mesh', () => {
  const width = 100, height = 100, alpha = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const extent = y < 30 ? 7 : Math.min(31, 7 + (y - 30) * 2.4)
    alpha.fill(255, y * width + Math.round(54 - extent), y * width + Math.round(54 + extent))
  }
  const frame = bodyFrame(), body = frame.body!
  for (const [i, x, y] of [[7,.48,.18],[8,.61,.19],[9,.52,.23],[10,.57,.23],[11,.73,.42],[12,.31,.42]]) {
    body[i!] = { ...body[i!]!, x:x!, y:y! }
  }
  body[11]!.visibility = .16
  const tracked = { ...frame, face: [], personMask: { width, height, alpha } }
  const fit = fitBody(tracked, p => p)!
  assert.ok(fit.neck.y < fit.left.y - 47 && fit.neck.x > frame.width * .52)
  const above = fit.outline.filter(p => p.y < fit.left.y - 12)
  assert.ok(above.length >= 10, 'the neck-to-shoulder contour is sampled above both joints')
  assert.ok(Math.min(...above.map(p => p.x)) < fit.right.x - 20)
  assert.ok(Math.max(...above.map(p => p.x)) > fit.left.x + 30)
  assert.equal(fitBody({ ...tracked, personMask: { width, height, alpha: new Uint8Array(width * height) } }, p => p), undefined)
})

test('the sleeve still covers the upper arm when a wrist goes out of view', () => {
  const frame = bodyFrame()
  frame.body![15]!.visibility = .05
  const fit = fitBody(frame, p => p)!
  assert.ok(fit.arms[0]!.visible && fit.arms[0]!.outline.length >= 8)
  assert.deepEqual(fit.arms[0]!.cuff, [])
  assert.equal(fit.arms[1]!.cuff.length, 2)
})

test('the impact has a visible foreground slash and label, with reduced-motion flash suppression',()=>{
  const strong=conanImpact(180)
  assert.ok(strong.glow>.9&&strong.slash>.9&&strong.label>.9)
  assert.ok(conanImpact(0).flash>0)
  assert.equal(conanImpact(1500).label,0)
  const reduced=conanImpact(180,true)
  assert.equal(reduced.flash,0);assert.equal(reduced.slash,0);assert.ok(reduced.glow>0)
  assert.equal(conanImpact(10000).glow,0)
})
