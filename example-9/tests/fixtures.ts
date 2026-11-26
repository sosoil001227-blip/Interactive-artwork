import type { HandLandmarkerResult } from '@mediapipe/tasks-vision'

// Anatomical hand geometry, rotated in 3D before projection into the video.
// A right palm looking at the camera has its thumb on the viewer's right.
const right = [
  [0, .04, 0], [.028, .01, 0], [.05, -.005, 0], [.07, -.015, 0], [.09, -.03, 0],
  [.035, -.035, 0], [.037, -.065, 0], [.038, -.09, 0], [.039, -.115, 0],
  [0, -.045, 0], [0, -.08, 0], [0, -.11, 0], [0, -.14, 0],
  [-.018, -.04, 0], [-.02, -.07, 0], [-.022, -.095, 0], [-.024, -.12, 0],
  [-.035, -.025, 0], [-.042, -.05, 0], [-.045, -.07, 0], [-.048, -.09, 0],
]

export function handFrame(pose: 'inward' | 'front' | 'back', wide = false): HandLandmarkerResult {
  const hands = ['Right', 'Left'].map((label, index) => {
    const angle = pose === 'inward' ? (index ? -1 : 1) * Math.PI / 2 : pose === 'front' ? 0 : Math.PI
    const world = right.map(([x, y, z]) => {
      const xx = x! * (index ? -1 : 1)
      return { x: xx * Math.cos(angle) + z! * Math.sin(angle), y: y!, z: -xx * Math.sin(angle) + z! * Math.cos(angle) }
    })
    const centerX = index ? (wide ? .22 : .39) : (wide ? .78 : .61)
    return { world, image: world.map(p => ({ x: centerX + p.x * .8, y: .5 + p.y * .8 * 1280 / 720, z: p.z * .8 })),
      category: [{ index, categoryName: label, displayName: label, score: .99 }] }
  })
  return { landmarks: hands.map(h => h.image), worldLandmarks: hands.map(h => h.world),
    handedness: hands.map(h => h.category), handednesses: hands.map(h => h.category) }
}
