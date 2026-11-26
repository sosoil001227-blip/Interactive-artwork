import './style.css'
import '../../shared/navigation.css'
import { HandDetector } from '../../shared/hand-detector'
import { FrameLoop } from '../../shared/frame-loop'
import { element, setText } from '../../shared/dom'
import { MagicGesture, readPalms } from './gestures'
import type { GestureState, Phase } from './gestures'
import { SpellField } from './field'
import { MagicHum } from './hum'

const video = element<HTMLVideoElement>('camera')
const start = element<HTMLButtonElement>('start')
const stop = element<HTMLButtonElement>('stop')
const error = element<HTMLParagraphElement>('error')
const status = element<HTMLSpanElement>('status')
const settingsToggle = element<HTMLButtonElement>('settings-toggle')
const settingsPanel = element<HTMLElement>('controls-panel')
const gesture = new MagicGesture()
const field = new SpellField(element<HTMLCanvasElement>('field'))
const hum = new MagicHum()
let detector: HandDetector | undefined, stream: MediaStream | undefined
let detectorLoad: AbortController | undefined
let live = false, busy = false, disposed = false, generation = 0
let lastDetection = 0, lastVideoTime = -1, lastResult = 0, lastStaleUpdate = 0, detecting = false
let trackingEpoch = 0

const guides: Record<Phase, string> = {
  gather: '손바닥을 서로 마주 보세요.',
  grow: '양손을 좌우로 벌려 보세요.',
  ready: '손가락으로 흔들기 · 손바닥을 카메라로 향해 발사',
  cast: '발사됐어요. 손바닥을 마주 보면 다시 시작해요.',
}

try {
  const source = new URL(document.referrer)
  if (['localhost', '127.0.0.1', '[::1]'].includes(source.hostname) && source.origin !== location.origin) {
    element<HTMLAnchorElement>('archive-link').href = `${source.origin}/archive/works/`
  }
} catch { /* A direct visit uses port 5173 for the archive. */ }

function showError(reason: unknown) {
  const name = reason instanceof Error ? reason.name : ''
  const messages: Record<string, string> = {
    NotAllowedError: '카메라 접근이 허용되지 않았어요. 주소창에서 카메라 권한을 허용한 뒤 다시 시작해 주세요.',
    NotFoundError: '카메라를 찾을 수 없어요. 카메라를 연결하고 다시 시도해 주세요.',
    NotReadableError: '카메라를 열 수 없어요. 다른 앱이 카메라를 사용 중인지 확인해 주세요.',
  }
  error.hidden = false
  error.textContent = messages[name] || (reason instanceof Error ? reason.message : '카메라를 시작하지 못했어요. 다시 시도해 주세요.')
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

function updateUI(state: GestureState) {
  const count = state.palms.length
  if (document.body.dataset.phase !== state.phase) document.body.dataset.phase = state.phase
  document.body.classList.toggle('is-resonating', state.resonance > .18)
  setText(element('hand-count'), String(count))
  setText(element('finger-count'), String(count * 5))
  const trackingMessage = !live ? '카메라 대기 중' : count === 2 ? '양손 인식됨' : count === 1 ? '한 손 인식됨' : '손 찾는 중'
  if (status.textContent !== trackingMessage) status.textContent = trackingMessage
  let instruction = guides[state.phase]
  if (count < 2 && state.phase !== 'cast') instruction = count === 1 ? '다른 손도 화면 안에 펼쳐 주세요.' : '양손을 화면 안에 펼쳐 주세요.'
  else if ((state.phase === 'gather' || state.phase === 'grow') && state.palms.some(p => p.extended < 3)) instruction = '손가락을 펴고 손바닥을 마주 보세요.'
  else if (state.phase === 'ready' && state.resonance > .18) instruction = '손끝을 따라 떨려요. 손바닥을 카메라로 돌려 발사하세요.'
  if (element('guide-text').textContent !== instruction) element('guide-text').textContent = instruction
  const width = `${(state.phase === 'grow' ? state.charge : state.progress) * 100}%`
  if (element('dwell-fill').style.width !== width) element('dwell-fill').style.width = width
  const index = state.phase === 'gather' ? 0 : state.phase === 'grow' ? 1 : 2
  setText(element('current-step'), state.phase === 'cast' ? '발사 완료' : ['1 모으기', '2 펼치기', '3 발사'][index]!)
  ;['step-gather', 'step-grow', 'step-cast'].forEach((id, i) => {
    element(id).classList.toggle('current', i === index)
    element(id).classList.toggle('complete', i < index || state.phase === 'cast')
    if (i === index && !element(id).hasAttribute('aria-current')) element(id).setAttribute('aria-current', 'step')
    else if (i !== index && element(id).hasAttribute('aria-current')) element(id).removeAttribute('aria-current')
  })
}

function resetMagic() {
  trackingEpoch++
  gesture.reset(); field.clear(); hum.silence()
  updateUI(gesture.update([], performance.now()))
}

function setSettingsOpen(open: boolean, returnFocus = false) {
  settingsPanel.hidden = !open
  settingsToggle.setAttribute('aria-expanded', String(open))
  if (returnFocus) settingsToggle.focus({ preventScroll: true })
}

function stopCamera() {
  generation++; live = false; field.live = false
  detectorLoad?.abort(); detectorLoad = undefined
  detector?.close(); detector = undefined
  hum.suspend()
  setSettingsOpen(false)
  stream?.getTracks().forEach(track => { track.onended = null; track.stop() })
  stream = undefined; video.pause(); video.srcObject = null
  lastDetection = 0; lastVideoTime = -1; resetMagic()
  document.body.classList.remove('is-live')
  element('welcome').removeAttribute('inert')
  element('live-guide').hidden = true; stop.hidden = true
  element('status-dot').classList.remove('live'); status.textContent = '카메라 대기 중'
}

start.addEventListener('click', async () => {
  if (busy || live) return
  if (!navigator.mediaDevices?.getUserMedia) { showError(new Error('카메라를 사용하려면 localhost 또는 HTTPS 주소에서 열어 주세요.')); return }
  busy = true; start.disabled = true; error.hidden = true
  const attempt = ++generation
  // Resume sound while the button's user gesture is still active.
  void hum.start().catch(() => {
    hum.enabled = false
    element<HTMLButtonElement>('sound').disabled = true
    element('sound').querySelector('.control-state')!.textContent = '꺼짐'
    element('sound').setAttribute('aria-pressed', 'false')
  })
  let pendingStream: MediaStream | undefined
  try {
    start.querySelector('span')!.textContent = '카메라 연결 중'
    pendingStream = await navigator.mediaDevices.getUserMedia({ audio: false,
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
    })
    if (attempt !== generation || disposed) { pendingStream.getTracks().forEach(t => t.stop()); return }
    stream = pendingStream; video.srcObject = stream; await video.play()
    if (attempt !== generation || disposed) return
    start.querySelector('span')!.textContent = '손 인식 준비 중'
    await loadDetector(attempt)
    if (attempt !== generation || disposed) { if (disposed) { detector?.close(); detector = undefined }; return }
    resetMagic(); live = true; field.live = true; lastResult = performance.now()
    if (document.hidden) { video.pause(); stream.getVideoTracks().forEach(track => { track.enabled = false }); hum.suspend() }
    stream.getVideoTracks().forEach(track => { track.onended = () => { stopCamera(); showError(new Error('카메라 연결이 끊겼어요. 다시 시작해 주세요.')) } })
    document.body.classList.add('is-live'); element('welcome').setAttribute('inert', '')
    element('live-guide').hidden = false; stop.hidden = false
    element('status-dot').classList.add('live'); stop.focus({ preventScroll: true })
  } catch (reason) {
    if (attempt !== generation || disposed) return
    pendingStream?.getTracks().forEach(t => t.stop()); stopCamera(); showError(reason)
  } finally {
    busy = false; start.disabled = false
    start.querySelector('span')!.textContent = '카메라 켜고 시작하기'
  }
})

stop.addEventListener('click', () => { stopCamera(); start.focus() })
settingsToggle.addEventListener('click', () => setSettingsOpen(Boolean(settingsPanel.hidden)))
element('settings-close').addEventListener('click', () => setSettingsOpen(false, true))
document.addEventListener('pointerdown', event => {
  if (!settingsPanel.hidden && !(event.target as Element).closest('.control-dock')) setSettingsOpen(false)
})
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !settingsPanel.hidden) { event.preventDefault(); setSettingsOpen(false, true) }
})
element('reset').addEventListener('click', () => { setSettingsOpen(false); resetMagic() })
element('sound').addEventListener('click', event => {
  hum.enabled = !hum.enabled
  const button = event.currentTarget as HTMLButtonElement
  button.setAttribute('aria-pressed', String(hum.enabled)); button.querySelector('.control-state')!.textContent = hum.enabled ? '켜짐' : '꺼짐'
  if (!hum.enabled) hum.suspend()
  else if (live) void hum.start().catch(() => { hum.enabled = false; button.setAttribute('aria-pressed', 'false'); button.querySelector('.control-state')!.textContent = '꺼짐' })
})
element('markers').addEventListener('click', event => {
  field.markers = !field.markers
  const button = event.currentTarget as HTMLButtonElement
  button.setAttribute('aria-pressed', String(field.markers)); button.querySelector('.control-state')!.textContent = field.markers ? '켜짐' : '꺼짐'
})
window.addEventListener('resize', () => { field.resize(); resetMagic() })
document.addEventListener('visibilitychange', () => {
  resetMagic()
  if (!live) return
  stream?.getVideoTracks().forEach(track => { track.enabled = !document.hidden })
  if (document.hidden) { video.pause(); hum.suspend() }
  else {
    lastVideoTime = -1; lastDetection = 0; lastResult = performance.now()
    void video.play().catch(reason => { stopCamera(); showError(reason) })
    void hum.start().catch(() => {})
  }
})

function frame(now: number) {
  if (disposed) return
  if (!document.hidden) {
    if (live && detector && !detecting && video.readyState >= 2 && video.currentTime !== lastVideoTime && now - lastDetection >= 33) {
      lastVideoTime = video.currentTime; lastDetection = now
      detecting = true
      const attempt = generation, epoch = trackingEpoch
      void detector.detect(video, now).then(result => {
        if (!result || attempt !== generation || epoch !== trackingEpoch || !live || document.hidden || performance.now() - now > 250) return
        lastResult = performance.now()
        const palms = readPalms(result, video.videoWidth, video.videoHeight, innerWidth, innerHeight)
        const state = gesture.update(palms, now)
        if (state.summoned) hum.summon()
        field.setState(state, now); hum.update(state.resonance); updateUI(state)
      }).catch(reason => {
        if (attempt !== generation || disposed) return
        console.error('Hand tracking failed', reason); stopCamera()
        showError(new Error('손 추적이 중단됐어요. 카메라를 다시 켜 주세요.'))
      }).finally(() => { detecting = false })
    }
    if (live && now - lastResult > 280 && now - lastStaleUpdate >= 33) {
      lastStaleUpdate = now
      const state = gesture.update([], now); field.setState(state, now); hum.update(0); updateUI(state)
    }
    field.draw(now)
  }
}
const loop = new FrameLoop(frame)
window.addEventListener('pagehide', event => {
  stopCamera()
  if (!event.persisted) { disposed = true; loop.close(); hum.close() }
})
window.addEventListener('pageshow', () => loop.start())
