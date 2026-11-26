import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'
import type { MPMask } from '@mediapipe/tasks-vision'
import type { PersonMask, PoseRequest, PoseResponse } from './pose.ts'

const worker = self as unknown as {
  onmessage: (event: MessageEvent<PoseRequest>) => void
  postMessage: (message: PoseResponse, transfer?: Transferable[]) => void
}

let tracker: PoseLandmarker | undefined

function packMask(mask: MPMask): PersonMask {
  const scale = Math.min(1, 256 / Math.max(mask.width, mask.height))
  const width = Math.max(1, Math.round(mask.width * scale))
  const height = Math.max(1, Math.round(mask.height * scale))
  const source = mask.getAsFloat32Array()
  const confidence = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    const row = Math.floor((y + .5) * mask.height / height) * mask.width
    for (let x = 0; x < width; x++) {
      confidence[y * width + x] = Math.round(source[row + Math.floor((x + .5) * mask.width / width)]! * 255)
    }
  }
  return { width, height, confidence }
}

worker.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const files = await FilesetResolver.forVisionTasks(data.wasm, true)
      tracker = await PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: data.model, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numPoses: 2,
        minPoseDetectionConfidence: .43,
        minPosePresenceConfidence: .44,
        minTrackingConfidence: .42,
        outputSegmentationMasks: true,
      })
      worker.postMessage({ type: 'ready' })
      return
    }
    if (!tracker) throw new Error('전신 추적을 준비하지 못했어요.')
    try {
      const result = tracker.detectForVideo(data.image, data.at)
      try {
        const masks = data.masks ? result.segmentationMasks?.map(packMask) : undefined
        worker.postMessage({ type: 'pose', at: data.at, landmarks: result.landmarks, masks },
          masks?.map(mask => mask.confidence.buffer))
      } finally { result.close() }
    } finally { data.image.close() }
  } catch (error) {
    worker.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
