import type { HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision'
import type { HandRequest, HandResponse } from './hand-protocol'
import { publicAssetURL } from './public-asset.ts'

type Pending = { resolve: (message: HandResponse) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> }

export class HandDetector {
  private worker: Worker | undefined
  private detector: HandLandmarker | undefined
  private pending = new Map<number, Pending>()
  private serial = 0
  private closed = false
  private busy = false
  private baseURL = publicAssetURL('')

  static async create(signal?: AbortSignal) {
    const detector = new HandDetector()
    const cancel = () => detector.close()
    if (signal?.aborted) { detector.close(); throw new Error('Hand tracking initialization cancelled') }
    signal?.addEventListener('abort', cancel, { once: true })
    try {
      if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap !== 'function') {
        throw new Error('Worker inference unavailable')
      }
      detector.worker = new Worker(new URL('workers/hand-worker.js', detector.baseURL))
      detector.worker.onmessage = ({ data }: MessageEvent<HandResponse>) => {
        const pending = detector.pending.get(data.id)
        if (!pending) return
        clearTimeout(pending.timer); detector.pending.delete(data.id)
        if (data.type === 'error') pending.reject(new Error(data.message))
        else pending.resolve(data)
      }
      detector.worker.onerror = event => {
        event.preventDefault()
        detector.stopWorker(new Error('Hand tracking worker failed'))
      }
      detector.worker.onmessageerror = () => detector.stopWorker(new Error('Hand tracking transfer failed'))
      await detector.request({ id: ++detector.serial, type: 'init', baseURL: detector.baseURL }, [], 120000)
    } catch {
      detector.stopWorker()
      if (detector.closed) throw new Error('Hand tracking initialization cancelled')
      try { await detector.loadFallback() } catch (reason) { detector.close(); throw reason }
    } finally { signal?.removeEventListener('abort', cancel) }
    if (detector.closed) throw new Error('Hand tracking initialization cancelled')
    return detector
  }

  private request(message: HandRequest, transfer: Transferable[], timeout: number) {
    return new Promise<HandResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(message.id)
        reject(new Error('Hand tracking timed out'))
      }, timeout)
      this.pending.set(message.id, { resolve, reject, timer })
      try { this.worker!.postMessage(message, transfer) } catch (reason) {
        clearTimeout(timer); this.pending.delete(message.id)
        reject(reason)
      }
    })
  }

  private stopWorker(reason = new Error('Hand tracking worker stopped')) {
    this.worker?.terminate(); this.worker = undefined
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(reason) }
    this.pending.clear()
  }

  private async loadFallback() {
    const { createHandModel } = await import('./hand-model')
    if (this.closed) return
    const detector = await createHandModel(this.baseURL)
    if (this.closed) detector.close()
    else this.detector = detector
  }

  // Only one frame can be captured/inferred at a time: no stale-frame queue,
  // no repeated inference on the same video frame, and no bitmap accumulation.
  async detect(video: HTMLVideoElement, timestamp: number): Promise<HandLandmarkerResult | undefined> {
    if (this.closed || this.busy) return
    this.busy = true
    let image: ImageBitmap | undefined
    try {
      if (this.worker) {
        try {
          image = await createImageBitmap(video)
          if (this.closed) return
          const response = await this.request({ id: ++this.serial, type: 'detect', image, timestamp }, [image], 3000)
          if (response.type === 'result') return response.result
        } catch {
          if (this.closed) return
          this.stopWorker()
          await this.loadFallback()
          // Discard this frame; fallback initialization can take seconds.
          return
        }
      }
      if (!this.detector) { await this.loadFallback(); return }
      return this.detector.detectForVideo(video, timestamp)
    } finally { image?.close(); this.busy = false }
  }

  close() { this.closed = true; this.stopWorker(); this.detector?.close(); this.detector = undefined }
}
