import { FaceLandmarker, FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision'
import type { HandTrackingState, TrackingFrame, TrackingRequest, TrackingResponse } from './tracking.ts'

const worker = self as unknown as {
  onmessage: (event: MessageEvent<TrackingRequest>) => void
  postMessage: (message: TrackingResponse, transfer?: Transferable[]) => void
}
let face: FaceLandmarker | undefined
let faceFailure: string | undefined
let expressions = false
let vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>
let handModel: string
let hand: HandLandmarker | undefined
let handState: HandTrackingState | undefined
let handPreparation: Promise<void> | undefined
let body: PoseLandmarker | undefined
let bodyModel: string
let bodyState: HandTrackingState | undefined
let bodyPreparation: Promise<void> | undefined

function prepareBody() {
  if (bodyPreparation) return bodyPreparation
  bodyState = 'loading'
  bodyPreparation = PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: bodyModel, delegate: 'CPU' }, runningMode: 'VIDEO', numPoses: 1,
    minPoseDetectionConfidence: .4, minPosePresenceConfidence: .4, minTrackingConfidence: .4,
    outputSegmentationMasks: true,
  }).then(tracker => { body = tracker; bodyState = 'ready' })
    .catch(() => { bodyState = 'unavailable' })
  return bodyPreparation
}

function prepareHands() {
  if (handPreparation) return handPreparation
  handState = 'loading'
  handPreparation = HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: handModel, delegate: 'CPU' },
    runningMode: 'VIDEO', numHands: 2,
    minHandDetectionConfidence: .35,
    minHandPresenceConfidence: .4,
    minTrackingConfidence: .35,
  }).then(landmarker => {
    hand = landmarker
    handState = 'ready'
  }).catch(() => { handState = 'unavailable' })
  return handPreparation
}

worker.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      vision = await FilesetResolver.forVisionTasks(data.wasm)
      handModel = data.handModel
      bodyModel = new URL('models/pose_landmarker_lite.task', data.assets).href
      if (data.handFirst) await prepareHands()
      expressions = !!data.expressions
      const facePreparation = FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: new URL('models/face_landmarker.task', data.assets).href, delegate: 'CPU' },
        runningMode: 'VIDEO', numFaces: 1, outputFacialTransformationMatrixes: true, outputFaceBlendshapes: expressions,
      }).then(landmarker => { face = landmarker })
      if (data.handFirst) {
        // Hand-first modes can start tracking hands while the face model loads.
        void facePreparation.catch(() => { faceFailure = '얼굴 추적을 준비하지 못했어요. 카메라를 다시 연결해 주세요.' })
      } else await facePreparation
      if (data.body) void prepareBody()
      worker.postMessage({ type: 'ready' })
      return
    }

    const { image, timestamp } = data
    if (faceFailure) throw new Error(faceFailure)
    if (face && expressions !== !!data.expressions) {
      await face.setOptions({ outputFaceBlendshapes: !!data.expressions })
      expressions = !!data.expressions
    }
    const result = face?.detectForVideo(image, timestamp)
    const frame: TrackingFrame = {
      timestamp, width: image.width, height: image.height,
      face: result?.faceLandmarks[0] ?? [],
      faceMatrix: result?.facialTransformationMatrixes[0],
    }
    const transfer: Transferable[] = [image]
    if (data.expressions) frame.expressions = Object.fromEntries(
      (result?.faceBlendshapes[0]?.categories ?? []).map(category => [category.categoryName, category.score]))
    if (data.hands !== 'off') {
      if (!handState) {
        void prepareHands()
      }
      if (data.hands === 'track' && hand) {
        try {
          const result = hand.detectForVideo(image, timestamp)
          frame.hands = result.landmarks.flatMap((landmarks, i) => {
            const label = result.handedness[i]?.[0]?.categoryName
            return label === 'Left' || label === 'Right'
              ? [{ label, landmarks, worldLandmarks: result.worldLandmarks[i] ?? [] }]
              : []
          })
        } catch {
          hand.close()
          hand = undefined
          handState = 'unavailable'
        }
      }
      frame.handTracking = handState
    }
    if (data.body) {
      if (!bodyState) void prepareBody()
      if (body) {
        try {
          const result = body.detectForVideo(image, timestamp)
          try {
            frame.body = result.landmarks[0] ?? []
            const mask = result.segmentationMasks?.[0]
            if (mask) {
              const confidence = mask.getAsFloat32Array(), alpha = new Uint8Array(confidence.length)
              for (let i = 0; i < alpha.length; i++) {
                const value = Math.max(0, Math.min(1, (confidence[i]! - .18) / .64))
                alpha[i] = Math.round(value * value * (3 - 2 * value) * 255)
              }
              frame.personMask = { width: mask.width, height: mask.height, alpha }
              transfer.push(alpha.buffer)
            }
          } finally { result.close() }
        } catch { body.close(); body = undefined; bodyState = 'unavailable' }
      }
      frame.bodyTracking = bodyState
    }
    worker.postMessage({ type: 'frame', image, frame }, transfer)
  } catch (error) {
    if (data.type === 'frame') data.image.close()
    worker.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
