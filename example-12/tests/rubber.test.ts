import test from 'node:test'
import assert from 'node:assert/strict'
import { Rubber } from '../src/rubber.ts'
import { boundary, cameraToScreen, distance, FACE_CORE, faceInteractionLifetime, faceVisibility, FaceTracker, materialToScreen, OVAL, readFace, screenToCamera } from '../src/geometry.ts'
import type { Face, Point } from '../src/geometry.ts'
import type { Hand } from '../src/gestures.ts'

const face:Face={center:{x:400,y:300},radius:120,contour:Array.from({length:36},(_,i)=>({x:400+120*Math.sin(i/36*Math.PI*2),y:300-165*Math.cos(i/36*Math.PI*2)})),cheeks:[{x:350,y:310},{x:450,y:310}],seen:0}
const hand=(id:number,pinch:Point,closed=true,roll=0):Hand=>({id,pinch,closed,roll,points:[],seen:0,label:String(id)})
const near=(a:Point,b:Point,tolerance=.05)=>assert.ok(distance(a,b)<tolerance,`${JSON.stringify(a)} != ${JSON.stringify(b)}`)

test('mirrored cover mapping round-trips landscape and portrait viewports',()=>{
  for(const [w,h] of [[1200,600],[390,750]])for(const p of [{x:.2,y:.3},{x:.8,y:.7}])near(screenToCamera(cameraToScreen(p,1280,720,w!,h!),1280,720,w!,h!),p,.00001)
})
test('face oval is smooth across the closed Catmull–Rom seam',()=>{
  near(boundary(face,0),boundary(face,1),.000001)
  const a=boundary(face,-.00001),b=boundary(face,0),c=boundary(face,.00001)
  near({x:b.x-a.x,y:b.y-a.y},{x:c.x-b.x,y:c.y-b.y},.00001)
})
test('a grabbed material point tracks the fingertip exactly during a long stretch',()=>{
  const rubber=new Rubber();rubber.update([],face,1/60)
  const source=materialToScreen({x:.3,y:.1},face)
  rubber.update([hand(0,source)],face,1/60);assert.equal(rubber.active,1)
  const target={x:source.x+390,y:source.y-170}
  rubber.update([hand(0,target)],face,1/60)
  near(rubber.deform(rubber.grips[0]!.material,face),target)
  assert.equal(rubber.pick({x:-2000,y:-2000}),undefined)
})
test('two overlapping deformation fields each retain their own attachment',()=>{
  const rubber=new Rubber();rubber.update([],face,1/60)
  const a=materialToScreen({x:.25,y:-.4},face),b=materialToScreen({x:.25,y:.4},face)
  rubber.update([hand(0,a),hand(1,b)],face,1/60);assert.equal(rubber.active,2)
  const ta={x:a.x-210,y:a.y-80},tb={x:b.x+240,y:b.y+45}
  for(let i=0;i<30;i++)rubber.update([hand(0,ta),hand(1,tb)],face,1/60)
  near(rubber.deform(rubber.grips[0]!.material,face),ta)
  near(rubber.deform(rubber.grips[1]!.material,face),tb)
  assert.ok(Math.abs(rubber.twist)>.1)
})
test('release produces an overshoot and converges to the original face',()=>{
  const rubber=new Rubber();rubber.update([],face,1/60)
  const source=materialToScreen({x:.2,y:.2},face)
  rubber.update([hand(0,source)],face,1/60)
  rubber.update([hand(0,{x:source.x+240,y:source.y})],face,1/60)
  let overshoot=false
  for(let i=0;i<240;i++){rubber.update([],face,1/60);if(rubber.grips.some(g=>g.offset.x<0))overshoot=true}
  assert.equal(overshoot,true);assert.equal(rubber.active,0);assert.equal(rubber.settling,false)
  near(rubber.deform({x:.2,y:.2},face),source)
})
test('two-hand twist unwraps through ±π without flipping and returns after release',()=>{
  const rubber=new Rubber();rubber.update([],face,1/60)
  const a={x:350,y:300},b={x:450,y:300}
  rubber.update([hand(0,a),hand(1,b)],face,1/60)
  for(let i=1;i<=150;i++){
    const angle=i/150*Math.PI*2.2,dx=Math.cos(angle)*90,dy=Math.sin(angle)*90
    rubber.update([hand(0,{x:400-dx,y:300-dy}),hand(1,{x:400+dx,y:300+dy})],face,1/60)
  }
  assert.ok(rubber.twist>Math.PI*2)
  assert.ok(rubber.positions.every(Number.isFinite))
  for(let i=0;i<300;i++)rubber.update([],face,1/60)
  assert.ok(Math.abs(rubber.twist)<.001)
})
test('reset discards attachments, spring velocity and accumulated rotation',()=>{
  const rubber=new Rubber();rubber.update([],face,1/60);rubber.update([hand(0,face.center)],face,1/60)
  rubber.twist=4;rubber.reset();assert.equal(rubber.active,0);assert.equal(rubber.settling,false);assert.equal(rubber.twist,0)
})

test('a held pinch waits outside the face and attaches when it reaches the face',()=>{
  const rubber=new Rubber(),air={x:940,y:90}
  rubber.update([hand(0,air)],face,1/60);assert.equal(rubber.active,0)
  rubber.update([hand(0,face.center)],face,1/60);assert.equal(rubber.active,1)
  const material={...rubber.grips[0]!.material},moved={x:650,y:140}
  rubber.update([hand(0,moved)],face,1/60)
  near(rubber.grips[0]!.material,material,.00001)
  near(rubber.deform(material,face),moved)
})

test('hand occlusion retains the last confirmed face through pinch acquisition',()=>{
  const lastFace={...face,seen:1000},now=2000,age=now-lastFace.seen
  assert.ok(age>faceInteractionLifetime(false))
  assert.ok(age<faceInteractionLifetime(true))
  assert.equal(faceVisibility(lastFace,true,now),1)
  const rubber=new Rubber();rubber.update([hand(0,lastFace.center)],lastFace,1/60)
  rubber.update([hand(0,{x:620,y:160})],lastFace,1/60)
  assert.equal(rubber.active,1);assert.ok(rubber.stretch>100)
  assert.equal(faceVisibility(lastFace,rubber.settling,now),1)
  assert.equal(faceVisibility(lastFace,true,7200),0)
})

test('short hand-result gaps hold the face while opening the fingers releases immediately',()=>{
  const rubber=new Rubber();rubber.update([hand(0,face.center)],face,1/60)
  const attached={...rubber.grips[0]!.material}
  rubber.update([hand(0,{x:620,y:160})],face,1/60)
  for(let i=0;i<12;i++)rubber.update([],face,1/60)
  assert.equal(rubber.active,1)
  rubber.update([hand(0,{x:700,y:110})],face,1/60)
  near(rubber.grips[0]!.material,attached,.0001)
  near(rubber.deform(attached,face),{x:700,y:110})
  rubber.update([hand(0,{x:700,y:110},false)],face,1/60)
  assert.equal(rubber.active,0)
})
test('forehead, both cheeks, temples and chin pick their exact full-face points',()=>{
  for(let i=0;i<12;i++){
    const rubber=new Rubber(),angle=i/12*Math.PI*2
    const material={x:Math.cos(angle)*FACE_CORE*.99,y:Math.sin(angle)*FACE_CORE*.99}
    const point=materialToScreen(material,face)
    rubber.update([hand(0,point)],face,1/60)
    assert.equal(rubber.active,1,`region ${i} was excluded`)
    near(rubber.grips[0]!.material,material,.003)
    const moved={x:point.x+160,y:point.y-100}
    rubber.update([hand(0,moved)],face,1/60)
    near(rubber.deform(rubber.grips[0]!.material,face),moved)
  }
})
test('two neighboring face pinches remain attached independently',()=>{
  const rubber=new Rubber(),a=materialToScreen({x:.15,y:.1},face),b=materialToScreen({x:.22,y:.1},face)
  rubber.update([hand(0,a),hand(1,b)],face,1/60);assert.equal(rubber.active,2)
  const ta={x:a.x-180,y:a.y-70},tb={x:b.x+190,y:b.y+80}
  rubber.update([hand(0,ta),hand(1,tb)],face,1/60)
  near(rubber.deform(rubber.grips[0]!.material,face),ta)
  near(rubber.deform(rubber.grips[1]!.material,face),tb)
})
test('a single face pinch twists by wrist rotation and releases elastically',()=>{
  const rubber=new Rubber(),point={x:430,y:280}
  rubber.update([hand(0,point,true,0)],face,1/60)
  for(let i=1;i<=60;i++)rubber.update([hand(0,point,true,i/60*Math.PI*1.5)],face,1/60)
  assert.ok(rubber.twist>Math.PI)
  near(rubber.deform(rubber.grips[0]!.material,face),point)
  for(let i=0;i<300;i++)rubber.update([],face,1/60)
  assert.ok(Math.abs(rubber.twist)<.001);assert.equal(rubber.settling,false)
})
test('the camera transition rim remains fixed under large stretches and twists',()=>{
  const rubber=new Rubber();rubber.update([hand(0,face.center)],face,1/60)
  rubber.update([hand(0,{x:900,y:50})],face,1/60);rubber.twist=7
  for(let i=0;i<24;i++){
    const p={x:Math.cos(i/24*Math.PI*2),y:Math.sin(i/24*Math.PI*2)}
    const result=rubber.deform(p,face)
    near(result,materialToScreen(p,face),.0001);assert.ok(Math.abs(result.z)<.0001)
  }
})
test('spring recovery stays visible through the neutral-position crossing',()=>{
  const rubber=new Rubber();rubber.update([hand(0,face.center)],face,1/60)
  rubber.update([hand(0,{x:640,y:300})],face,1/60)
  let crossings=0,previous=rubber.grips[0]!.offset.x
  for(let i=0;i<120;i++){
    rubber.update([],face,1/60)
    const current=rubber.grips[0]?.offset.x??0
    if(current*previous<0&&rubber.recovery>2){assert.ok(rubber.recovery>Math.abs(current));crossings++}
    previous=current
  }
  assert.ok(crossings>0)
})
test('all 478 landmarks and the entire oval survive screen mapping and stabilization',()=>{
  const points=Array.from({length:478},()=>({x:.5,y:.5,z:0}))
  OVAL.forEach((index,i)=>{points[index]={x:.5+Math.sin(i/36*Math.PI*2)*.17,y:.5-Math.cos(i/36*Math.PI*2)*.3,z:0}})
  points[50]={x:.43,y:.54,z:0};points[280]={x:.57,y:.54,z:0}
  for(const [w,h]of [[1280,720],[390,844]]){
    const mapped=readFace(points,1280,720,w!,h!,10)!
    assert.equal(mapped.landmarks!.length,478);assert.equal(mapped.contour.length,36)
    for(const index of [10,152,234,454,1,33,263])near(mapped.landmarks![index]!,cameraToScreen(points[index]!,1280,720,w!,h!),.0001)
    const tracker=new FaceTracker();tracker.update(points,1280,720,w!,h!,10)
    const next=tracker.update(points.map(p=>({...p,x:p.x+.001})),1280,720,w!,h!,60)!
    assert.equal(next.landmarks!.length,478);assert.ok(next.contour.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)))
  }
})
test('twisting has a closed back surface with thickness and finite geometry',()=>{
  const rubber=new Rubber();rubber.update([],face,1/60)
  const front=rubber.sides.findIndex(s=>s===1),back=rubber.sides.findIndex(s=>s===-1)
  assert.ok(front>=0&&back>front)
  assert.ok(rubber.depth[front]!>0&&rubber.depth[back]!<0)
  assert.ok(rubber.indices.reduce((max,index)=>Math.max(max,index),0)<65536)
  rubber.twist=6;rubber.rebuild(face)
  assert.ok(rubber.positions.every(Number.isFinite));assert.ok(rubber.depth.every(Number.isFinite))
  assert.ok(rubber.normals.every(Number.isFinite))
  assert.ok(rubber.depth.some((z,i)=>rubber.sides[i]===-1&&z>0))
})
