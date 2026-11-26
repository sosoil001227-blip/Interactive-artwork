export interface ShellPoint { x: number; y: number; z?: number }
export interface ShellJoint { center: ShellPoint; radius: number; capRadius?: number }
export interface FingerShell { root: number; joints: ShellJoint[] }
export interface HandOutline {
  palm: ShellPoint[]
  /** Widths and tip extension are fractions of the tracked palm size. */
  fingers: { root: number; radii: number[]; tip: number }[]
}
export interface GauntletShell {
  size: number
  palm: ShellPoint[]
  palmPadding: number
  fingers: FingerShell[]
}

const fingers = [
  { root: 1, radius: .215 }, { root: 5, radius: .205 }, { root: 9, radius: .21 },
  { root: 13, radius: .20 }, { root: 17, radius: .18 },
] as const
const distance = (a: ShellPoint, b: ShellPoint) => Math.hypot(a.x - b.x, a.y - b.y)
function hull(points: ShellPoint[]) {
  const ordered = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  const side = (list: ShellPoint[]) => {
    const out: ShellPoint[] = []
    for (const p of list) {
      while (out.length > 1) {
        const a = out.at(-2)!, b = out.at(-1)!
        if ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) > 0) break
        out.pop()
      }
      out.push(p)
    }
    return out
  }
  return [...side(ordered).slice(0, -1), ...side(ordered.reverse()).slice(0, -1)]
}

/** Screen-space opaque coverage. A bone's apparent length never limits its skin-covering width. */
export function gauntletShell(points: readonly ShellPoint[], outline?: HandOutline): GauntletShell | undefined {
  if (points.length !== 21 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y)
    || p.z !== undefined && !Number.isFinite(p.z))) return
  const wrist = points[0]!, index = points[5]!, middle = points[9]!, ring = points[13]!, little = points[17]!
  const up = { x: (middle.x + ring.x) / 2 - wrist.x, y: (middle.y + ring.y) / 2 - wrist.y }
  const upLength = Math.hypot(up.x, up.y)
  const projectedSize = Math.max(distance(index, little), upLength * .83)
  const across3D = Math.hypot(index.x - little.x, index.y - little.y, (index.z ?? 0) - (little.z ?? 0))
  const up3D = Math.hypot(up.x, up.y, ((middle.z ?? 0) + (ring.z ?? 0)) / 2 - (wrist.z ?? 0))
  // Turning the hand edge-on compresses its 2D span, while the hand's physical thickness stays visible.
  const size = Math.min(projectedSize * 1.8, Math.max(projectedSize, across3D * .86, up3D * .78))
  if (size < 4 || upLength < 1) return
  const direction = { x: up.x / upLength, y: up.y / upLength }
  const across = { x: -direction.y, y: direction.x }
  const cuff = (side: number, extension: number): ShellPoint => ({
    x: wrist.x + across.x * size * side - direction.x * size * extension,
    y: wrist.y + across.y * size * side - direction.y * size * extension,
  })
  // This hull ends at the knuckles. Fingers have separate sleeves, preserving the open spaces between them.
  const measuredPalm = (outline?.palm ?? []).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)
    && distance(p, wrist) < size * 1.8)
  const palm = hull([...[0, 1, 2, 5, 9, 13, 17].map(i => points[i]!), ...measuredPalm,
    cuff(-.34, .02), cuff(.34, .02), cuff(-.33, .47), cuff(.33, .47)])
  return { size, palm, palmPadding: Math.max(3, size * .16),
    fingers: fingers.map(finger => {
      const measured = outline?.fingers.find(item => item.root === finger.root)
      return { root: finger.root, joints: Array.from({ length: 4 }, (_, j) => {
        const base = Math.max(2.5, size * finger.radius * (1 - .06 * j))
        const observed = measured?.radii[j] ?? 0
        const radius = Number.isFinite(observed) ? Math.max(base, Math.min(size * .34, observed * size)) : base
        const tip = measured?.tip ?? 0
        const capRadius = j === 3 ? Math.max(radius * .46, Math.min(radius * .92,
          Number.isFinite(tip) ? tip * size : 0)) : undefined
        return { center: points[finger.root + j]!, radius, capRadius }
      }) }
    }) }
}
