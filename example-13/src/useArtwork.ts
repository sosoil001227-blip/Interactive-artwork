import { useEffect, useRef, useState } from 'react'
import { MaskScene } from './art.ts'
import { CameraTracker } from './tracking.ts'
import type { HandTrackingState } from './tracking.ts'
import { trackingProfile } from './trackingProfile.ts'
import type { HandGestureStatus } from './handGesture.ts'
import { NodDetector } from './gesture.ts'
import type { NodState } from './gesture.ts'
import { Assembly, assemblyMs } from './animation.ts'
import type { MaskState } from './animation.ts'
import type { MaskKind } from './rig.ts'
import type { MarioStage } from './marioGesture.ts'
import type { ConanStatus } from './conanGesture.ts'
import type { CrayonTool, ShinchanStatus } from './shinchanGesture.ts'
import { initialCoraline } from './coralineGesture.ts'
import type { CoralineStatus } from './coralineGesture.ts'
import { initialBo } from './boGesture.ts'
import type { BoStatus } from './boGesture.ts'

type CameraState = 'preview' | 'connecting' | 'loading' | 'live'
interface Controls { camera(): void; toggleMask(): void; replay(): void; reset(): void; select(kind: MaskKind): void; toggleSound(): void; conanReveal():void; selectCrayon(tool: CrayonTool): void; clearDrawing(): void }
const idle = { tracked: false, nod: 'calibrating' as NodState['phase'] }
const initialShinchan: ShinchanStatus = { stage: 'offering', tool: 'peach', holding: false, drawing: false, hands: 0, painted: 0, face: false, body: 'loading' }
type HandStatus = HandGestureStatus | Exclude<HandTrackingState, 'ready'>

function errorMessage(error: unknown) {
  if (!(error instanceof Error)) return '카메라를 연결하지 못했어요.'
  if (error.name === 'NotAllowedError') return '브라우저에서 카메라 권한을 허용한 뒤 다시 연결해 주세요.'
  if (error.name === 'NotFoundError') return '연결된 카메라를 찾지 못했어요.'
  if (error.name === 'NotReadableError') return '다른 앱에서 카메라를 사용 중인지 확인해 주세요.'
  return error.message
}

export function useArtwork() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const controls = useRef<Controls | null>(null)
  const [camera, setCamera] = useState<CameraState>('preview')
  const [mask, setMask] = useState<MaskState>('locked')
  const [kind, setKind] = useState<MaskKind>('iron-man')
  const [status, setStatus] = useState(idle)
  const [handStatus, setHandStatus] = useState<HandStatus>('loading')
  const [error, setError] = useState('')
  const [sound, setSound] = useState(true)
  const [mario, setMario] = useState<{ stage: MarioStage; score: number; hands: number; fingers: number }>({ stage: 'spread', score: 0, hands: 0, fingers: 0 })
  const [conan, setConan] = useState<ConanStatus>({ stage: 'glasses', glasses: false, suit: false, hands: 0, leftPoint: false, reveals: 0 })
  const [shinchan, setShinchan] = useState<ShinchanStatus>(initialShinchan)
  const [coraline, setCoraline] = useState<CoralineStatus>(initialCoraline)
  const [bo, setBo] = useState<BoStatus>(initialBo)
  const [cameraAspect, setCameraAspect] = useState<number>()

  useEffect(() => {
    if (!canvas.current) return
    const scene = new MaskScene(canvas.current)
    const nod = new NodDetector()
    const assembly = new Assembly()
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    assembly.engage(true)
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    const readCameraAspect = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) setCameraAspect(video.videoWidth / video.videoHeight)
    }
    video.addEventListener('resize', readCameraAspect)
    let stream: MediaStream | undefined
    let tracker: CameraTracker | undefined
    let attempt: AbortController | undefined
    let mode: CameraState = 'preview'
    let selected: MaskKind = 'iron-man'
    let demoGoldUntil = 0
    let disposed = false, busy = false
    let frameRequest = 0, previousTime = 0, lastCapture = -Infinity, lastVideoTime = -1
    let current = idle
    let handTracking: HandTrackingState | undefined
    let currentHandStatus: HandStatus = 'loading'
    let handEpoch = 0
    let currentMario = { stage: 'spread' as MarioStage, score: 0, hands: 0, fingers: 0 }
    let currentConan: ConanStatus = { stage: 'glasses', glasses: false, suit: false, hands: 0, leftPoint: false, reveals: 0 }
    let currentShinchan = initialShinchan
    let currentCoraline = initialCoraline
    let currentBo = initialBo

    function report(tracked: boolean, phase: NodState['phase']) {
      if (tracked === current.tracked && phase === current.nod) return
      current = { tracked, nod: phase }
      setStatus(current)
    }

    function updateCamera(state: CameraState) { mode = state; setCamera(state) }

    function resetHands() {
      handEpoch++
      scene.clearHands()
    }

    function detach() {
      attempt?.abort()
      attempt = undefined
      tracker?.close(); tracker = undefined
      stream?.getTracks().forEach(track => { track.onended = null; track.stop() })
      stream = undefined
      video.pause()
      video.srcObject = null
      if (!disposed) setCameraAspect(undefined)
      busy = false
      demoGoldUntil = 0
      lastCapture = -Infinity; lastVideoTime = -1
      nod.reset()
      handTracking = undefined
      resetHands()
    }

    function returnToPreview(message = '') {
      detach()
      scene.setLive(false)
      updateCamera('preview')
      assembly.reset()
      assembly.engage(true)
      setMask(assembly.state)
      report(false, 'calibrating')
      setError(message)
    }

    async function start() {
      scene.unlockAudio()
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('카메라는 localhost 또는 HTTPS 주소에서 사용할 수 있어요.')
        return
      }
      const request = new AbortController()
      attempt = request
      setError('')
      updateCamera('connecting')
      demoGoldUntil = 0
      scene.setLive(true)
      assembly.reset()
      if (selected === 'conan' || selected === 'shinchan' || selected === 'coraline' || selected === 'bo') assembly.engage(true)
      setMask(assembly.state)
      try {
        const connected = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } },
        })
        if (request.signal.aborted || disposed) {
          connected.getTracks().forEach(track => track.stop())
          return
        }
        stream = connected
        stream.getVideoTracks().forEach(track => {
          track.enabled = !document.hidden
          track.onended = () => returnToPreview('카메라 연결이 끊겼어요. 다시 연결해 주세요.')
        })
        video.srcObject = stream
        if (!document.hidden) await video.play()
        if (request.signal.aborted || disposed) return
        readCameraAspect()
        updateCamera('loading')
        const profile = trackingProfile(selected, assembly.state)
        const next = await CameraTracker.create(request.signal, profile.body, profile.body, profile.expressions)
        if (request.signal.aborted || disposed) { next.close(); return }
        tracker = next
        updateCamera('live')
      } catch (reason) {
        if (!request.signal.aborted && !disposed) returnToPreview(errorMessage(reason))
      }
    }

    function render(now: number) {
      frameRequest = 0
      if (disposed || document.hidden) return
      const { body, hands, expressions } = trackingProfile(selected, assembly.state)
      if (tracker && !busy && video.readyState >= 2 && video.currentTime !== lastVideoTime && now - lastCapture >= (body ? 65 : 34)) {
        const session = attempt
        const epoch = handEpoch
        busy = true
        lastVideoTime = video.currentTime
        lastCapture = now
        void tracker.capture(video, now, hands, body, expressions).then(result => {
          if (!result) return
          const received = performance.now()
          if (session !== attempt || epoch !== handEpoch || document.hidden || disposed || received - result.frame.timestamp > 900) {
            result.image.close()
            return
          }
          handTracking = result.frame.handTracking ?? handTracking
          const trackHands = hands === 'track' && (body || assembly.state === 'locked')
          const faceVisible = scene.ingest(result.image, result.frame, received, trackHands && !!result.frame.hands?.length)
          if (selected === 'bo') {
            scene.updateBo(result.frame, received)
            report(faceVisible, 'ready')
            return
          }
          if (selected === 'coraline') {
            scene.updateCoraline(result.frame, received)
            report(faceVisible, scene.coralineStatus(received).nod)
            return
          }
          if (trackHands) {
            scene.updateHands(result.frame, received, reduced.matches)
          }
          if (selected === 'conan' || selected === 'shinchan') { report(faceVisible, 'ready'); return }
          if (!faceVisible) return
          const signal = nod.update(result.frame)
          report(true, signal.phase)
          if (signal.fired && assembly.state === 'off') {
            assembly.engage(reduced.matches)
            setMask(assembly.state)
          }
        }).catch(reason => {
          if (session === attempt && !disposed) returnToPreview(errorMessage(reason))
        }).finally(() => { if (session === attempt) busy = false })
      }
      const visible = scene.visible(now)
      if (!visible && current.tracked) {
        nod.reset()
        report(false, 'calibrating')
      }
      const before = assembly.state
      assembly.tick(previousTime ? now - previousTime : 16, mode === 'preview' || visible)
      if (before !== assembly.state) setMask(assembly.state)
      if (selected !== 'no-face' && assembly.state === 'locked') {
        const next: HandStatus = handTracking === 'ready' ? scene.handStatus(now) : handTracking ?? 'loading'
        if (next !== currentHandStatus) {
          currentHandStatus = next
          setHandStatus(next)
        }
      }
      if (selected === 'mario') {
        const next = scene.marioStatus(now)
        if (next.stage !== currentMario.stage || next.score !== currentMario.score || next.hands !== currentMario.hands || next.fingers !== currentMario.fingers) {
          currentMario = next
          setMario(next)
        }
      }
      if (selected === 'conan') {
        const next = scene.conanStatus(now)
        if (next.stage !== currentConan.stage || next.glasses !== currentConan.glasses || next.suit !== currentConan.suit
          || next.hands !== currentConan.hands || next.leftPoint !== currentConan.leftPoint || next.reveals !== currentConan.reveals || next.body !== currentConan.body) {
          currentConan = next
          setConan(next)
        }
      }
      if (selected === 'shinchan') {
        const next = scene.shinchanStatus(now)
        if ((Object.keys(next) as (keyof ShinchanStatus)[]).some(key => next[key] !== currentShinchan[key])) {
          currentShinchan = next
          setShinchan(next)
        }
      }
      if (selected === 'coraline') {
        const next = scene.coralineStatus(now)
        if ((Object.keys(next) as (keyof CoralineStatus)[]).some(key => next[key] !== currentCoraline[key])) {
          currentCoraline = next
          setCoraline(next)
        }
      }
      if (selected === 'bo') {
        const next = scene.boStatus(now)
        if ((Object.keys(next) as (keyof BoStatus)[]).some(key => next[key] !== currentBo[key])) {
          currentBo = next
          setBo(next)
        }
      }
      previousTime = now
      const demoGold = mode === 'preview' && selected === 'no-face'
        && assembly.state === 'locked' && assembly.elapsed < demoGoldUntil
      scene.draw(now, video, assembly.state, assembly.elapsed, reduced.matches, demoGold)
      frameRequest = requestAnimationFrame(render)
    }

    function visibility() {
      cancelAnimationFrame(frameRequest)
      previousTime = frameRequest = 0
      stream?.getVideoTracks().forEach(track => { track.enabled = !document.hidden })
      nod.reset()
      resetHands()
      scene.invalidate(true)
      report(false, 'calibrating')
      if (document.hidden) { video.pause(); scene.silenceAudio() }
      else {
        scene.unlockAudio()
        const session = attempt
        if (stream) void video.play().catch(reason => { if (session === attempt && !disposed) returnToPreview(errorMessage(reason)) })
        frameRequest = requestAnimationFrame(render)
      }
    }

    const pagehide = () => { if (mode !== 'preview') returnToPreview() }
    controls.current = {
      camera: () => mode === 'preview' ? void start() : returnToPreview(),
      select: kind => {
        if (selected === kind) return
        selected = kind
        setKind(kind)
        demoGoldUntil = 0
        handEpoch++
        scene.select(kind)
        setSound(scene.soundEnabled())
        scene.unlockAudio()
        if (kind === 'conan' || kind === 'shinchan' || kind === 'coraline' || kind === 'bo') {
          assembly.reset()
          assembly.engage(true)
        } else if (kind === 'mario' && mode !== 'preview') {
          assembly.reset()
        } else if (mode === 'preview' || assembly.state === 'locked' || assembly.state === 'assembling') {
          assembly.reset()
          assembly.engage(mode === 'preview' || reduced.matches)
        } else if (assembly.state === 'releasing') {
          assembly.reset()
        }
        setMask(assembly.state)
        nod.reset()
        report(false, 'calibrating')
      },
      replay: () => {
        if (mode !== 'preview') return
        assembly.reset()
        scene.clearEffects()
        demoGoldUntil = (reduced.matches ? 0 : assemblyMs) + 1750
        assembly.engage(reduced.matches)
        scene.unlockAudio()
        if (selected === 'mario') scene.demoMario(performance.now() + (reduced.matches ? 0 : assemblyMs), reduced.matches)
        if (selected === 'conan') { assembly.reset(); assembly.engage(true); scene.demoConan(performance.now()) }
        if (selected === 'shinchan') { assembly.reset(); assembly.engage(true); scene.demoShinchan() }
        if (selected === 'coraline') { assembly.reset(); assembly.engage(true); scene.demoCoraline(performance.now()) }
        if (selected === 'bo') { assembly.reset(); assembly.engage(true); scene.demoBo() }
        setMask(assembly.state)
      },
      reset: () => {
        assembly.reset()
        resetHands()
        demoGoldUntil = 0
        scene.clearEffects()
        if (selected === 'conan' || selected === 'shinchan' || selected === 'coraline' || selected === 'bo') assembly.engage(true)
        setMask(assembly.state)
        nod.reset()
        if (current.tracked) report(true, 'calibrating')
      },
      toggleMask: () => {
        scene.unlockAudio()
        if (assembly.state === 'locked') {
          resetHands()
          assembly.release(reduced.matches || (mode !== 'preview' && !scene.visible(performance.now())))
        } else if (assembly.state === 'off' && (mode === 'preview' || scene.visible(performance.now()))) assembly.engage(reduced.matches)
        demoGoldUntil = 0
        setMask(assembly.state)
      },
      toggleSound: () => setSound(scene.toggleSound()),
      conanReveal:()=>{if(selected==='conan'&&mode==='live'){scene.unlockAudio();scene.triggerConan(performance.now())}},
      selectCrayon: tool => { if (selected === 'shinchan') scene.selectCrayon(tool) },
      clearDrawing: () => { if (selected === 'shinchan') scene.clearShinchanDrawing() },
    }
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pagehide', pagehide)
    if (!document.hidden) frameRequest = requestAnimationFrame(render)
    return () => {
      disposed = true
      cancelAnimationFrame(frameRequest)
      document.removeEventListener('visibilitychange', visibility)
      video.removeEventListener('resize', readCameraAspect)
      window.removeEventListener('pagehide', pagehide)
      detach()
      scene.close()
      controls.current = null
    }
  }, [])

  return { canvas, controls, camera, cameraAspect, mask, kind, status, handStatus, error, mario, sound, conan, shinchan, coraline, bo }
}
