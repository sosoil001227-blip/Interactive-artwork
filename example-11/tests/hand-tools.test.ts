import test from 'node:test'
import assert from 'node:assert/strict'
import { HandTools } from '../src/hand-tools.ts'
import { Conductor } from '../src/music.ts'
import { pose } from './fixtures.ts'

test('bounded hand patches mirror the existing video, mask the room, and disappear independently',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'devicePixelRatio')
  Object.defineProperty(globalThis,'devicePixelRatio',{value:2,configurable:true})
  let copies=0;const composites:string[]=[],alphas:number[]=[]
  function canvas(){
    const canvas={width:0,height:0,style:{},hidden:true,getContext:()=>ctx}
    const ctx=new Proxy({} as Record<string,unknown>,{
      get(target,key:string){if(key in target)return target[key];return(...args:unknown[])=>{
        args.forEach(value=>{if(typeof value==='number')assert.ok(Number.isFinite(value))})
        if(key==='drawImage')copies++
        if(key.includes('Gradient'))return{addColorStop(){}}
      }},
      set(target,key:string,value){if(key==='globalCompositeOperation')composites.push(value as string);if(key==='globalAlpha')alphas.push(value as number);target[key]=value;return true}
    })
    return canvas as unknown as HTMLCanvasElement
  }
  const left=canvas(),right=canvas(),tools=new HandTools(left,right),hands={left:pose(),right:pose(700,300,'Right')}
  const video={videoWidth:1280,videoHeight:720,readyState:4,currentTime:1} as HTMLVideoElement
  const music=new Conductor().update(hands.right,1000,700)
  try{
    tools.draw(video,hands,music,1000,700)
    assert.equal(left.hidden,false);assert.equal(right.hidden,false);assert.equal(copies,2)
    assert.ok([left,right].every(c=>c.width<=960&&c.height<=960));assert.deepEqual(composites,['destination-in','destination-in']);assert.deepEqual(alphas,[.28,.28])
    tools.draw(video,hands,music,1000,700);assert.equal(copies,2,'the same video and landmarks do not redraw')
    tools.draw(video,{right:hands.right},music,1000,700);assert.equal(left.hidden,true);assert.equal(right.hidden,false)
    tools.hide();assert.equal(right.hidden,true)
    tools.draw(video,hands,music,1000,700);assert.equal(left.hidden,false);assert.equal(right.hidden,false)
    tools.draw(video,{},music,1000,700);assert.equal(left.hidden,true);assert.equal(right.hidden,true)
  }finally{tools.hide();if(descriptor)Object.defineProperty(globalThis,'devicePixelRatio',descriptor);else Reflect.deleteProperty(globalThis,'devicePixelRatio')}
})
