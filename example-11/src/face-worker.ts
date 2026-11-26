import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision'
import type { FaceBox } from './face-window'
type Request = { type: 'init'; wasm: string; model: string } | { type: 'detect'; image: ImageBitmap; timestamp: number }
const scope = self as unknown as { onmessage: ((event: MessageEvent<Request>) => void) | null; postMessage(message: unknown): void }
let detector: FaceDetector | undefined
scope.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      const vision = await FilesetResolver.forVisionTasks(data.wasm)
      detector = await FaceDetector.createFromOptions(vision, { baseOptions: { modelAssetPath: data.model, delegate: 'CPU' }, runningMode: 'VIDEO', minDetectionConfidence: .65 })
      scope.postMessage({ type: 'ready' })
    } else {
      if (!detector) throw new Error('Face model is not ready')
      const result = detector.detectForVideo(data.image, data.timestamp)
      const largest = result.detections.filter(d => d.boundingBox).sort((a, b) => b.boundingBox!.width * b.boundingBox!.height - a.boundingBox!.width * a.boundingBox!.height)[0]?.boundingBox
      const box: FaceBox | undefined = largest ? { x: largest.originX / data.image.width, y: largest.originY / data.image.height,
        width: largest.width / data.image.width, height: largest.height / data.image.height } : undefined
      scope.postMessage({ type: 'result', box, timestamp: data.timestamp })
    }
  } catch { scope.postMessage({ type: 'error' }) }
  finally { if (data.type === 'detect') data.image.close() }
}
