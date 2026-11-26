import './style.css'
import { element, setText } from '../../shared/dom'
import { FrameLoop } from '../../shared/frame-loop'
import { HandDetector } from '../../shared/hand-detector'
import { FaceDetector } from './face-detector'
import { faceInteractionLifetime, FaceTracker } from './geometry.ts'
import type { Face } from './geometry.ts'
import { Hands } from './gestures.ts'
import { Rubber } from './rubber.ts'
import { Renderer } from './renderer.ts'

const video=element<HTMLVideoElement>('camera'),start=element<HTMLButtonElement>('start'),stop=element<HTMLButtonElement>('stop')
const hands=new Hands(),rubber=new Rubber(),faces=new FaceTracker()
let renderer:Renderer|undefined,handDetector:HandDetector|undefined,faceDetector:FaceDetector|undefined
let stream:MediaStream|undefined,loading:AbortController|undefined,face:Face|undefined
let live=false,preparing=false,disposed=false,generation=0,epoch=0
let handBusy=false,faceBusy=false,lastHand=0,lastFace=0,handTime=-1,faceTime=-1,lastFrame=0,lastUI=0

function error(reason:unknown){
  const messages:Record<string,string>={NotAllowedError:'주소창에서 카메라 접근을 허용한 뒤 다시 시작해 주세요.',NotFoundError:'카메라를 찾지 못했어요. 카메라를 연결해 주세요.',NotReadableError:'카메라를 열 수 없어요. 다른 앱에서 사용 중인지 확인해 주세요.'}
  setText(element('error'),messages[reason instanceof Error?reason.name:'']??(reason instanceof Error?reason.message:'시작하지 못했어요. 다시 시도해 주세요.'))
  element('error').hidden=false
  element('camera-notice').hidden=false
  setText(element('status'),'카메라 연결을 확인해 주세요')
  setText(element('guide'),'카메라 설정을 확인한 뒤 다시 연결해 주세요.')
}
try{renderer=new Renderer(element<HTMLCanvasElement>('background'),element<HTMLCanvasElement>('surface'),element<HTMLCanvasElement>('overlay'),rubber)}catch(reason){error(reason);start.disabled=true}

function reset(){epoch++;hands.reset();faces.reset();rubber.reset();face=undefined;renderer?.reset();handTime=faceTime=-1;lastHand=lastFace=lastFrame=0}
function stopCamera(){
  generation++;live=preparing=false;loading?.abort();loading=undefined
  handDetector?.close();handDetector=undefined;faceDetector?.close();faceDetector=undefined
  stream?.getTracks().forEach(track=>{track.onended=null;track.stop()});stream=undefined
  video.pause();video.srcObject=null;reset()
  document.body.classList.remove('is-live','is-preparing')
  element('live-info').hidden=stop.hidden=true;element('camera-notice').hidden=false
  element<HTMLButtonElement>('markers').disabled=element<HTMLButtonElement>('reset').disabled=true
  start.disabled=!renderer;setText(element('status'),'카메라 꺼짐');setText(element('face-status'),'고무 인간 · 실시간 인터랙티브 미러')
  setText(element('guide'),'카메라를 다시 연결하면 이 화면에서 바로 이어집니다.')
  setText(element('grip-count'),'0 / 2 PINCH');setText(element('stretch-value'),'STRETCH 0%')
}
async function begin(){
  if(live||preparing||disposed||!renderer)return
  if(!navigator.mediaDevices?.getUserMedia){error(new Error('카메라를 사용하려면 localhost 또는 HTTPS 주소에서 열어 주세요.'));return}
  preparing=true;start.disabled=true;element('error').hidden=element('camera-notice').hidden=true;stop.hidden=false;document.body.classList.add('is-preparing')
  setText(element('status'),'카메라 연결 중…');setText(element('guide'),'카메라 접근을 허용하면 바로 시작합니다.');setText(element('stop-label'),'연결 취소')
  const attempt=++generation,controller=new AbortController();loading=controller
  let pending:MediaStream|undefined
  try{
    pending=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:'user',width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30,max:30}}})
    if(attempt!==generation||disposed){pending.getTracks().forEach(t=>t.stop());return}
    stream=pending
    stream.getVideoTracks().forEach(track=>{track.onended=()=>{stopCamera();error(new Error('카메라 연결이 끊겼어요. 다시 연결해 주세요.'))}})
    video.srcObject=stream;await video.play()
    if(attempt!==generation||disposed)return
    setText(element('status'),'얼굴과 손 추적 준비 중…');setText(element('guide'),'화면에 얼굴과 손을 보여 주세요. 추적을 준비하고 있어요.')
    if(document.hidden){stream.getVideoTracks().forEach(track=>{track.enabled=false});video.pause()}
    await Promise.all([
      HandDetector.create(controller.signal).then(detector=>{if(attempt!==generation||disposed)detector.close();else handDetector=detector}),
      FaceDetector.create(controller.signal).then(detector=>{if(attempt!==generation||disposed)detector.close();else faceDetector=detector}),
    ])
    if(attempt!==generation||disposed)return
    loading=undefined;preparing=false;live=true;reset()
    document.body.classList.remove('is-preparing');document.body.classList.add('is-live')
    element('live-info').hidden=false;setText(element('stop-label'),'카메라 종료')
    element<HTMLButtonElement>('markers').disabled=element<HTMLButtonElement>('reset').disabled=false
    renderer.resize();stream.getVideoTracks().forEach(track=>{track.enabled=!document.hidden})
    if(document.hidden)video.pause()
  }catch(reason){
    pending?.getTracks().forEach(t=>t.stop())
    if(attempt!==generation||disposed)return
    stopCamera();error(reason)
  }
}
start.addEventListener('click',()=>void begin())
stop.addEventListener('click',()=>{stopCamera();start.focus({preventScroll:true})})
element('reset').addEventListener('click',reset)
element('markers').addEventListener('click',()=>{if(!renderer)return;renderer.markers=!renderer.markers;element('markers').setAttribute('aria-pressed',String(renderer.markers))})

const loop=new FrameLoop(now=>{
  if(disposed||!renderer)return
  // The camera appears as soon as it opens, while tracking models initialize.
  if(!live){renderer.draw(stream?video:undefined,undefined,[],now);return}
  const attempt=generation,inputEpoch=epoch,valid=()=>attempt===generation&&inputEpoch===epoch&&live&&!document.hidden&&!disposed
  if(video.readyState>=2){
    if(handDetector&&!handBusy&&now-lastHand>=33&&video.currentTime!==handTime){
      lastHand=now;handTime=video.currentTime;handBusy=true
      void handDetector.detect(video,now).then(result=>{
        if(!result||!valid()||performance.now()-now>300)return
        hands.update(result,video.videoWidth,video.videoHeight,renderer!.width,renderer!.height,performance.now())
      }).catch(reason=>{if(valid()){stopCamera();error(reason)}}).finally(()=>{handBusy=false})
    }
    if(faceDetector&&!faceBusy&&now-lastFace>=50&&video.currentTime!==faceTime){
      lastFace=now;faceTime=video.currentTime;faceBusy=true
      void faceDetector.detect(video,now).then(points=>{
        if(!points||!valid()||performance.now()-now>400)return
        const found=faces.update(points,video.videoWidth,video.videoHeight,renderer!.width,renderer!.height,performance.now())
        if(found)face=found
      }).catch(reason=>{if(valid()){stopCamera();error(reason)}}).finally(()=>{faceBusy=false})
    }
  }
  const dt=lastFrame?(now-lastFrame)/1000:1/60;lastFrame=now
  const tracked=hands.snapshot(now),age=face?now-face.seen:Infinity
  const visible=face&&age<faceInteractionLifetime(tracked.length>0||rubber.settling)?face:undefined
  // A hand covering the face is the intended input, not a reason to discard it.
  // Retain the last confirmed face while the current hand keeps interacting.
  if(visible)rubber.update(tracked,visible,dt)
  else if(face){rubber.reset();renderer.reset();face=undefined}
  renderer.draw(video,visible,tracked,now)
  if(now-lastUI<100)return
  lastUI=now
  const count=rubber.active
  setText(element('status'),!visible?'얼굴 찾는 중':count===2?'TWIST & SHOUT':count===1?'NICE STRETCH':rubber.settling?'BOUNCE BACK':'READY TO PINCH')
  const handStatus=(label:string)=>{const hand=tracked.find(h=>h.label===label);return !hand?'대기':rubber.grips.some(g=>g.active&&g.id===hand.id)?'잡힘':hand.closed?'Pinch':'인식'}
  const faceStatus=!visible?'얼굴 대기':age>700?'얼굴 가림 · 위치 유지':`얼굴 ${visible.landmarks?.length??468}점`
  setText(element('face-status'),`${faceStatus} · 왼손 ${handStatus('Left')} · 오른손 ${handStatus('Right')}`)
  setText(element('grip-count'),`${count} / 2 PINCH`)
  setText(element('stretch-value'),`STRETCH ${visible?Math.round(rubber.stretch/visible.radius*100):0}%`)
  setText(element('guide'),!visible?'카메라 중앙에 얼굴을 보여 주세요.':count===2?'양손으로 집은 지점을 늘리거나 엇갈려 돌려 보세요.':count===1?'잡았어요! 손을 움직여 늘리고, 손가락을 벌리면 돌아와요.':rubber.settling?'부드럽게 원래 얼굴로 돌아오는 중이에요.':tracked.some(h=>h.closed)?'Pinch를 유지한 채 두 손가락 사이의 점을 화면 속 얼굴에 겹쳐 주세요.':tracked.length?'엄지와 검지를 맞댄 채 화면 속 얼굴을 집어 보세요.':'손을 보여 주세요. 엄지와 검지를 맞대어 얼굴을 집을 수 있어요.')
})
const observer=new ResizeObserver(()=>{reset();renderer?.resize()})
observer.observe(element('stage'))
document.addEventListener('visibilitychange',()=>{
  reset()
  if(!stream)return
  stream?.getVideoTracks().forEach(t=>{t.enabled=!document.hidden})
  if(document.hidden)video.pause()
  else void video.play().catch(reason=>{stopCamera();error(reason)})
})
element('surface').addEventListener('webglcontextlost',event=>{event.preventDefault();stopCamera();error(new Error('그래픽 연결이 중단됐어요. 페이지를 새로 열어 주세요.'));start.disabled=true})
window.addEventListener('pagehide',event=>{stopCamera();if(!event.persisted){disposed=true;loop.close();observer.disconnect();renderer?.close()}})
window.addEventListener('pageshow',event=>{if(!disposed){renderer?.resize();loop.start();if(event.persisted)void begin()}})
// Enter the artwork directly. The browser may still ask for camera permission;
// a denied or gesture-required attempt exposes a retry inside the same scene.
void begin()
