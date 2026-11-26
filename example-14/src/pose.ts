import type { Landmark } from './dance.ts'

export interface PersonMask {
  width: number
  height: number
  confidence: Uint8Array<ArrayBuffer>
}

export interface PoseFrame {
  type: 'pose'
  at: number
  landmarks: Landmark[][]
  masks?: PersonMask[]
}
export type PoseRequest =
  | { type: 'init'; wasm: string; model: string }
  | { type: 'frame'; at: number; image: ImageBitmap; masks: boolean }
export type PoseResponse = PoseFrame | { type: 'ready' } | { type: 'error'; message: string }
