// Camera-space data stays unmirrored, independent of the display renderer.
export interface Landmark {
  x: number
  y: number
  z: number
}
export interface BodyLandmark extends Landmark { visibility?: number; presence?: number }
export interface PersonMask { width: number; height: number; alpha: Uint8Array }
export interface TrackedHand {
  label: 'Left' | 'Right'
  landmarks: Landmark[]
  worldLandmarks: Landmark[]
}
export type HandTrackingState = 'loading' | 'ready' | 'unavailable'
export type HandTrackingMode = 'off' | 'prepare' | 'track'

export interface TrackingFrame {
  timestamp: number
  width: number
  height: number
  face: Landmark[]
  /** MediaPipe face pose matrix in the SDK's original layout. */
  faceMatrix?: { rows: number; columns: number; data: number[] }
  hands?: TrackedHand[]
  handTracking?: HandTrackingState
  body?: BodyLandmark[]
  personMask?: PersonMask
  bodyTracking?: HandTrackingState
  expressions?: Record<string, number>
}
export interface TrackedImage {
  image: ImageBitmap
  frame: TrackingFrame
}
export type TrackingRequest =
  | { type: 'init'; assets: string; wasm: string; handModel: string; handFirst?: boolean; body?: boolean; expressions?: boolean }
  | { type: 'frame'; image: ImageBitmap; timestamp: number; hands: HandTrackingMode; body?: boolean; expressions?: boolean }

export type TrackingResponse =
  | { type: 'ready' }
  | ({ type: 'frame' } & TrackedImage)
  | { type: 'error'; message: string }

export interface TrackingSource {
  capture(video: HTMLVideoElement, timestamp: number, hands?: HandTrackingMode, body?: boolean, expressions?: boolean): Promise<TrackedImage | undefined>
  close(): void
}

export class CameraTracker implements TrackingSource {
  private worker: Worker
  private pending?: { resolve: (value: TrackingResponse) => void; reject: (error: Error) => void; timer: number }
  private captureCanvas = document.createElement('canvas')
  private closed = false
  private busy = false

  private constructor(assets: string) {
    this.worker = new Worker(new URL('runtime/tracking.js', assets))
    this.worker.onmessage = ({ data }: MessageEvent<TrackingResponse>) => {
      if (!this.pending) {
        if (data.type === 'frame') data.image.close()
        return
      }
      const pending = this.pending
      this.pending = undefined
      clearTimeout(pending.timer)
      if (data.type === 'error') pending.reject(new Error(data.message))
      else pending.resolve(data)
    }
    this.worker.onerror = event => {
      event.preventDefault()
      this.fail(new Error('추적기를 열 수 없어요. 프로젝트의 모델 준비 상태를 확인해 주세요.'))
    }
    this.worker.onmessageerror = () => this.fail(new Error('카메라 프레임을 읽지 못했어요.'))
  }

  static async create(signal: AbortSignal, handFirst = false, body = false, expressions = false) {
    if (!window.Worker || !window.OffscreenCanvas || !window.createImageBitmap) {
      throw new Error('이 브라우저에서 얼굴 추적을 사용할 수 없어요.')
    }
    const base = new URL(import.meta.env.BASE_URL, document.baseURI)
    const shared = import.meta.env.VITE_EXAMPLE_HUB === true
    const assets = new URL(shared ? 'example-13-assets/' : './', base).href
    const wasm = new URL(shared ? 'mediapipe/' : 'wasm/', base).href
    const handModel = new URL('models/hand_landmarker.task', base).href
    const tracker = new CameraTracker(assets)
    const cancel = () => tracker.close()
    signal.addEventListener('abort', cancel, { once: true })
    try {
      signal.throwIfAborted()
      await tracker.request({ type: 'init', assets, wasm, handModel, handFirst, body, expressions }, [], 35000)
      return tracker
    } catch (error) {
      tracker.close()
      throw error
    } finally {
      signal.removeEventListener('abort', cancel)
    }
  }

  private request(message: TrackingRequest, transfer: Transferable[], timeout: number) {
    return new Promise<TrackingResponse>((resolve, reject) => {
      if (this.closed) { reject(new Error('추적 종료')); return }
      this.pending = { resolve, reject, timer: window.setTimeout(() => {
        this.fail(new Error('추적기의 응답이 늦어요. 카메라를 다시 연결해 주세요.'))
      }, timeout) }
      try { this.worker.postMessage(message, transfer) }
      catch { this.fail(new Error('카메라 프레임을 전달하지 못했어요.')) }
    })
  }

  private fail(error: Error) {
    if (!this.pending) return
    clearTimeout(this.pending.timer)
    this.pending.reject(error)
    this.pending = undefined
  }

  async capture(video: HTMLVideoElement, timestamp: number, hands: HandTrackingMode = 'off', body = false, expressions = false) {
    if (this.closed || this.busy || video.readyState < 2) return
    this.busy = true
    let image: ImageBitmap | undefined
    try {
      const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight))
      const width = Math.max(1, Math.round(video.videoWidth * scale))
      const height = Math.max(1, Math.round(video.videoHeight * scale))
      const canvas = this.captureCanvas
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      canvas.getContext('2d', { alpha: false })!.drawImage(video, 0, 0, width, height)
      image = await createImageBitmap(canvas)
      if (this.closed) return
      const answer = await this.request({ type: 'frame', image, timestamp, hands, body, expressions }, [image], 8000)
      if (answer.type === 'frame') return answer
    } finally {
      image?.close()
      this.busy = false
    }
  }

  close() {
    if (this.closed) return
    this.closed = true
    this.worker.terminate()
    this.fail(new Error('추적 종료'))
    this.captureCanvas.width = this.captureCanvas.height = 1
  }
}
