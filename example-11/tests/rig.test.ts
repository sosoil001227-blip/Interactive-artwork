import test from 'node:test'
import assert from 'node:assert/strict'
import { MarionetteRig } from '../src/rig.ts'
import { pose } from './fixtures.ts'
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y)

test('five strings independently control arms, head, body lean and a grounded knee pose',()=>{
  for(const [finger,tip] of [4,8,12,16,20].entries()) {
    const rig=new MarionetteRig(),hand=pose(),initial=rig.update(hand,1/60,1000,700)
    hand.points[tip]!.y-=45
    let moved=initial
    for(let i=0;i<90;i++){hand.seen+=16;moved=rig.update(hand,1/60,1000,700)}
    assert.equal(moved.anchors?.length,5);assert.equal(moved.attachments.length,5)
    if(finger===0){assert.ok(distance(moved.wrists[0],initial.wrists[0])>20);assert.ok(distance(moved.wrists[1],initial.wrists[1])<1)}
    if(finger===1){assert.ok(distance(moved.wrists[1],initial.wrists[1])>20);assert.ok(distance(moved.wrists[0],initial.wrists[0])<1)}
    if(finger===2){assert.ok(Math.abs(moved.tilt-initial.tilt)>.05);assert.ok(distance(moved.neck,initial.neck)<1)}
    if(finger===3)assert.ok(Math.abs(moved.bodyTilt)>.04)
    if(finger===4)assert.ok(moved.hip.y>initial.hip.y+2)
  }
})

test('horizontal hand movement produces walking, alternating feet and stationary floor contacts',()=>{
  const rig=new MarionetteRig(),hand=pose();let previous=rig.update(hand,1/60,1200,800)
  let leftAir=0,rightAir=0,contacts=0
  for(let i=1;i<190;i++){
    const dx=1.8;hand.center.x+=dx;hand.points.forEach(p=>p.x+=dx);hand.seen+=16
    const output=rig.update(hand,1/60,1200,800),floor=800*.84-31*output.scale
    if(output.walking){
      if(!output.planted[0])leftAir++;if(!output.planted[1])rightAir++
      for(let side=0;side<2;side++)if(output.planted[side]&&previous.planted[side]){
        assert.ok(Math.abs(output.ankles[side]!.y-floor)<.01)
        assert.ok(distance(output.ankles[side]!,previous.ankles[side]!)<.01);contacts++
      }
    }
    previous=output
  }
  assert.ok(leftAir>20&&rightAir>20&&contacts>50)
  assert.ok(previous.hip.x>1200*.47+100)
})

test('connected neck and fixed-length wooden limb bones survive combined extreme poses',()=>{
  const rig=new MarionetteRig(),hand=pose();rig.update(hand,1/60,1000,700)
  ;[4,8,12,16,20].forEach((tip,i)=>hand.points[tip]!.y+=i%2?130:-130)
  for(let i=0;i<100;i++){
    hand.seen+=16;const output=rig.update(hand,1/60,1000,700)
    assert.ok(Math.abs(distance(output.neck,output.head)-36*output.scale)<.01)
    for(let side=0;side<2;side++){
      assert.ok(Math.abs(distance(output.shoulders[side]!,output.elbows[side]!)-64*output.scale)<.01)
      assert.ok(Math.abs(distance(output.elbows[side]!,output.wrists[side]!)-64*output.scale)<.01)
      assert.ok(Math.abs(distance(output.hips[side]!,output.knees[side]!)-98*output.scale)<.01)
      assert.ok(Math.abs(distance(output.knees[side]!,output.ankles[side]!)-98*output.scale)<.01)
    }
  }
})

test('a stopped hand holds its acting pose; loss and reacquisition cannot snap back to neutral',()=>{
  const rig=new MarionetteRig(),hand=pose();rig.update(hand,1/60,1000,700)
  hand.points[4]!.y-=65;hand.points[12]!.y-=45
  let output=rig.update(hand,1/60,1000,700)
  for(let i=0;i<120;i++){hand.seen+=16;output=rig.update(hand,1/60,1000,700)}
  const held=output
  for(let i=0;i<90;i++)output=rig.update(undefined,1/60,1000,700)
  assert.ok(distance(output.wrists[0],held.wrists[0])<.1);assert.ok(distance(output.head,held.head)<.1)
  const acquired=rig.update(pose(500,300,'Left',10000),1/60,1000,700)
  assert.ok(distance(acquired.wrists[0],output.wrists[0])<.2);assert.ok(distance(acquired.head,output.head)<.2)
})

test('orientation changes replant the feet at the new floor without losing articulated proportions',()=>{
  const rig=new MarionetteRig(),hand=pose();rig.update(hand,1/60,1440,900)
  for(const [width,height]of [[390,844],[844,390],[1440,900]]){
    const p=rig.update(undefined,1/60,width!,height!),floor=height!*.84-31*p.scale
    assert.ok(p.ankles.every(foot=>Math.abs(foot.y-floor)<.01))
    assert.ok(Math.abs(distance(p.neck,p.head)-36*p.scale)<.01)
  }
})

test('shorter bodice and neck stay connected while the whole gown remains inside the curtain opening',()=>{
  for(const[width,height]of [[1440,1000],[390,844]]){
    const rig=new MarionetteRig(),hand=pose(width*.4,height*.3)
    rig.update(hand,1/60,width,height)
    for(const direction of [-1,1]){
      hand.center.x+=direction*width*2;hand.points.forEach(p=>p.x+=direction*width*2)
      let p=rig.update(hand,1/60,width,height)
      for(let i=0;i<180;i++){hand.seen+=16;p=rig.update(hand,1/60,width,height)}
      assert.ok(Math.abs(distance(p.neck,p.hip)-101*p.scale)<.01)
      assert.ok(p.hip.x-83*p.scale>=width*.16-.01)
      assert.ok(p.hip.x+83*p.scale<=width*.84+.01)
    }
  }
})
