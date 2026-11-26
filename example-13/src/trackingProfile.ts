import type { MaskState } from './animation.ts'
import type { MaskKind } from './rig.ts'
import type { HandTrackingMode } from './tracking.ts'

export function trackingProfile(kind: MaskKind, state: MaskState) {
  const body = kind === 'conan' || kind === 'shinchan' || kind === 'coraline'
  const hands: HandTrackingMode = kind === 'no-face' || kind === 'bo' ? 'off'
    : body || state === 'locked' ? 'track' : 'prepare'
  return { body, hands, expressions: kind === 'bo' }
}
