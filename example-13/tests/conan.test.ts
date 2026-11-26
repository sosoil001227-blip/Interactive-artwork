import test from 'node:test'
import assert from 'node:assert/strict'
import { ConanGesture, conanLines, conanSceneMs, leftIndexAtCamera } from '../src/conanGesture.ts'
import type { Landmark, TrackedHand, TrackingFrame } from '../src/tracking.ts'
import { sampleFrame } from '../src/rig.ts'

function hand(x = .5, y = .5, label: TrackedHand['label'] = 'Left'): TrackedHand {
  const landmarks = Array.from({ length:21 }, () => ({x,y,z:0}))
  landmarks[0] = {x,y:y+.08,z:0}
  landmarks[4] = {x:x-.03,y:y+.005,z:0}
  for (let finger=0;finger<4;finger++) for(let joint=0;joint<4;joint++) {
    landmarks[5+finger*4+joint] = {x:x+(finger-1.5)*.025,y:y-joint*.03,z:0}
  }
  return { label, landmarks, worldLandmarks:[] }
}
function frame(now:number,hands:TrackedHand[]=[]): TrackingFrame { return {...sampleFrame,timestamp:now,hands} }
function fingerAt(x:number,y:number,label:TrackedHand['label']='Left') {
  const h=hand(x,y,label)
  h.landmarks[8]={x,y,z:0};h.landmarks[12]={x:x+.3,y:y+.3,z:0};h.landmarks[4]={x:x-.02,y:y+.005,z:0}
  return h
}
function glasses(gesture:ConanGesture,start=0) {
  const face=sampleFrame.face, nose=face[168]!, height=face[152]!.y-face[10]!.y
  for(const [dt,offset] of [[0,.08],[80,.04],[160,-.025]]) {
    const now=start+dt!;gesture.update(frame(now,[fingerAt(nose.x,nose.y+height*offset!)]),now)
  }
}
function collar(gesture:ConanGesture,start=300) {
  const chin=sampleFrame.face[152]!,height=chin.y-sampleFrame.face[10]!.y
  for(const dt of [0,90,180]) {const now=start+dt;gesture.update(frame(now,[fingerAt(chin.x,chin.y+height*.10)]),now)}
}
function pointing(label:TrackedHand['label']='Left'):TrackedHand {
  const h=hand(.3,.5,label)
  const world:Landmark[]=Array.from({length:21},()=>({x:0,y:0,z:0}))
  world[0]={x:0,y:0,z:0}
  for(let finger=0;finger<4;finger++) {
    const base=5+finger*4,x=(finger-1.5)*.018
    world[base]={x,y:.07,z:0};world[base+1]={x,y:.09,z:0}
    world[base+2]={x,y:.075,z:-.005};world[base+3]={x,y:.065,z:0}
  }
  world[6]={x:world[5]!.x,y:.075,z:-.025}
  world[7]={x:world[5]!.x,y:.08,z:-.050}
  world[8]={x:world[5]!.x,y:.085,z:-.080}
  h.worldLandmarks=world
  return h
}

test('pushing glasses up equips once while a stationary or horizontal touch does not',()=>{
  const gesture=new ConanGesture(),nose=sampleFrame.face[168]!
  for(const now of [0,100,200])gesture.update(frame(now,[fingerAt(nose.x,nose.y)]),now)
  assert.equal(gesture.glassesAt,undefined)
  gesture.reset();glasses(gesture)
  assert.notEqual(gesture.glassesAt,undefined)
  const at=gesture.glassesAt
  glasses(gesture,400)
  assert.equal(gesture.glassesAt,at)
  assert.equal(gesture.status(560).stage,'collar')
})

test('collar touching adds ribbon and jacket and can happen before glasses',()=>{
  const gesture=new ConanGesture()
  collar(gesture,0)
  assert.equal(gesture.suitAt,180)
  assert.equal(gesture.status(180).stage,'glasses')
  glasses(gesture,300)
  assert.equal(gesture.status(460).stage,'point')
})

test('only the user left index extended toward the lens triggers the pointing pose',()=>{
  assert.equal(leftIndexAtCamera(pointing()),true)
  assert.equal(leftIndexAtCamera(pointing('Right')),false)
  assert.equal(leftIndexAtCamera(hand()),false,'an open palm is not pointing')
  const sideways=pointing()
  for(const i of [6,7,8])sideways.worldLandmarks[i]={...sideways.worldLandmarks[i]!,z:0,y:.07+(i-5)*.025}
  assert.equal(leftIndexAtCamera(sideways),false)
  const fist=pointing();fist.worldLandmarks[8]={...fist.worldLandmarks[5]!}
  assert.equal(leftIndexAtCamera(fist),false)
})

test('both clothing gestures and a stable left point are required for the news reveal',()=>{
  const gesture=new ConanGesture()
  for(const now of [0,100,200])gesture.update(frame(now,[pointing()]),now)
  assert.equal(gesture.reveals,0)
  gesture.reset();glasses(gesture);collar(gesture)
  for(const now of [1000,1080])gesture.update(frame(now,[pointing()]),now)
  assert.equal(gesture.reveals,0)
  gesture.update(frame(1160,[pointing()]),1160)
  assert.equal(gesture.reveals,1)
  assert.equal(gesture.status(1160).stage,'reveal')
  const end=1160+conanSceneMs
  for(let now=1200;now<=end+500;now+=100)gesture.update(frame(now,[pointing()]),now)
  assert.equal(gesture.reveals,1,'holding a pose must not replay the narration')
  gesture.update(frame(end+600),end+600)
  for(const dt of [650,750,830])gesture.update(frame(end+dt,[pointing()]),end+dt)
  assert.equal(gesture.reveals,2)
})

test('missing tracking does not complete an earlier touch and reset removes the outfit and reveal',()=>{
  const gesture=new ConanGesture(),nose=sampleFrame.face[168]!,height=sampleFrame.face[152]!.y-sampleFrame.face[10]!.y
  gesture.update(frame(0,[fingerAt(nose.x,nose.y+height*.08)]),0)
  gesture.update(frame(1000,[fingerAt(nose.x,nose.y-height*.04)]),1000)
  assert.equal(gesture.glassesAt,undefined)
  gesture.reset();glasses(gesture);collar(gesture)
  gesture.reset()
  assert.deepEqual(gesture.status(10000),{stage:'glasses',glasses:false,suit:false,hands:0,leftPoint:false,reveals:0})
})

test('the on-screen narration uses the exact requested Conan lines',()=>{
  assert.equal(conanLines.join(' '),'내 이름은 코난, 탐정이죠. 범인은 바로 당신이야! 진실은 언제나 하나!')
})
