import test from 'node:test'
import assert from 'node:assert/strict'
import { OperaAudio } from '../src/audio.ts'
import { Conductor } from '../src/music.ts'
import { MELODY, midiFrequency } from '../src/song.ts'
import { pose } from './fixtures.ts'
function environment(){
  let created=0,disconnected=0
  const sources:any[]=[],parameters:any[]=[]
  const parameter=()=>{const p={value:0,calls:0,cancelScheduledValues(){},setTargetAtTime(value:number){this.value=value;this.calls++},setValueAtTime(value:number){this.value=value;this.calls++},exponentialRampToValueAtTime(value:number){this.value=value;this.calls++}};parameters.push(p);return p}
  const node=()=>{created++;return{connections:[] as unknown[],connect(n:unknown){this.connections.push(n)},disconnect(){disconnected++}}}
  const source=()=>{const s={...node(),onended:null as (()=>void)|null,started:false,stopped:false,start(){this.started=true},stop(){this.stopped=true}};sources.push(s);return s}
  const ctx={state:'suspended',currentTime:1,sampleRate:48000,destination:node(),createGain:()=>({...node(),gain:parameter()}),
    createOscillator:()=>Object.assign(source(),{frequency:parameter(),type:'',setPeriodicWave(){} }),createPeriodicWave:(real:Float32Array,imag:Float32Array)=>({real,imag}),
    createBiquadFilter:()=>({...node(),frequency:parameter(),Q:parameter(),type:''}),
    createDynamicsCompressor:()=>({...node(),threshold:parameter(),knee:parameter(),ratio:parameter()}),createDelay:()=>({...node(),delayTime:parameter()}),
    createBuffer:(_n:number,length:number)=>({getChannelData:()=>new Float32Array(length)}),createBufferSource:()=>Object.assign(source(),{buffer:null,loop:false}),
    async resume(){this.state='running'},async suspend(){this.state='suspended'},async close(){this.state='closed'}}
  return{ctx,sources,parameters,get created(){return created},get disconnected(){return disconnected}}
}
function music(){const c=new Conductor();let state=c.update(pose(700,220,'Right',1000),1000,700);for(let i=1;i<20;i++)state=c.update(pose(700+Math.sin(i/5)*90,220,'Right',1000+i*33),1000+i*33,700);return state}

test('formant vocal follows score pitch and vowels, with an independent fixed-gain accompaniment',async()=>{
 const env=environment(),audio=new OperaAudio(()=>env.ctx as unknown as AudioContext)
 try{
  await audio.start();const state=music();assert.ok(state.active)
  audio.update({...state,noteIndex:4,midi:69,frequency:midiFrequency(69),vowel:'ah',volume:.9,energy:.8})
  const inspect=audio as unknown as {carrier:OscillatorNode;vocal:GainNode;backing:GainNode;formants:BiquadFilterNode[];wet:GainNode;feedback:GainNode}
  assert.equal(inspect.carrier.frequency.value,440);assert.deepEqual(inspect.formants.map(n=>n.frequency.value),[800,1150,2800])
  const accompaniment=inspect.backing.gain.value;assert.equal(accompaniment,.7)
  const high=inspect.vocal.gain.value
  audio.update({...state,noteIndex:4,midi:69,frequency:440,vowel:'ah',volume:.2,energy:.8})
  assert.ok(inspect.vocal.gain.value<high*.3);assert.equal(inspect.backing.gain.value,accompaniment);assert.equal(inspect.carrier.frequency.value,440)
  audio.setEcho(false);assert.equal(inspect.wet.gain.value,0);assert.equal(inspect.feedback.gain.value,0)
  audio.setEcho(true);assert.ok(inspect.wet.gain.value>0&&inspect.feedback.gain.value<1)
 }finally{audio.close()}
})

test('pausing gates both music branches; unchanged frames cannot accumulate nodes or automation',async()=>{
 const env=environment(),audio=new OperaAudio(()=>env.ctx as unknown as AudioContext)
 try{
  await audio.start();const state={...music(),noteIndex:0,frequency:midiFrequency(MELODY[0]!.midi),energy:.8,volume:.7};audio.update(state)
  const created=env.created,calls=env.parameters.reduce((n,p)=>n+p.calls,0)
  for(let i=0;i<180;i++)audio.update(state)
  assert.equal(env.created,created);assert.equal(env.parameters.reduce((n,p)=>n+p.calls,0),calls)
  audio.update({...state,active:false})
  const inspect=audio as unknown as {vocal:GainNode;backing:GainNode}
  assert.equal(inspect.vocal.gain.value,0);assert.equal(inspect.backing.gain.value,0)
  audio.suspend();assert.equal(env.ctx.state,'suspended');await audio.start();assert.equal(env.created,created)
 }finally{audio.close()}
})

test('opening ovation is preserved and all sustained/percussive sources are released',async()=>{
 const env=environment(),audio=new OperaAudio(()=>env.ctx as unknown as AudioContext)
 try{
  await audio.start();const before=env.sources.length;audio.ovation();assert.equal(env.sources.length-before,56)
  audio.setEnabled(false);const current=env.sources.length;audio.ovation();assert.equal(env.sources.length,current)
  audio.close();assert.ok(env.sources.every(s=>s.stopped));assert.equal(env.ctx.state,'closed');assert.ok(env.disconnected>=env.sources.length)
 }finally{audio.close()}
})
