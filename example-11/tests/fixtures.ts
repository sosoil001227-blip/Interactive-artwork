import type { HandLandmarkerResult } from '@mediapipe/tasks-vision'
import type { HandPose } from '../src/tracking.ts'

export function pose(x = 300, y = 220, label = 'Left', now = 1000): HandPose {
  const points = [
    [0, 55], [-28, 36], [-48, 15], [-64, -5], [-78, -22],
    [-30, -10], [-32, -45], [-32, -75], [-32, -100],
    [0, -18], [0, -58], [0, -89], [0, -117],
    [27, -12], [29, -48], [29, -78], [29, -102],
    [49, 0], [56, -29], [60, -53], [63, -74],
  ].map(([px, py]) => ({ x: x + px!, y: y + py!, z: 0 }))
  return { points, center: { x, y: y + 3 }, size: 73, label, seen: now }
}

export function frame(hands: HandPose[]): HandLandmarkerResult {
  return { landmarks: hands.map(hand => hand.points.map(p => ({ x: 1 - p.x / 1000, y: p.y / 700, z: p.z / 1000 }))),
    handedness: hands.map((hand, index) => [{ categoryName: hand.label, displayName: hand.label, index, score: .99 }]), worldLandmarks: [] }
}
