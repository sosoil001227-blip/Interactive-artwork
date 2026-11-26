import type { Landmark } from './geometry.ts'
import { publicAssetURL } from '../../shared/public-asset.ts'
type Response={type:string;points?:Landmark[];timestamp?:number;message?:string}
export class FaceDetector {
  private worker:Worker
  private pending:{resolve:(points:Landmark[])=>void;reject:(reason:Error)=>void}|undefined
  private timer:ReturnType<typeof setTimeout>|undefined
  private closed=false
  private busy=false
  private capture=document.createElement('canvas')
  private constructor(){
    // MediaPipe uses importScripts: this is a prebundled classic worker, not ESM.
    this.worker=new Worker(new URL('./assets/face-runtime/face-worker.js',import.meta.url))
    this.worker.onmessage=({data}:MessageEvent<Response>)=>{
      if(!this.pending)return
      clearTimeout(this.timer)
      const pending=this.pending;this.pending=undefined
      if(data.type==='error')pending.reject(new Error(data.message??'얼굴 추적 오류'))
      else pending.resolve(data.points??[])
    }
    this.worker.onerror=event=>{event.preventDefault();this.fail(new Error('얼굴 추적을 시작하지 못했어요. 페이지를 새로 열어 주세요.'))}
    this.worker.onmessageerror=()=>this.fail(new Error('얼굴 추적 데이터를 읽지 못했어요.'))
  }
  static async create(signal:AbortSignal){
    if(typeof Worker==='undefined'||typeof createImageBitmap!=='function')throw new Error('이 작품은 최신 Safari 또는 Chrome에서 열어 주세요.')
    const tracker=new FaceDetector(),cancel=()=>tracker.close()
    signal.addEventListener('abort',cancel,{once:true})
    try{
      if(signal.aborted)throw new Error('초기화 취소')
      await tracker.request({type:'init',wasm:publicAssetURL('mediapipe/'),model:new URL('./assets/face_landmarker.task',import.meta.url).href},[],90000)
      return tracker
    }catch(reason){tracker.close();throw reason}
    finally{signal.removeEventListener('abort',cancel)}
  }
  private request(message:unknown,transfer:Transferable[],timeout:number){
    return new Promise<Landmark[]>((resolve,reject)=>{
      if(this.closed){reject(new Error('얼굴 추적 종료'));return}
      this.pending={resolve,reject}
      this.timer=setTimeout(()=>this.fail(new Error('얼굴 추적 응답이 늦어요. 다시 시작해 주세요.')),timeout)
      try{this.worker.postMessage(message,transfer)}catch(reason){this.fail(reason instanceof Error?reason:new Error('얼굴 추적 실패'))}
    })
  }
  private fail(reason:Error){clearTimeout(this.timer);this.pending?.reject(reason);this.pending=undefined}
  async detect(video:HTMLVideoElement,timestamp:number){
    if(this.closed||this.busy)return
    this.busy=true
    let image:ImageBitmap|undefined
    try{
      // A bounded canvas also supports browsers lacking video bitmap resize.
      const scale=Math.min(1,640/video.videoWidth)
      this.capture.width=Math.max(1,Math.round(video.videoWidth*scale));this.capture.height=Math.max(1,Math.round(video.videoHeight*scale))
      const ctx=this.capture.getContext('2d')
      if(!ctx)throw new Error('카메라 프레임을 읽지 못했어요.')
      ctx.drawImage(video,0,0,this.capture.width,this.capture.height)
      image=await createImageBitmap(this.capture)
      if(this.closed)return
      return await this.request({type:'detect',image,timestamp},[image],4000)
    }finally{image?.close();this.busy=false}
  }
  close(){this.closed=true;this.fail(new Error('얼굴 추적 종료'));this.worker.terminate();this.capture.width=this.capture.height=1}
}
