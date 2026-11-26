import type { HandLandmarkerResult } from '@mediapipe/tasks-vision'

export type HandRequest = { id: number } & (
  { type: 'init'; baseURL: string } |
  { type: 'detect'; image: ImageBitmap; timestamp: number }
)
export type HandResponse = { id: number } & (
  { type: 'ready' } |
  { type: 'result'; result: HandLandmarkerResult } |
  { type: 'error'; message: string }
)
