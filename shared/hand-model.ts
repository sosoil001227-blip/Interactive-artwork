import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'

export async function createHandModel(baseURL: string) {
  const vision = await FilesetResolver.forVisionTasks(new URL('mediapipe', baseURL).href)
  const options = { runningMode: 'VIDEO' as const, numHands: 2,
    minHandDetectionConfidence: .5, minHandPresenceConfidence: .5, minTrackingConfidence: .5 }
  const modelAssetPath = new URL('models/hand_landmarker.task', baseURL).href
  try {
    return await HandLandmarker.createFromOptions(vision, {
      ...options, baseOptions: { modelAssetPath, delegate: 'GPU' },
    })
  } catch {
    return HandLandmarker.createFromOptions(vision, {
      ...options, baseOptions: { modelAssetPath, delegate: 'CPU' },
    })
  }
}
