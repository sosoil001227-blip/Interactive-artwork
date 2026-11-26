import './style.css'
import '../../shared/navigation.css'
import { HandDetector } from '../../shared/hand-detector'
import { FrameLoop } from '../../shared/frame-loop'
import { element, setText } from '../../shared/dom'
import { FingerTracker } from './tracking'
import type { Finger } from './tracking'
import { WaterSurface } from './water'

const video = element<HTMLVideoElement>('camera')
const canvas = element<HTMLCanvasElement>('water')
const markers = element<HTMLCanvasElement>('markers')
const markerContext = markers.getContext('2d')!
const start = element<HTMLButtonElement>('start')
const stop = element<HTMLButtonElement>('stop')
const error = element<HTMLParagraphElement>('error')
const hint = element<HTMLDivElement>('live-hint')
const status = element<HTMLSpanElement>('status')
const tracker = new FingerTracker()
let water: WaterSurface | undefined
let detector: HandDetector | undefined
let detectorLoad: AbortController | undefined
let stream: MediaStream | undefined
let fingers: Finger[] = []
let busy = false, live = false, showMarkers = true, disposed = false
let generation = 0, lastDetection = 0, lastVideoTime = -1, lastSeen = 0
let detecting = false, lastResult = 0
let markersDirty = true, trackingEpoch = 0

try { water = new WaterSurface(canvas) } catch (reason) {
  error.hidden = false; error.textContent = reason instanceof Error ? reason.message : '물결 효과를 준비하지 못했어요.'
  start.disabled = true
}

// Return to the originating archive, including when its port differs.
try {
  const source = new URL(document.referrer)
  if (['localhost', '127.0.0.1', '[::1]'].includes(source.hostname) && source.origin !== location.origin) {
    element<HTMLAnchorElement>('archive-link').href = `${source.origin}/archive/works/`
  }
} catch { /* Direct visits use the default archive address. */ }

function resize() {
  trackingEpoch++; markersDirty = true
  water?.resize()
  const dpr = Math.min(devicePixelRatio || 1, 1.75)
  markers.width = Math.round(innerWidth * dpr); markers.height = Math.round(innerHeight * dpr)
  markerContext.setTransform(dpr, 0, 0, dpr, 0, 0)
  tracker.clear(); fingers = []
}
resize()
window.addEventListener('resize', resize)

function displayTracking(labels: string[], count: number) {
  setText(element('finger-count'), String(count).padStart(2, '0'))
  // The inference input is unmirrored; MediaPipe reports the subject's sides.
  const left = labels.includes('Left'), right = labels.includes('Right')
  setText(element('left-hand'), left ? '왼손 감지됨' : '왼손 —')
  setText(element('right-hand'), right ? '오른손 감지됨' : '오른손 —')
  element('left-hand').classList.toggle('detected', left)
  element('right-hand').classList.toggle('detected', right)
}

function showError(reason: unknown) {
  const name = reason instanceof Error ? reason.name : ''
  const messages: Record<string, string> = {
    NotAllowedError: '카메라 접근이 허용되지 않았어요. 주소창의 카메라 권한을 허용한 뒤 다시 켜 주세요.',
    NotFoundError: '사용할 수 있는 카메라가 없어요. 카메라를 연결한 뒤 다시 시도해 주세요.',
    NotReadableError: '카메라를 열 수 없어요. 다른 앱이 카메라를 사용 중인지 확인해 주세요.',
    OverconstrainedError: '카메라 설정을 지원하지 않아요. 다른 카메라로 다시 시도해 주세요.',
  }
  error.textContent = messages[name] || (reason instanceof Error ? reason.message : '카메라를 시작하지 못했어요. 다시 시도해 주세요.')
  error.hidden = false
}

async function loadDetector(attempt: number) {
  if (detector) return
  const controller = new AbortController()
  detectorLoad = controller
  const loaded = await HandDetector.create(controller.signal)
  if (detectorLoad === controller) detectorLoad = undefined
  if (disposed || attempt !== generation) { loaded.close(); return }
  detector = loaded
}

function stopCamera() {
  generation++
  detectorLoad?.abort(); detectorLoad = undefined
  detector?.close(); detector = undefined
  live = false
  stream?.getTracks().forEach(track => { track.onended = null; track.stop() })
  stream = undefined; video.pause(); video.srcObject = null
  water?.clearCamera(); water?.reset(); tracker.clear(); fingers = []
  markersDirty = true; trackingEpoch++
  lastVideoTime = -1; lastDetection = 0
  document.body.classList.remove('is-live')
  element('welcome').removeAttribute('inert')
  hint.hidden = true; stop.hidden = true
  start.disabled = false; start.querySelector('span')!.textContent = '카메라 켜기'
  element('status-dot').classList.remove('live')
  status.textContent = '카메라를 기다리고 있어요'; displayTracking([], 0)
}

start.addEventListener('click', async () => {
  if (busy || live || !water) return
  if (!navigator.mediaDevices?.getUserMedia) { showError(new Error('카메라를 사용하려면 localhost 또는 HTTPS 주소에서 열어 주세요.')); return }
  busy = true; start.disabled = true; error.hidden = true
  const attempt = ++generation
  let pendingStream: MediaStream | undefined
  try {
    start.querySelector('span')!.textContent = '카메라 연결 중'
    pendingStream = await navigator.mediaDevices.getUserMedia({
      audio: false, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
    })
    if (attempt !== generation || disposed) { pendingStream.getTracks().forEach(t => t.stop()); return }
    stream = pendingStream; video.srcObject = stream
    await video.play()
    if (attempt !== generation || disposed) return
    start.querySelector('span')!.textContent = '손 인식 준비 중'
    status.textContent = '손 인식 모델을 준비하고 있어요'
    try { await loadDetector(attempt) } catch { throw new Error('손 인식 모델을 불러오지 못했어요. 페이지를 새로고침한 뒤 다시 시도해 주세요.') }
    if (attempt !== generation || disposed) return
    stream.getVideoTracks().forEach(track => { track.onended = () => { stopCamera(); showError(new Error('카메라 연결이 끊겼어요. 다시 켜 주세요.')) } })
    tracker.clear(); water.reset(); live = true; lastSeen = lastResult = performance.now()
    if (document.hidden) { video.pause(); stream.getVideoTracks().forEach(track => { track.enabled = false }) }
    document.body.classList.add('is-live')
    element('welcome').setAttribute('inert', '')
    stop.hidden = false; hint.hidden = false
    stop.focus({ preventScroll: true })
    element('status-dot').classList.add('live')
    status.textContent = '두 손을 카메라 앞에 펼쳐 주세요'
  } catch (reason) {
    if (attempt !== generation || disposed) return
    pendingStream?.getTracks().forEach(t => t.stop())
    stopCamera(); showError(reason)
  } finally {
    busy = false; start.disabled = false
    start.querySelector('span')!.textContent = '카메라 켜기'
  }
})

stop.addEventListener('click', () => { stopCamera(); start.focus() })
element('reset').addEventListener('click', () => water?.reset())
element('show-markers').addEventListener('click', event => {
  showMarkers = !showMarkers; markersDirty = true
  const button = event.currentTarget as HTMLButtonElement
  button.setAttribute('aria-pressed', String(showMarkers)); button.querySelector('span')!.textContent = showMarkers ? 'ON' : 'OFF'
})
element<HTMLInputElement>('strength').addEventListener('input', event => {
  const value = Number((event.currentTarget as HTMLInputElement).value)
  if (water) water.strength = value / 100
  element('strength-value').textContent = `${value}%`
})

// Pointer input also previews the same fluid, without replacing hand tracking.
let pointer: { x: number; y: number } | undefined
canvas.addEventListener('pointermove', event => {
  if (live || (event.pointerType !== 'mouse' && !event.buttons)) return
  const p = { x: event.clientX / innerWidth, y: event.clientY / innerHeight }
  water?.touch([{ ...p, previousX: pointer?.x ?? p.x, previousY: pointer?.y ?? p.y, force: .038, radius: .012 }])
  pointer = p
})
canvas.addEventListener('pointerleave', () => { pointer = undefined })

function frame(now: number) {
  if (disposed) return
  if (live && detector && !detecting && video.readyState >= 2 && video.currentTime !== lastVideoTime && now - lastDetection >= 33) {
    lastVideoTime = video.currentTime; lastDetection = now
    detecting = true
    const attempt = generation, epoch = trackingEpoch
    void detector.detect(video, now).then(result => {
      if (!result || attempt !== generation || epoch !== trackingEpoch || !live || document.hidden || performance.now() - now > 250) return
      lastResult = performance.now()
      const tracked = tracker.update(result, now, video.videoWidth, video.videoHeight, innerWidth, innerHeight)
      fingers = tracked.fingers; markersDirty = true; water?.touch(tracked.touches)
      displayTracking(tracked.labels, fingers.length)
      if (tracked.handCount) {
        lastSeen = now; hint.hidden = true
        setText(status, `${tracked.handCount}개의 손 · ${fingers.length}개의 손끝을 따라가는 중`)
      } else {
        setText(status, '두 손을 카메라 앞에 펼쳐 주세요')
        hint.hidden = now - lastSeen < 4000
      }
    }).catch(reason => {
      if (attempt !== generation || disposed) return
      console.error('Hand tracking failed', reason)
      stopCamera(); showError(new Error('손 추적이 중단됐어요. 카메라를 다시 켜 주세요.'))
    }).finally(() => { detecting = false })
  }
  // A stalled camera never leaves frozen fingertip markers on the water.
  if (live && fingers.length && now - lastResult > 250) { fingers = []; markersDirty = true; displayTracking([], 0); tracker.clear() }
  water?.render(now, live ? video : undefined)
  if (markersDirty) {
    markersDirty = false
    markerContext.clearRect(0, 0, innerWidth, innerHeight)
    if (showMarkers && live) fingers.forEach(finger => {
      const x = finger.x * innerWidth, y = finger.y * innerHeight
      markerContext.beginPath(); markerContext.arc(x, y, 7, 0, Math.PI * 2)
      markerContext.strokeStyle = '#d9fff4b3'; markerContext.lineWidth = 1; markerContext.stroke()
      markerContext.beginPath(); markerContext.arc(x, y, 1.5, 0, Math.PI * 2)
      markerContext.fillStyle = '#e5fff6'; markerContext.fill()
    })
  }
}
const loop = new FrameLoop(frame)

document.addEventListener('visibilitychange', () => {
  trackingEpoch++; markersDirty = true
  tracker.clear(); fingers = []; pointer = undefined
  if (!live) return
  stream?.getVideoTracks().forEach(track => { track.enabled = !document.hidden })
  if (document.hidden) video.pause()
  else {
    lastVideoTime = -1; lastDetection = 0; lastResult = performance.now()
    void video.play().catch(reason => { stopCamera(); showError(reason) })
  }
})

window.addEventListener('pagehide', event => {
  stopCamera()
  if (!event.persisted) { disposed = true; loop.close(); water?.close() }
})
window.addEventListener('pageshow', () => loop.start())
canvas.addEventListener('webglcontextlost', event => {
  event.preventDefault(); disposed = true; loop.close(); stopCamera()
  start.disabled = true; showError(new Error('그래픽 연결이 중단됐어요. 페이지를 새로고침해 주세요.'))
})
