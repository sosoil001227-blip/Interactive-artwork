import './style.css'
import '../../shared/navigation.css'
import { HandDetector } from '../../shared/hand-detector'
import { FrameLoop } from '../../shared/frame-loop'
import { element, setText } from '../../shared/dom'
import { JellyGesture, readCorners } from './gesture'
import type { CornerHand, JellyState } from './gesture'
import { describeGesture } from './guidance'
import { JellyUniverse } from './universe'
import { JellySound } from './sound'

const video = element<HTMLVideoElement>('camera')
const start = element<HTMLButtonElement>('start')
const error = element('error')
const sound = new JellySound()
const gesture = new JellyGesture()
let universe: JellyUniverse | undefined
let stream: MediaStream | undefined, detector: HandDetector | undefined
let loading: AbortController | undefined
let live = false, busy = false, disposed = false, detecting = false
let generation = 0, epoch = 0, lastDetection = 0, lastVideoTime = -1, lastResult = 0, lastStale = 0, burstUntil = 0

function showError(reason: unknown) {
  const messages: Record<string, string> = {
    NotAllowedError: '카메라 접근을 허용한 뒤 다시 시작해 주세요. 인앱 브라우저에서 차단된다면 Safari 또는 Chrome에서 열어 주세요.',
    NotFoundError: '사용할 수 있는 카메라가 없어요. 카메라를 연결한 뒤 다시 시도해 주세요.',
    NotReadableError: '카메라를 열 수 없어요. 다른 앱이 카메라를 사용 중인지 확인해 주세요.',
    OverconstrainedError: '이 카메라가 요청한 설정을 지원하지 않아요. 다른 카메라로 다시 시도해 주세요.',
  }
  const name = reason instanceof Error ? reason.name : ''
  error.textContent = messages[name] ?? (reason instanceof Error ? reason.message : '우주를 준비하지 못했어요. 다시 시도해 주세요.')
  error.hidden = false
}

try { universe = new JellyUniverse(element<HTMLCanvasElement>('universe'), () => sound.play('pop')) }
catch (reason) { showError(reason); start.disabled = true }

try {
  const source = new URL(document.referrer)
  if (['localhost', '127.0.0.1', '[::1]'].includes(source.hostname) && source.origin !== location.origin) {
    element<HTMLAnchorElement>('archive-link').href = `${source.origin}/archive/works/`
  }
} catch { /* Direct visits retain the existing archive address. */ }

function updateUI(state: JellyState, now: number) {
  document.body.classList.toggle('has-hole', state.active)
  if (state.burst) burstUntil = now + 700
  let { guide, detail, status } = describeGesture(state)
  if (state.active && now < burstUntil) {
    guide = '달콤한 빅뱅! 젤리가 쏟아져요.'
    detail = '한 번 더 기다리면 다음 젤리가 찾아와요'
  }
  setText(element('guide'), guide); setText(element('charge-label'), detail); setText(element('status'), status)
  const transform = `scaleX(${state.active ? state.progress.toFixed(3) : '0'})`
  if (element('charge-fill').style.transform !== transform) element('charge-fill').style.transform = transform
}

function accept(hands: CornerHand[], now: number) {
  const state = gesture.update(hands, now)
  universe?.setState(state, now)
  if (state.opened) sound.play('open')
  if (state.burst) sound.play('burst')
  updateUI(state, now)
}

function reset() {
  epoch++; burstUntil = 0
  gesture.reset(); universe?.reset()
  updateUI(gesture.update([], performance.now()), performance.now())
}

function stopCamera() {
  generation++; live = false
  loading?.abort(); loading = undefined
  detector?.close(); detector = undefined
  stream?.getTracks().forEach(track => { track.onended = null; track.stop() })
  stream = undefined; video.pause(); video.srcObject = null
  sound.suspend()
  if (universe) universe.live = false
  reset(); lastVideoTime = -1; lastDetection = 0
  document.body.classList.remove('is-live')
  element('welcome').removeAttribute('inert'); element('recipe').removeAttribute('inert')
  element('live-controls').hidden = element('live-status').hidden = true
  start.disabled = !universe; setText(element('start-label'), '카메라로 우주 열기')
}

async function startSound() {
  try { await sound.start() } catch {
    sound.enabled = false
    element('sound').setAttribute('aria-pressed', 'false')
    setText(element('sound-label'), '소리 꺼짐')
  }
}

start.addEventListener('click', async () => {
  if (live || busy || disposed || !universe) return
  if (!navigator.mediaDevices?.getUserMedia) {
    showError(new Error('카메라를 사용하려면 localhost 또는 HTTPS 주소에서 열어 주세요.')); return
  }
  busy = true; start.disabled = true; error.hidden = true
  const attempt = ++generation, controller = new AbortController()
  loading = controller
  void startSound()
  let pendingStream: MediaStream | undefined
  try {
    setText(element('start-label'), '카메라 연결 중')
    pendingStream = await navigator.mediaDevices.getUserMedia({ audio: false,
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
    })
    if (attempt !== generation || disposed) { pendingStream.getTracks().forEach(track => track.stop()); return }
    stream = pendingStream; video.srcObject = stream; await video.play()
    if (attempt !== generation || disposed) return
    setText(element('start-label'), '손 인식 준비 중')
    const loaded = await HandDetector.create(controller.signal)
    if (attempt !== generation || disposed) { loaded.close(); return }
    detector = loaded; loading = undefined
    reset(); live = true; universe.live = true; lastResult = performance.now()
    stream.getVideoTracks().forEach(track => {
      track.onended = () => { stopCamera(); showError(new Error('카메라 연결이 끊겼어요. 다시 켜 주세요.')) }
      if (document.hidden) track.enabled = false
    })
    if (document.hidden) { video.pause(); sound.suspend() }
    document.body.classList.add('is-live')
    element('welcome').setAttribute('inert', ''); element('recipe').setAttribute('inert', '')
    element('live-controls').hidden = element('live-status').hidden = false
    element('stop').focus({ preventScroll: true })
  } catch (reason) {
    pendingStream?.getTracks().forEach(track => track.stop())
    if (attempt !== generation || disposed) return
    stopCamera(); showError(reason)
  } finally {
    busy = false
    if (!disposed) { start.disabled = live || !universe; setText(element('start-label'), '카메라로 우주 열기') }
  }
})

element('stop').addEventListener('click', () => { stopCamera(); start.focus() })
element('reset').addEventListener('click', () => { reset(); sound.suspend(); if (live) void startSound() })
element('markers').addEventListener('click', () => {
  if (!universe) return
  universe.markers = !universe.markers
  element('markers').setAttribute('aria-pressed', String(universe.markers))
})
element('sound').addEventListener('click', () => {
  sound.enabled = !sound.enabled
  element('sound').setAttribute('aria-pressed', String(sound.enabled))
  setText(element('sound-label'), sound.enabled ? '소리' : '소리 꺼짐')
  if (sound.enabled && live) void startSound()
  else sound.suspend()
})

window.addEventListener('resize', () => { universe?.resize(); reset() })
document.addEventListener('visibilitychange', () => {
  reset()
  if (!live) return
  stream?.getVideoTracks().forEach(track => { track.enabled = !document.hidden })
  if (document.hidden) { video.pause(); sound.suspend() }
  else {
    lastVideoTime = -1; lastDetection = 0; lastResult = performance.now()
    void video.play().catch(reason => { stopCamera(); showError(reason) })
    void startSound()
  }
})

const loop = new FrameLoop(now => {
  if (disposed) return
  if (live && detector && !detecting && video.readyState >= 2 && video.currentTime !== lastVideoTime && now - lastDetection >= 33) {
    lastVideoTime = video.currentTime; lastDetection = now; detecting = true
    const attempt = generation, detectionEpoch = epoch
    void detector.detect(video, now).then(result => {
      if (!result || !live || disposed || attempt !== generation || detectionEpoch !== epoch || document.hidden || performance.now() - now > 250) return
      lastResult = performance.now()
      accept(readCorners(result, video.videoWidth, video.videoHeight, innerWidth, innerHeight), now)
    }).catch(reason => {
      if (attempt !== generation || disposed) return
      console.error('Jelly hand tracking failed', reason)
      stopCamera(); showError(new Error('손 추적이 중단됐어요. 카메라를 다시 켜 주세요.'))
    }).finally(() => { detecting = false })
  }
  if (live && now - lastResult > 250 && now - lastStale > 33) { lastStale = now; accept([], now) }
  universe?.draw(now)
})

window.addEventListener('pagehide', event => {
  stopCamera()
  if (!event.persisted) { disposed = true; loop.close(); sound.close() }
})
window.addEventListener('pageshow', () => loop.start())
