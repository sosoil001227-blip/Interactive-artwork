import test from 'node:test'
import assert from 'node:assert/strict'
import { gauntletShell } from '../src/gauntletGeometry.ts'
import type { GauntletShell, ShellPoint } from '../src/gauntletGeometry.ts'

// A spread hand with skin extending either side of its landmark centerlines.
const hand: ShellPoint[] = [
  { x: 200, y: 380 },
  { x: 162, y: 338 }, { x: 121, y: 314 }, { x: 87, y: 276 }, { x: 63, y: 242 },
  { x: 156, y: 272 }, { x: 144, y: 209 }, { x: 139, y: 158 }, { x: 138, y: 119 },
  { x: 201, y: 261 }, { x: 204, y: 185 }, { x: 207, y: 129 }, { x: 209, y: 83 },
  { x: 244, y: 275 }, { x: 258, y: 204 }, { x: 269, y: 157 }, { x: 274, y: 121 },
  { x: 277, y: 299 }, { x: 304, y: 254 }, { x: 323, y: 217 }, { x: 337, y: 188 },
]
function inside(p: ShellPoint, polygon: ShellPoint[]) {
  let hit = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) hit = !hit
  }
  return hit
}
function edgeDistance(p: ShellPoint, a: ShellPoint, b: ShellPoint) {
  const dx = b.x - a.x, dy = b.y - a.y
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t)
}
function covered(p: ShellPoint, shell: GauntletShell) {
  if (inside(p, shell.palm) || shell.palm.some((a, i) => edgeDistance(p, a, shell.palm[(i + 1) % shell.palm.length]!) <= shell.palmPadding)) return true
  return shell.fingers.some(finger => {
    if (finger.joints.some((joint, i) => {
      if (joint.capRadius === undefined) return Math.hypot(p.x - joint.center.x, p.y - joint.center.y) <= joint.radius
      const prior = finger.joints[Math.max(0, i - 1)]!.center, angle = Math.atan2(joint.center.y - prior.y, joint.center.x - prior.x)
      const dx = p.x - joint.center.x, dy = p.y - joint.center.y
      return ((dx * Math.cos(angle) + dy * Math.sin(angle)) / joint.capRadius) ** 2
        + ((-dx * Math.sin(angle) + dy * Math.cos(angle)) / joint.radius) ** 2 <= 1
    })) return true
    for (let i = 0; i < 3; i++) {
      const a = finger.joints[i]!, b = finger.joints[i + 1]!
      const dx = b.center.x - a.center.x, dy = b.center.y - a.center.y, span = Math.hypot(dx, dy)
      if (span < .001) continue
      const nx = -dy / span, ny = dx / span
      if (inside(p, [
        { x: a.center.x - nx * a.radius, y: a.center.y - ny * a.radius },
        { x: b.center.x - nx * b.radius, y: b.center.y - ny * b.radius },
        { x: b.center.x + nx * b.radius, y: b.center.y + ny * b.radius },
        { x: a.center.x + nx * a.radius, y: a.center.y + ny * a.radius },
      ])) return true
    }
    return false
  })
}
function skinSamples() {
  const out: ShellPoint[] = []
  for (const root of [1, 5, 9, 13, 17]) {
    for (let j = 0; j < 3; j++) {
      const a = hand[root + j]!, b = hand[root + j + 1]!, span = Math.hypot(b.x - a.x, b.y - a.y)
      // Both sides of each segment, including the joint gaps between decorative plates.
      for (const t of [0, .25, .5, .75, 1]) for (const sign of [-1, 1]) {
        const radius = (root === 17 ? 14 : 17) * sign
        out.push({ x: a.x + (b.x - a.x) * t - (b.y - a.y) / span * radius,
          y: a.y + (b.y - a.y) * t + (b.x - a.x) / span * radius })
      }
    }
    const tip = hand[root + 3]!, before = hand[root + 2]!, span = Math.hypot(tip.x - before.x, tip.y - before.y)
    out.push({ x: tip.x + (tip.x - before.x) / span * 7, y: tip.y + (tip.y - before.y) / span * 7 })
  }
  return out
}

test('opaque sleeves cover both finger sides, every joint gap and the flesh beyond all five tips', () => {
  const shell = gauntletShell(hand)!
  for (const p of skinSamples()) assert.ok(covered(p, shell), `uncovered finger skin at ${p.x}, ${p.y}`)
})

test('the padded palm shell covers the hand border, thumb web and wrist independently of the armor panel seams', () => {
  const shell = gauntletShell(hand)!
  for (const [x, y] of [[124, 316], [150, 283], [203, 258], [279, 301], [270, 341], [235, 376], [170, 375], [200, 411]]) {
    assert.ok(covered({ x: x!, y: y! }, shell), `uncovered palm skin at ${x}, ${y}`)
  }
})

test('separate finger sleeves leave the background between spread fingers visible', () => {
  const shell = gauntletShell(hand)!
  for (const p of [{ x: 172, y: 143 }, { x: 244, y: 114 }, { x: 305, y: 154 }]) assert.equal(covered(p, shell), false)
})

test('a foreshortened or coincident distal joint does not collapse the covering width', () => {
  const short = hand.map(p => ({ ...p }))
  short[11] = { x: 205, y: 181 }; short[12] = { x: 205.1, y: 180.9 }
  let shell = gauntletShell(short)!
  assert.ok(covered({ x: 224, y: 181 }, shell))
  short[12] = { ...short[11]! }
  shell = gauntletShell(short)!
  assert.ok(covered({ x: 224, y: 181 }, shell))
})

test('coverage follows mirrored, rotated, translated and resized camera projections', () => {
  for (const mirror of [-1, 1]) for (const scale of [.65, 1.8]) {
    const angle = .61, transform = (p: ShellPoint): ShellPoint => ({
      x: 620 + (p.x * mirror * Math.cos(angle) - p.y * Math.sin(angle)) * scale,
      y: 240 + (p.x * mirror * Math.sin(angle) + p.y * Math.cos(angle)) * scale,
    })
    const shell = gauntletShell(hand.map(transform))!
    for (const p of skinSamples()) assert.ok(covered(transform(p), shell))
  }
})

test('missing, nonfinite or collapsed hand geometry is rejected', () => {
  assert.equal(gauntletShell([]), undefined)
  assert.equal(gauntletShell(hand.map((p, i) => i === 8 ? { ...p, x: NaN } : p)), undefined)
  assert.equal(gauntletShell(hand.map(() => ({ x: 0, y: 0 }))), undefined)
})

test('fingertips taper and use a short oval cap; a long measured tip does not inflate their lateral width', () => {
  const plain = gauntletShell(hand)!
  const measured = gauntletShell(hand, { palm: [], fingers: [{ root: 5, radii: [.20, .20, .19, .17], tip: .30 }] })!
  for (const finger of plain.fingers) {
    assert.ok(finger.joints[3]!.radius < finger.joints[0]!.radius * .85)
    assert.ok(finger.joints[3]!.capRadius! < finger.joints[3]!.radius * .6)
  }
  const tip = measured.fingers.find(f => f.root === 5)!.joints[3]!
  assert.ok(tip.radius < measured.size * .20, 'axial extension must not turn into a round bulb')
  assert.ok(tip.capRadius! <= tip.radius)
})
