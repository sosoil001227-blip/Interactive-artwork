import type { PoseRequest, PoseResponse, PoseFrame } from './pose.ts'

interface CameraEvents {
  preview(): void
  ready(): void
  frame(frame: PoseFrame): void
  error(message: string): void
}

function cameraError(reason: unknown) {
  if (reason instanceof DOMException) {
    if (reason.name === 'NotAllowedError') return '브라우저에서 카메라 권한을 허용해 주세요.'
    if (reason.name === 'NotFoundError') return '연결된 카메라를 찾을 수 없어요.'
    if (reason.name === 'NotReadableError') return '다른 앱에서 카메라를 사용 중인지 확인해 주세요.'
  }
  return '카메라나 전신 추적을 시작하지 못했어요. 다시 연결해 주세요.'
}

export class DanceCamera {
  private worker?: Worker
  private stream?: MediaStream
  private layer = document.createElement('canvas')
  private context = this.layer.getContext('2d', { alpha: false })!
  private session = 0
  private epoch = 0
  private modelTimeout = 0
  private pendingSince = -Infinity
  private lastCapture = -Infinity
  private lastVideoTime = -1
  private pendingEpoch?: number
  private ready = false

  constructor(private video: HTMLVideoElement, private events: CameraEvents) {}

  async open() {
    this.close()
    if (!navigator.mediaDevices?.getUserMedia) return this.events.error('HTTPS 또는 localhost에서 카메라를 켤 수 있어요.')
    if (!window.Worker || !window.OffscreenCanvas || !window.createImageBitmap) {
      return this.events.error('이 브라우저에서는 전신 추적을 시작할 수 없어요. 체험 시연으로 무대를 볼 수 있어요.')
    }
    const attempt = this.session
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
      })
      if (this.session !== attempt) { stream.getTracks().forEach(track => track.stop()); return }
      this.stream = stream
      for (const track of stream.getVideoTracks()) {
        track.enabled = !document.hidden
        track.onended = () => { if (this.session === attempt) this.fail('카메라 연결이 끊겼어요. 카메라를 다시 켜 주세요.') }
      }
      this.video.srcObject = stream
      if (!document.hidden) await this.video.play()
      if (this.session !== attempt) return
      this.events.preview()
      const worker = new Worker(new URL('./pose.worker.ts', import.meta.url), { type: 'module' })
      this.worker = worker
      this.modelTimeout = window.setTimeout(() => this.fail('전신 추적 준비 시간이 길어졌어요. 카메라를 다시 켜 주세요.'), 36000)
      worker.onmessage = ({ data }: MessageEvent<PoseResponse>) => {
        if (this.worker !== worker) return
        if (data.type === 'error') return this.fail('전신 추적 모델을 불러오지 못했어요. 카메라를 다시 연결해 주세요.')
        if (data.type === 'ready') {
          window.clearTimeout(this.modelTimeout)
          this.ready = true
          this.events.ready()
          return
        }
        const epoch = this.pendingEpoch
        this.pendingEpoch = undefined
        if (!document.hidden && epoch === this.epoch && performance.now() - data.at < 440) this.events.frame(data)
      }
      worker.onerror = event => {
        if (this.worker !== worker) return
        event.preventDefault()
        this.fail('전신 추적 모델을 열지 못했어요. 카메라를 다시 연결해 주세요.')
      }
      worker.onmessageerror = () => { if (this.worker === worker) this.fail('전신 추적 프레임을 읽지 못했어요.') }
      const base = new URL(import.meta.env.BASE_URL, document.baseURI)
      worker.postMessage({
        type: 'init', wasm: new URL('mediapipe', base).href,
        model: new URL('example-13-assets/models/pose_landmarker_lite.task', base).href,
      } satisfies PoseRequest)
    } catch (reason) {
      if (this.session === attempt) this.fail(cameraError(reason))
    }
  }

  capture(now: number, masks: boolean) {
    const worker = this.worker, video = this.video
    if (!this.ready || !worker || document.hidden) return
    if (this.pendingEpoch !== undefined) {
      if (now - this.pendingSince > 9000) this.fail('전신 추적이 응답하지 않아요. 카메라를 다시 켜 주세요.')
      return
    }
    if (video.readyState < 2 || !video.videoWidth || video.currentTime === this.lastVideoTime || now - this.lastCapture < 40) return
    const scale = Math.min(1, 896 / Math.max(video.videoWidth, video.videoHeight))
    const w = Math.max(1, Math.round(video.videoWidth * scale)), h = Math.max(1, Math.round(video.videoHeight * scale))
    if (this.layer.width !== w || this.layer.height !== h) {
      this.layer.width = w
      this.layer.height = h
    }
    this.context.drawImage(video, 0, 0, w, h)
    this.lastVideoTime = video.currentTime
    this.lastCapture = this.pendingSince = now
    this.pendingEpoch = this.epoch
    void this.send(worker, this.epoch, now, masks)
  }

  private async send(worker: Worker, epoch: number, at: number, masks: boolean) {
    let image: ImageBitmap | undefined
    try {
      image = await createImageBitmap(this.layer)
      if (worker !== this.worker) return
      if (document.hidden || epoch !== this.epoch) { this.pendingEpoch = undefined; return }
      worker.postMessage({ type: 'frame', at, image, masks } satisfies PoseRequest, [image])
    } catch (reason) {
      if (worker === this.worker) this.fail(cameraError(reason))
    } finally { image?.close() }
  }

  invalidate() { this.epoch++ }

  visibility() {
    if (!this.stream) return
    this.invalidate()
    for (const track of this.stream.getVideoTracks()) track.enabled = !document.hidden
    if (document.hidden) this.video.pause()
    else {
      const attempt = this.session
      void this.video.play().catch(reason => {
        if (attempt === this.session && !document.hidden) this.fail(cameraError(reason))
      })
    }
  }

  close() {
    this.session++
    this.invalidate()
    window.clearTimeout(this.modelTimeout)
    this.ready = false
    this.worker?.terminate(); this.worker = undefined
    this.stream?.getTracks().forEach(track => { track.onended = null; track.stop() })
    this.stream = undefined
    this.video.pause(); this.video.srcObject = null
    this.pendingEpoch = undefined
    this.lastVideoTime = -1
    this.lastCapture = -Infinity
  }

  private fail(message: string) { this.close(); this.events.error(message) }
}
