import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
type Request={type:'init';wasm:string;model:string}|{type:'detect';image:ImageBitmap;timestamp:number}
const scope=self as unknown as {onmessage:((event:MessageEvent<Request>)=>void)|null;postMessage(data:unknown):void}
let detector:FaceLandmarker|undefined
scope.onmessage=async({data})=>{
  try{
    if(data.type==='init'){
      const vision=await FilesetResolver.forVisionTasks(data.wasm)
      detector=await FaceLandmarker.createFromOptions(vision,{baseOptions:{modelAssetPath:data.model,delegate:'CPU'},runningMode:'VIDEO',numFaces:1,minFaceDetectionConfidence:.55,minFacePresenceConfidence:.55,minTrackingConfidence:.55,outputFaceBlendshapes:false,outputFacialTransformationMatrixes:false})
      scope.postMessage({type:'ready'})
    }else{
      if(!detector)throw new Error('얼굴 모델이 준비되지 않았어요.')
      const result=detector.detectForVideo(data.image,data.timestamp)
      scope.postMessage({type:'result',points:result.faceLandmarks[0]??[],timestamp:data.timestamp})
    }
  }catch(reason){scope.postMessage({type:'error',message:reason instanceof Error?reason.message:'얼굴 추적에 실패했어요.'})}
  finally{if(data.type==='detect')data.image.close()}
}
