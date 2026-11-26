import test from 'node:test'
import assert from 'node:assert/strict'
import { FaceWindow, faceMask, handCameraMask } from '../src/face-window.ts'
import { FaceCamera } from '../src/face-camera.ts'
import { pose } from './fixtures.ts'

test('face oval shares cover pixels in portrait and landscape, with no full-frame fallback', () => {
  const box = { x:.35, y:.2, width:.3, height:.4 }
  const landscape = faceMask(box,1280,720,1440,900)!
  assert.equal(landscape.x,720)
  assert.ok(landscape.rx < 250 && landscape.ry < 220)
  const portrait = faceMask(box,1280,720,390,844)!
  assert.equal(portrait.x,195)
  assert.ok(portrait.ry < 210)
  assert.equal(faceMask({...box,width:NaN},1280,720,390,844),undefined)
  assert.equal(faceMask({...box,width:1},1280,720,390,844),undefined)
  assert.equal(faceMask(box,0,0,390,844),undefined)
})

test('missing/stale faces disappear; a displaced reacquired face does not sweep across the room', () => {
  const faces = new FaceWindow(), first = { x:.2,y:.2,width:.2,height:.3 }
  faces.update(first,1000); assert.deepEqual(faces.snapshot(1000),first)
  assert.equal(faces.snapshot(1301),undefined)
  const moved = {...first,x:.6};faces.update(moved,1500)
  assert.equal(faces.snapshot(1500)?.x,.6)
  faces.reset(); assert.equal(faces.snapshot(1501),undefined)
})

test('left and right hand cutouts reverse screen mirroring once, without revealing the whole camera',()=>{
  for(const x of [270,730]){
    const hand=pose(x,300),m=handCameraMask(hand,1000)!
    const xs=hand.points.map(p=>p.x),ys=hand.points.map(p=>p.y)
    assert.equal(m.x,1000-(Math.min(...xs)+Math.max(...xs))/2)
    assert.equal(m.y,(Math.min(...ys)+Math.max(...ys))/2)
    assert.ok(m.rx<100&&m.ry<150)
  }
  const bad=pose();bad.points[0]!.x=NaN;assert.equal(handCameraMask(bad,1000),undefined)
})

test('face worker allows one small frame, masks only a confirmed face, and rejects background/resize results',async()=>{
  const keys=['Worker','CSS','createImageBitmap','window','document','performance','location']
  const descriptors=keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)] as const)
  let now=1000,closed=0,captured=0
  const workers:MockWorker[]=[]
  class MockWorker {
    onmessage:((e:{data:unknown})=>void)|undefined;onerror:unknown;onmessageerror:unknown
    messages:Record<string,unknown>[]=[];terminated=false
    constructor(){workers.push(this)}
    postMessage(message:Record<string,unknown>){this.messages.push(message)}
    terminate(){this.terminated=true}
    emit(data:unknown){this.onmessage?.({data})}
  }
  const classes=new Set<string>(),style={maskImage:'',setProperty() {}}
  const video={videoWidth:1280,videoHeight:720,readyState:2,currentTime:1,style,classList:{
    toggle(name:string,value:boolean){if(value)classes.add(name);else classes.delete(name)},remove(name:string){classes.delete(name)}
  }} as unknown as HTMLVideoElement
  Object.defineProperties(globalThis,{
    Worker:{value:MockWorker,configurable:true},CSS:{value:{supports:()=>true},configurable:true},
    createImageBitmap:{value:async(_video:unknown,options:{resizeWidth:number;resizeHeight:number})=>{captured++;assert.equal(options.resizeWidth,320);assert.equal(options.resizeHeight,180);return{close(){closed++}}},configurable:true},
    window:{value:{setTimeout,clearTimeout},configurable:true},document:{value:{hidden:false},configurable:true},
    performance:{value:{now:()=>now},configurable:true},
    location:{value:{href:'https://localhost:5174/example-11/'},configurable:true},
  })
  const camera=new FaceCamera(video)
  try{
    camera.start();const worker=workers[0]!;worker.emit({type:'ready'})
    camera.update(now,1440,900);camera.update(now+1,1440,900)
    await new Promise(resolve=>setImmediate(resolve));assert.equal(captured,1);assert.equal(classes.has('face-visible'),false)
    worker.emit({type:'result',timestamp:now,box:{x:.35,y:.2,width:.3,height:.4}})
    camera.update(now+2,1440,900);assert.equal(classes.has('face-visible'),true);assert.match(style.maskImage,/radial-gradient\(ellipse/)
    now+=200;video.currentTime++;camera.update(now,1440,900);await Promise.resolve()
    camera.suspend();assert.equal(classes.has('face-visible'),false)
    worker.emit({type:'result',timestamp:now-200,box:{x:.1,y:.1,width:.6,height:.6}})
    camera.update(now+1,1440,900);assert.equal(classes.has('face-visible'),false)
    now+=200;video.currentTime++;camera.update(now,1440,900);camera.close();await Promise.resolve()
    assert.equal(classes.has('face-visible'),false);assert.equal(worker.terminated,true);assert.equal(closed,1)
  }finally{
    camera.close()
    for(const[key,descriptor]of descriptors){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key)}
  }
})
