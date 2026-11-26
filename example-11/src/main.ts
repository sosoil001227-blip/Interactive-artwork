import '../../shared/navigation.css'
import './style.css'
import './theatre-ui.css'
import './performance.css'
import './atmosphere.css'
import './invitation.css'
import './glass-theatre.css'
import { element, setText } from '../../shared/dom'
import { HandDetector } from '../../shared/hand-detector'
import { FrameLoop } from '../../shared/frame-loop'
import { HandStabilizer } from './tracking'
import { MarionetteRig } from './rig'
import { Conductor } from './music'
import { OperaAudio } from './audio'
import { PuppetStage } from './stage'
import { LiveScore } from './score'
import { openingAt } from './opening'
import { loadTheatreSprites } from './sprites'
import { SONG_DURATION, MELODY } from './song'
import { FaceCamera } from './face-camera'
import { HandTools } from './hand-tools'

const video = element<HTMLVideoElement>('camera'), start = element<HTMLButtonElement>('start')
const audio = new OperaAudio(), tracker = new HandStabilizer(), rig = new MarionetteRig(), conductor = new Conductor()
const faceCamera = new FaceCamera(video)
const handTools = new HandTools(element<HTMLCanvasElement>('left-hand-tool'),element<HTMLCanvasElement>('right-hand-tool'))
const spritesReady = loadTheatreSprites()
void spritesReady.catch(reason => showError(reason))
const reduced = matchMedia('(prefers-reduced-motion: reduce)')
let stage: PuppetStage | undefined, score: LiveScore | undefined
let detector: HandDetector | undefined, stream: MediaStream | undefined, loading: AbortController | undefined
let phase: 'idle' | 'preparing' | 'performing' | 'closing' | 'ending' = 'idle'
let generation = 0, epoch = 0, disposed = false, detecting = false
let openingStarted = 0, pauseStarted: number | undefined, lastFrame = 0, lastDetection = 0, lastVideoTime = -1, lastUI = 0
let closeTimer = 0, markers = false, audioAvailable = true, ovationPlayed = false
let guideOpen = false, guideReturn: HTMLElement | undefined

function showError(reason: unknown) {
  const messages: Record<string, string> = {
    NotAllowedError: '카메라 접근을 허용한 뒤 공연을 다시 시작해 주세요. 인앱 브라우저가 차단한다면 Safari나 Chrome에서 열어 주세요.',
    NotFoundError: '사용할 수 있는 카메라가 없어요. 카메라를 연결한 뒤 다시 시작해 주세요.',
    NotReadableError: '카메라를 열 수 없어요. 다른 앱에서 카메라를 사용 중인지 확인해 주세요.',
  }
  const name = reason instanceof Error ? reason.name : ''
  setText(element('error'), messages[name] ?? (reason instanceof Error ? reason.message : '공연을 준비하지 못했어요. 다시 시도해 주세요.'))
  element('error').hidden = false
}
try {
  stage = new PuppetStage(element<HTMLCanvasElement>('stage'))
  score = new LiveScore(element<HTMLCanvasElement>('score'))
} catch (reason) { showError(reason); start.disabled = true }

function setOpening(curtain: number, sign: number) {
  const left = `translateX(${-103 * curtain}%)`, right = `translateX(${103 * curtain}%)`
  if (element('curtain-left').style.transform !== left) element('curtain-left').style.transform = left
  if (element('curtain-right').style.transform !== right) element('curtain-right').style.transform = right
  const lift = `translate(-50%, ${-140 * sign}vh)`
  if (element('welcome').style.transform !== lift) element('welcome').style.transform = lift
}
function closeGuide(restoreFocus = true) {
  guideOpen = false; element('viewing-guide').hidden = true
  conductor.resetMotion()
  if (restoreFocus) (guideReturn ?? start).focus({ preventScroll: true })
}
function openGuide() {
  if (phase === 'preparing' || phase === 'closing' || phase === 'ending') return
  guideReturn = document.activeElement instanceof HTMLElement ? document.activeElement : start
  guideOpen = true; element('viewing-guide').hidden = false; audio.pause(); conductor.resetMotion()
  setText(element('guide-enter'), phase === 'performing' ? '공연으로 돌아가기 ↗' : '공연 시작 ↗')
  element('guide-enter').focus({ preventScroll: true })
}
function finishClosing() {
  clearTimeout(closeTimer); closeTimer = 0; phase = 'idle'
  document.body.classList.remove('is-performing', 'is-closing', 'is-ending')
  element('ending-screen').hidden = true
  document.querySelector('.topbar')?.removeAttribute('inert')
  element('welcome').removeAttribute('inert'); element('opening-action').removeAttribute('inert')
  element('stage').style.removeProperty('opacity'); setOpening(0, 0); element('welcome').style.removeProperty('transform')
  stage?.clear(); rig.reset(); conductor.reset(); start.disabled = !stage || !score
  setText(element('start-label'), '공연 시작')
  document.querySelector<HTMLDetailsElement>('.dock-settings')?.removeAttribute('open')
}
function showEnding() {
  closeTimer = 0; phase = 'ending'
  document.body.classList.remove('is-performing', 'is-closing')
  document.body.classList.add('is-ending')
  document.querySelector('.topbar')?.setAttribute('inert', '')
  stage?.clear(); element('ending-screen').hidden = false
  element('encore').focus({ preventScroll: true })
}
function stopPerformance(animate = true) {
  generation++; epoch++; closeGuide(false)
  loop.pause()
  faceCamera.close()
  handTools.hide()
  loading?.abort(); loading = undefined; detector?.close(); detector = undefined
  stream?.getTracks().forEach(track => { track.onended = null; track.stop() })
  stream = undefined; video.pause(); video.srcObject = null
  audio.close(); tracker.reset(); pauseStarted = undefined
  lastVideoTime = -1; lastDetection = lastFrame = 0
  element('controls').hidden = element('score-panel').hidden = true
  if (animate && phase === 'performing' && !document.hidden) {
    phase = 'closing'; document.body.classList.add('is-closing'); setOpening(0, 1); element('stage').style.opacity = '0'
    closeTimer = window.setTimeout(showEnding, reduced.matches ? 10 : 850)
  } else finishClosing()
}

async function beginPerformance() {
  if (phase !== 'idle' || disposed || !stage || !score) return
  if (!navigator.mediaDevices?.getUserMedia) { showError(new Error('카메라를 사용하려면 localhost 또는 HTTPS 주소에서 열어 주세요.')); return }
  phase = 'preparing'; start.disabled = true; element('error').hidden = true; audioAvailable = true
  element<HTMLButtonElement>('sound').disabled = element<HTMLButtonElement>('echo').disabled = false
  setText(element('sound-label'), audio.enabled?'소리 켜짐':'소리 꺼짐')
  element('sound').setAttribute('aria-pressed',String(audio.enabled))
  const attempt = ++generation, controller = new AbortController(); loading = controller
  // Unlock inside the start/guide button gesture; no audio files or remote players.
  const soundReady = audio.start().catch(() => {
    if (attempt !== generation || disposed) return
    audioAvailable = false; audio.close()
    element<HTMLButtonElement>('sound').disabled = element<HTMLButtonElement>('echo').disabled = true
    setText(element('sound-label'), '오디오 미지원')
  })
  let pending: MediaStream | undefined
  try {
    setText(element('start-label'), '카메라 연결 중')
    pending = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } } })
    if (attempt !== generation || disposed) { pending.getTracks().forEach(track => track.stop()); return }
    stream = pending; video.srcObject = stream; await video.play()
    if (attempt !== generation || disposed) return
    setText(element('start-label'), '퍼펫을 준비하는 중')
    const loaded = await HandDetector.create(controller.signal)
    if (attempt !== generation || disposed) { loaded.close(); return }
    detector = loaded; loading = undefined
    const sprites = await spritesReady; await soundReady
    if (attempt !== generation || disposed) return
    stage.sprites = sprites; tracker.reset(); rig.reset(); conductor.reset(); ovationPlayed = false
    phase = 'performing'; openingStarted = performance.now(); lastFrame = 0
    loop.start()
    document.body.classList.add('is-performing'); element('welcome').setAttribute('inert', ''); element('opening-action').setAttribute('inert', '')
    faceCamera.start()
    element('controls').hidden = false; setOpening(0, 0)
    stream.getVideoTracks().forEach(track => {
      track.onended = () => { stopPerformance(false); showError(new Error('카메라 연결이 끊겼어요. 공연을 다시 시작해 주세요.')) }
      track.enabled = !document.hidden
    })
    if (document.hidden) { pauseStarted = performance.now(); video.pause(); audio.suspend() }
    element('stop').focus({ preventScroll: true })
  } catch (reason) {
    pending?.getTracks().forEach(track => track.stop())
    if (attempt !== generation || disposed) return
    stopPerformance(false); showError(reason)
  }
}
start.addEventListener('click', openGuide)
element('guide-enter').addEventListener('click', () => {
  closeGuide(false)
  if (phase === 'idle') void beginPerformance(); else element('help').focus({ preventScroll: true })
})
element('guide-cancel').addEventListener('click', () => closeGuide())
element('help').addEventListener('click', openGuide)
element('stop').addEventListener('click', () => stopPerformance())
element('encore').addEventListener('click', () => { finishClosing(); void beginPerformance() })
element('ending-home').addEventListener('click', () => { finishClosing(); start.focus({ preventScroll: true }) })
element('calibrate').addEventListener('click', () => rig.calibrate())
element('restart').addEventListener('click', () => { conductor.reset(); audio.pause() })
element('echo').addEventListener('click', () => {
  audio.setEcho(!audio.echo); element('echo').setAttribute('aria-pressed', String(audio.echo)); setText(element('echo-state'), audio.echo ? '켜짐' : '꺼짐')
})
element('sound').addEventListener('click', () => {
  audio.setEnabled(!audio.enabled); conductor.resetMotion()
  element('sound').setAttribute('aria-pressed', String(audio.enabled))
  setText(element('sound-label'),audio.enabled?'소리 켜짐':'소리 꺼짐')
  if (audio.enabled && audioAvailable) void audio.start().catch(() => { audioAvailable = false })
  else audio.pause()
})
element('markers').addEventListener('click', () => { markers = !markers; element('markers').setAttribute('aria-pressed', String(markers)) })
function setExpanded(expanded: boolean) {
  if (!score) return
  score.expanded = expanded; element('score-panel').classList.toggle('is-expanded', expanded)
  element('score-toggle').setAttribute('aria-expanded', String(expanded))
  element('score-toggle').setAttribute('aria-label', expanded ? '실제 멜로디 악보 축소' : '실제 멜로디 악보 확대')
  setText(element('score-size-label'), expanded ? '눌러서 축소 ↙' : '눌러서 확대 ↗')
}
element('score-toggle').addEventListener('click', () => setExpanded(!score?.expanded))
document.addEventListener('keydown', event => {
  if (guideOpen || phase === 'ending') {
    if (event.key === 'Escape') {
      event.preventDefault()
      if (guideOpen) closeGuide()
      else { finishClosing(); start.focus({ preventScroll: true }) }
      return
    }
    if (event.key === 'Tab') {
      const dialog = element(guideOpen ? 'viewing-guide' : 'ending-screen')
      const buttons = dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
      const first = buttons[0], last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
  } else if (event.key === 'Escape') { setExpanded(false); document.querySelector('.dock-settings')?.removeAttribute('open') }
})
document.addEventListener('click', event => {
  const button = event.target instanceof Element ? event.target.closest<HTMLElement>('button.jelly-button') : null
  if (!button || reduced.matches) return
  button.classList.remove('jelly-pop'); void button.offsetWidth; button.classList.add('jelly-pop')
})
document.addEventListener('animationend', event => { if (event.animationName === 'jelly-pop' && event.target instanceof Element) event.target.classList.remove('jelly-pop') })

window.addEventListener('resize', () => { epoch++; tracker.reset(); rig.calibrate(); faceCamera.suspend(); stage?.resize() })
document.addEventListener('visibilitychange', () => {
  epoch++; tracker.reset(); rig.calibrate(); conductor.resetMotion()
  faceCamera.suspend()
  handTools.hide()
  if (phase !== 'performing') return
  stream?.getVideoTracks().forEach(track => { track.enabled = !document.hidden })
  if (document.hidden) { pauseStarted = performance.now(); video.pause(); audio.suspend() }
  else {
    faceCamera.start()
    if (pauseStarted !== undefined) openingStarted += performance.now() - pauseStarted
    pauseStarted = undefined; lastFrame = 0; lastVideoTime = -1
    void video.play().catch(reason => { stopPerformance(false); showError(reason) })
    if (audioAvailable) void audio.start().catch(() => { audioAvailable = false })
  }
})
const formatTime = (time: number) => `0:${String(Math.floor(time)).padStart(2, '0')}`
element<HTMLProgressElement>('clip-progress').max = SONG_DURATION
const loop = new FrameLoop(now => {
  if (disposed || phase !== 'performing' || !stage || !score) return
  if (detector && !detecting && video.readyState >= 2 && video.currentTime !== lastVideoTime && now - lastDetection >= 33) {
    lastDetection = now; lastVideoTime = video.currentTime; detecting = true
    const attempt = generation, inputEpoch = epoch
    void detector.detect(video, now).then(result => {
      const received = performance.now()
      if (!result || disposed || phase !== 'performing' || attempt !== generation || inputEpoch !== epoch || document.hidden || received - now > 450) return
      tracker.update(result, video.videoWidth, video.videoHeight, innerWidth, innerHeight, received)
    }).catch(reason => {
      if (attempt !== generation || disposed) return
      console.error('Puppet hand tracking failed', reason); stopPerformance(false); showError(new Error('손 추적이 중단됐어요. 공연을 다시 시작해 주세요.'))
    }).finally(() => { detecting = false })
  }
  const dt = lastFrame ? (now - lastFrame) / 1000 : 1 / 60; lastFrame = now
  const hands = tracker.snapshot(now), opening = openingAt(now - openingStarted, reduced.matches)
  faceCamera.update(now, innerWidth, innerHeight)
  const pose = rig.update(hands.left, dt, innerWidth, innerHeight)
  if (opening.ovation && !ovationPlayed) { ovationPlayed = true; audio.ovation() }
  conductor.setEnabled(opening.musicReady && !guideOpen && audio.enabled && audioAvailable)
  const music = conductor.update(opening.musicReady && !guideOpen ? hands.right : undefined, now, innerHeight, innerWidth, audioAvailable ? audio.clock : now / 1000)
  audio.update(music); stage.draw(now, now - openingStarted, pose, music, hands, markers)
  if(opening.ready&&!guideOpen)handTools.draw(video,hands,music,innerWidth,innerHeight)
  else handTools.hide()
  setOpening(opening.curtain, opening.sign)
  if (element('score-panel').hidden === opening.ready) element('score-panel').hidden = !opening.ready
  if (opening.ready) score.draw(music, now)
  if (now - lastUI < 100) return
  lastUI = now
  const guide = !audioAvailable ? '이 브라우저에서 오디오를 사용할 수 없어요.' : !opening.musicReady ? '무대가 열리면 양손을 보여 주세요.'
    : music.completed ? '멋진 공연이었어요. 다시 노래하려면 ↻를 눌러 주세요.' : !hands.right ? '오른손을 보여 주고 지휘봉을 좌우로 흔들어 주세요.'
    : music.active ? '왼손으로 연기하고, 오른손으로 노래를 지휘해요.' : '지휘봉을 좌우로 흔들면 멈춘 곳부터 이어 불러요.'
  setText(element('guide'), guide)
  for (const [id, hand] of [['left-status', hands.left], ['right-status', hands.right]] as const) {
    element(id).classList.toggle('is-tracked', !!hand)
    setText(element(id).querySelector('span')!, hand ? '인식됨' : '대기')
  }
  element('right-status').classList.toggle('is-conducting', music.active)
  element<HTMLMeterElement>('voice-volume').value = music.volume
  setText(element('volume-value'), `${Math.round(music.volume * 100)}%`)
  setText(element('note-name'), music.name)
  setText(element('frequency'), music.completed ? '공연 완료' : music.active ? `${music.noteIndex + 1} / ${MELODY.length} · 노래 중` : `${music.noteIndex + 1} / ${MELODY.length} · 지휘 대기`)
  setText(element('syllable'), music.syllable)
  element<HTMLProgressElement>('clip-progress').value = music.elapsed
  setText(element('clip-time'), `${formatTime(music.elapsed)} / ${formatTime(SONG_DURATION)}`)
}, false)
window.addEventListener('pagehide', event => { stopPerformance(false); if (!event.persisted) { disposed = true; loop.close() } })
window.addEventListener('pageshow', () => { if (phase === 'performing') loop.start() })
const navigation = document.querySelector<HTMLElement>('.example-switcher')
if (navigation && navigation.scrollWidth > navigation.clientWidth) navigation.scrollLeft = navigation.scrollWidth
