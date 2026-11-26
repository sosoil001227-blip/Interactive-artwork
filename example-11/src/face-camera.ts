import { FaceWindow, faceMask } from './face-window.ts'
import type { FaceBox } from './face-window'

/** Optional 8 fps worker. Failure keeps the room hidden and never blocks hand input. */
export class FaceCamera {
  private worker: Worker | undefined
  private faces = new FaceWindow()
  private ready = false
  private busy = false
  private stamp = 0
  private videoTime = -1
  private epoch = 0
  private requestEpoch = -1
  private timeout = 0
  private lastMask = ''
  private captureCanvas: HTMLCanvasElement | undefined
  private readonly video: HTMLVideoElement
  private maskSupported = false
  constructor(video: HTMLVideoElement) { this.video = video }
  start() {
    this.close()
    this.maskSupported=typeof CSS!=='undefined'&&(CSS.supports('mask-image','radial-gradient(black, transparent)')||CSS.supports('-webkit-mask-image','radial-gradient(black, transparent)'))
    if (!this.maskSupported || typeof Worker === 'undefined' || typeof createImageBitmap !== 'function') return
    try {
      const workerURL = new URL('./assets/face-runtime/face-worker.js', import.meta.url).href
      const worker = new Worker(workerURL)
      this.worker = worker
      worker.onmessage = ({ data }: MessageEvent<{ type: string; box?: FaceBox; timestamp?: number }>) => {
        if (worker !== this.worker) return
        clearTimeout(this.timeout)
        if (data.type === 'ready') this.ready = true
        else if (data.type === 'result') {
          this.busy = false
          if (this.requestEpoch === this.epoch && data.timestamp !== undefined && data.timestamp >= this.stamp && performance.now() - data.timestamp < 300 && !document.hidden) {
            if (data.box) this.faces.update(data.box, performance.now()); else this.faces.reset()
          }
        } else this.close()
      }
      worker.onerror = event => { event.preventDefault(); this.close() }
      worker.onmessageerror = () => this.close()
      worker.postMessage({ type: 'init', wasm: new URL('/mediapipe/', location.href).href,
        model: new URL('./assets/blaze-face-short-range.tflite', import.meta.url).href })
      this.timeout = window.setTimeout(() => this.close(), 30000)
    } catch { this.close() }
  }
  update(now: number, width: number, height: number) {
    if(!this.maskSupported)return
    const box = this.faces.snapshot(now)
    const mask = box && faceMask(box, this.video.videoWidth, this.video.videoHeight, width, height)
    // Hands use bounded foreground patches; this layer reveals only the face behind glass.
    if (mask) {
      const gradient = `radial-gradient(ellipse ${mask.rx.toFixed(1)}px ${mask.ry.toFixed(1)}px at ${mask.x.toFixed(1)}px ${mask.y.toFixed(1)}px, #000 55%, transparent 100%)`
      if (this.lastMask !== gradient) { this.lastMask = gradient; this.video.style.maskImage = gradient; this.video.style.setProperty('-webkit-mask-image', gradient) }
    }
    this.video.classList.toggle('face-visible', !!mask)
    if (!this.worker || !this.ready || this.busy || document.hidden || this.video.readyState < 2
      || now - this.stamp < 125 || this.video.currentTime === this.videoTime) return
    const worker = this.worker, attempt = this.epoch
    this.busy = true; this.stamp = now; this.videoTime = this.video.currentTime
    const scale = Math.min(1, 320 / this.video.videoWidth)
    void createImageBitmap(this.video, { resizeWidth: Math.max(1, Math.round(this.video.videoWidth * scale)),
      resizeHeight: Math.max(1, Math.round(this.video.videoHeight * scale)), resizeQuality: 'low' }).catch(() => {
      if (attempt !== this.epoch || worker !== this.worker || document.hidden) throw new Error('Face capture cancelled')
      // Older WebViews may support canvas ImageBitmaps but not video resize options.
      const canvas = this.captureCanvas ??= document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(this.video.videoWidth * scale)); canvas.height = Math.max(1, Math.round(this.video.videoHeight * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Face capture unavailable')
      ctx.drawImage(this.video, 0, 0, canvas.width, canvas.height)
      return createImageBitmap(canvas)
    }).then(image => {
      if (attempt !== this.epoch || worker !== this.worker || document.hidden) { image.close(); if (worker === this.worker) this.busy = false; return }
      try {
        this.requestEpoch = attempt
        worker.postMessage({ type: 'detect', image, timestamp: now }, [image])
        this.timeout = window.setTimeout(() => this.close(), 1800)
      } catch { image.close(); this.close() }
    }).catch(() => { if (attempt === this.epoch && worker === this.worker) this.close() })
  }
  suspend() { this.epoch++; this.faces.reset(); this.stamp = performance.now(); this.videoTime = -1; this.video.classList.remove('face-visible') }
  close() {
    this.suspend(); clearTimeout(this.timeout); this.timeout = 0
    this.worker?.terminate(); this.worker = undefined; this.ready = this.busy = false
    if (this.captureCanvas) this.captureCanvas.width = this.captureCanvas.height = 1
    this.stamp = 0; this.video.style.maskImage = 'none'; this.video.style.setProperty('-webkit-mask-image', 'none')
    this.lastMask = ''
  }
}
