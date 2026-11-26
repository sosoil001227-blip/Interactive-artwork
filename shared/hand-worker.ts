import { createHandModel } from './hand-model'
import type { HandRequest, HandResponse } from './hand-protocol'
import type { HandLandmarker } from '@mediapipe/tasks-vision'

// A classic worker keeps MediaPipe's importScripts loader usable in WebViews.
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<HandRequest>) => void) | null
  postMessage: (message: HandResponse) => void
}
let detector: HandLandmarker | undefined
scope.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      detector = await createHandModel(data.baseURL)
      scope.postMessage({ id: data.id, type: 'ready' })
    } else {
      if (!detector) throw new Error('Hand model is not ready')
      const result = detector.detectForVideo(data.image, data.timestamp)
      scope.postMessage({ id: data.id, type: 'result', result })
    }
  } catch (reason) {
    scope.postMessage({ id: data.id, type: 'error', message: reason instanceof Error ? reason.message : String(reason) })
  } finally {
    if (data.type === 'detect') data.image.close()
  }
}
