import { centerOf, cross, sub, unit } from './geometry.ts'
import type { Vec3 } from './geometry.ts'
import type { TrackedHand, TrackingFrame } from './tracking.ts'
import { HandContourSampler } from './handContour.ts'
import type { HandOutline } from './gauntletGeometry.ts'

export const gauntletAssemblyMs = 850
const trackingGraceMs = 440
export type HandGestureStatus = 'show-back' | 'turn' | 'assembling' | 'equipped'

export interface HandPose {
  points: Vec3[]
  center: Vec3
  normal: Vec3
  outline?: HandOutline
}

interface HandTrack {
  label: TrackedHand['label']
  pose: HandPose
  lastSeen: number
  frameTimestamp: number
  side: 'back' | 'palm' | 'edge'
  sideSince: number
  armedUntil: number
  mountedAt?: number
  lastShot?: number
}

function readPose(hand: TrackedHand, label: TrackedHand['label'], width: number, height: number): HandPose {
  const points = hand.landmarks.map(({ x, y, z }) => ({ x: x * width, y: y * height, z: z * width }))
  const metric = hand.worldLandmarks.length === 21 ? hand.worldLandmarks : points
  const across = sub(metric[5]!, metric[17]!)
  const up = sub(metric[9]!, metric[0]!)
  // Handedness fixes the sign of the surface normal in unmirrored camera space.
  const normal = unit(label === 'Right' ? cross(across, up) : cross(up, across))
  return { points, normal, center: centerOf([points[0]!, points[5]!, points[9]!, points[13]!, points[17]!]) }
}

export class HandGesture {
  private tracks: HandTrack[] = []
  private contours = new HandContourSampler()

  clear() { this.tracks = []; this.contours.clear() }

  update(frame: TrackingFrame, now: number, reduced: boolean, image?: ImageBitmap) {
    this.prune(now)
    const hands = (frame.hands ?? []).filter(hand => hand.landmarks.length === 21
      && hand.landmarks.every(p => [p.x, p.y, p.z].every(Number.isFinite)))
    const observations = hands.map(hand => ({
      hand, pose: readPose(hand, hand.label, frame.width, frame.height),
    }))
    const pairs = observations.flatMap((item, index) => this.tracks.map(track => ({
      index, track,
      distance: Math.hypot(item.pose.center.x - track.pose.center.x, item.pose.center.y - track.pose.center.y) / frame.width,
    })))
    pairs.sort((a, b) => (a.distance + (a.track.label === hands[a.index]!.label ? 0 : .075))
      - (b.distance + (b.track.label === hands[b.index]!.label ? 0 : .075)))
    const matched = new Map<number, HandTrack>()
    const used = new Set<HandTrack>()
    for (const { index, track, distance } of pairs) {
      if (distance > .24 || matched.has(index) || used.has(track)) continue
      matched.set(index, track)
      used.add(track)
    }

    for (const [index, { hand, pose }] of observations.entries()) {
      let track = matched.get(index)
      if (!track) {
        track = { label: hand.label, pose, lastSeen: now, frameTimestamp: frame.timestamp, side: 'edge', sideSince: now, armedUntil: -Infinity }
        this.tracks.push(track)
      }
      const previousOutline = track.pose.outline
      track.pose = track.label === hand.label ? pose : readPose(hand, track.label, frame.width, frame.height)
      const side = track.pose.normal.z > .42 ? 'back' : track.pose.normal.z < -.43 ? 'palm' : 'edge'
      if (track.side !== side || now - track.lastSeen > 220) {
        track.side = side
        track.sideSince = now
      }
      track.lastSeen = now
      track.frameTimestamp = frame.timestamp
      if (track.mountedAt === undefined) {
        if (side === 'back' && now - track.sideSince >= 58) track.armedUntil = now + 2000
        if (side === 'palm' && now - track.sideSince >= 48 && now <= track.armedUntil) {
          track.mountedAt = reduced ? now - gauntletAssemblyMs : now
        }
      }
      if (track.mountedAt !== undefined && image) {
        track.pose.outline = this.contours.sample(image, track.pose.points, previousOutline)
      }
    }
  }

  active(now: number, imageTimestamp?: number) {
    this.prune(now)
    return this.tracks.filter(track => now - track.lastSeen < 220
      || imageTimestamp !== undefined && track.frameTimestamp === imageTimestamp)
  }

  status(now: number): HandGestureStatus {
    const tracks = this.active(now)
    if (tracks.some(track => track.mountedAt !== undefined && now - track.mountedAt >= gauntletAssemblyMs)) return 'equipped'
    if (tracks.some(track => track.mountedAt !== undefined)) return 'assembling'
    return tracks.some(track => now <= track.armedUntil) ? 'turn' : 'show-back'
  }

  private prune(now: number) {
    this.tracks = this.tracks.filter(track => now - track.lastSeen < trackingGraceMs)
  }
}
