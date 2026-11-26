import type { HandLandmarkerResult } from '@mediapipe/tasks-vision'
import type { Point } from '../src/gesture.ts'

export function cornerPoints(): Point[] {
  const points = Array.from({ length: 21 }, () => ({ x: 300, y: 430 }))
  const set = (i: number, x: number, y: number) => { points[i] = { x, y } }
  set(0, 300, 490)
  set(1, 315, 445); set(2, 320, 410); set(3, 375, 410); set(4, 430, 410)
  set(5, 300, 410); set(6, 300, 355); set(7, 300, 310); set(8, 300, 270)
  for (const [base, x] of [[9, 335], [13, 365], [17, 395]]) {
    set(base!, x!, 410); set(base! + 1, x!, 375); set(base! + 2, x! + 5, 400); set(base! + 3, x!, 425)
  }
  return points
}

export function handFrame(width = 400, shiftX = 0, shiftY = 0): HandLandmarkerResult {
  const left = cornerPoints().map(p => ({ x: p.x + shiftX, y: p.y + shiftY }))
  const right = cornerPoints().map(p => ({ x: 600 + width - p.x + shiftX, y: 680 - p.y + shiftY }))
  return {
    landmarks: [left, right].map(hand => hand.map(p => ({ x: 1 - p.x / 1000, y: p.y / 700, z: 0 }))),
    handedness: ['Left', 'Right'].map((categoryName, index) => [{ categoryName, index, displayName: categoryName, score: .99 }]),
    worldLandmarks: [],
  }
}
