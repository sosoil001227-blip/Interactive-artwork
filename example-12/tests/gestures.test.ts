import test from 'node:test'
import assert from 'node:assert/strict'
import type { HandLandmarkerResult } from '@mediapipe/tasks-vision'
import { Hands } from '../src/gestures.ts'
import { Rubber } from '../src/rubber.ts'
import type { Face } from '../src/geometry.ts'

function result(input:{x:number;ratio:number;label:string;score?:number}[]):HandLandmarkerResult{
  const world=input.map(({ratio})=>{
    const p=Array.from({length:21},()=>({x:0,y:0,z:0}))
    p[9]={x:0,y:1,z:0};p[5]={x:-.4,y:.7,z:0};p[17]={x:.4,y:.7,z:0};p[4]={x:0,y:.4,z:0};p[8]={x:ratio,y:.4,z:0}
    return p
  })
  return {landmarks:world.map((points,i)=>points.map(p=>({x:input[i]!.x+p.x*.08,y:.5-p.y*.08,z:0}))),worldLandmarks:world,handedness:input.map(({label,score=1})=>[{categoryName:label,displayName:label,index:0,score}])}
}

test('pinch uses palm-relative 3D distance and hysteresis before releasing',()=>{
  const tracker=new Hands()
  const update=(ratio:number,now:number)=>tracker.update(result([{x:.5,ratio,label:'Left'}]),1280,720,1000,600,now)
  update(.2,0);assert.equal(tracker.snapshot(0)[0]!.closed,true)
  update(.4,40);assert.equal(tracker.snapshot(40)[0]!.closed,true)
  update(.55,80);assert.equal(tracker.snapshot(80)[0]!.closed,false)
  update(.4,120);assert.equal(tracker.snapshot(120)[0]!.closed,false)
})

test('visible fingertip contact is a pinch even with a large reconstructed depth error',()=>{
  const tracker=new Hands(),data=result([{x:.5,ratio:.2,label:'Left'}])
  data.landmarks[0]![8]!.x=data.landmarks[0]![4]!.x+.002
  data.worldLandmarks[0]![4]!.z=-1;data.worldLandmarks[0]![8]!.z=1
  tracker.update(data,1280,720,1000,600,0)
  assert.equal(tracker.snapshot(0)[0]!.closed,true)
  const open=result([{x:.5,ratio:.8,label:'Left'}])
  tracker.update(open,1280,720,1000,600,40)
  assert.equal(tracker.snapshot(40)[0]!.closed,false)
})
test('model result reordering preserves material-control identities',()=>{
  const tracker=new Hands(),left={x:.7,ratio:.2,label:'Left'},right={x:.3,ratio:.2,label:'Right'}
  tracker.update(result([left,right]),1280,720,1000,600,0)
  const before=tracker.snapshot(0).map(h=>[h.id,h.label])
  tracker.update(result([right,left]),1280,720,1000,600,40)
  assert.deepEqual(tracker.snapshot(40).map(h=>[h.id,h.label]),before)
})

test('one pinching hand keeps its identity while crossing the camera and never duplicates',()=>{
  const tracker=new Hands()
  tracker.update(result([{x:.1,ratio:.2,label:'Left'}]),640,480,960,720,0)
  const id=tracker.snapshot(0)[0]!.id
  for(const [i,x] of [.41,.16,.7,.1,.9,.5].entries()){
    const now=(i+1)*40
    tracker.update(result([{x,ratio:.2,label:'Left'}]),640,480,960,720,now)
    const hands=tracker.snapshot(now)
    assert.equal(hands.length,1,'one physical hand must not become two cached slots')
    assert.equal(hands[0]!.id,id,'crossing the image must not release the face attachment')
    assert.equal(hands[0]!.closed,true)
  }
})
test('lost hands expire and cannot retain a closed pinch',()=>{
  const tracker=new Hands();tracker.update(result([{x:.5,ratio:.1,label:'Left'}]),1280,720,1000,600,0)
  tracker.update(result([]),1280,720,1000,600,40)
  assert.equal(tracker.snapshot(170).length,1);assert.equal(tracker.snapshot(181).length,0)
  tracker.reset();assert.equal(tracker.snapshot(0).length,0)
})
test('low-confidence and malformed detections cannot attach to the face',()=>{
  const tracker=new Hands();tracker.update(result([{x:.5,ratio:.1,label:'Left',score:.2}]),1280,720,1000,600,0)
  assert.equal(tracker.snapshot(0).length,0)
  const malformed=result([{x:.5,ratio:.1,label:'Left'}]);malformed.landmarks[0]![4]!.x=NaN
  tracker.update(malformed,1280,720,1000,600,40);assert.equal(tracker.snapshot(40).length,0)
})

test('left and right hand results simultaneously drive two face attachments',()=>{
  const tracker=new Hands(),rubber=new Rubber()
  const face:Face={center:{x:400,y:300},radius:120,contour:Array.from({length:36},(_,i)=>({x:400+120*Math.sin(i/36*Math.PI*2),y:300-165*Math.cos(i/36*Math.PI*2)})),cheeks:[{x:350,y:310},{x:450,y:310}],seen:0}
  tracker.update(result([{x:.45,ratio:.2,label:'Left'},{x:.55,ratio:.2,label:'Right'}]),1280,720,800,600,0)
  rubber.update(tracker.snapshot(0),face,1/60);assert.equal(rubber.active,2)
  tracker.update(result([{x:.65,ratio:.2,label:'Right'},{x:.35,ratio:.2,label:'Left'}]),1280,720,800,600,40)
  const tracked=tracker.snapshot(40);rubber.update(tracked,face,1/60)
  assert.equal(rubber.active,2);assert.equal(new Set(tracked.map(h=>h.label)).size,2)
  for(const grip of rubber.grips){const target=tracked.find(h=>h.id===grip.id)!.pinch,point=rubber.deform(grip.material,face);assert.ok(Math.hypot(point.x-target.x,point.y-target.y)<.05)}
})
