import { canonical, triangles } from './canonical.ts'
import { centerOf, clamp, cross, length, sub, unit } from './geometry.ts'
import type { Point, Vec3 } from './geometry.ts'
import type { TrackingFrame } from './tracking.ts'

export type MaskKind = 'iron-man' | 'no-face' | 'bo' | 'mario' | 'conan' | 'shinchan' | 'coraline'
export type Material = 'rim' | 'gold' | 'gold-bevel' | 'red' | 'red-bevel' | 'seal' | 'light' | 'etched'
  | 'hood' | 'porcelain' | 'violet' | 'ink' | 'mouth'
interface Binding {
  anchors: readonly [number, number, number]
  weights: [number, number, number]
  dx: number
  dy: number
  lift: number
}
interface Surface { material: Material; vertices: Binding[] }
export interface Part {
  id: string
  arrival: Point
  delay: number
  flight: number
  priority: number
  surfaces: Surface[]
}

function bind([x, y]: Point, lift: number): Binding {
  let best: Binding | undefined
  let score = Infinity
  for (const anchors of triangles) {
    const a = canonical[anchors[0]]!, b = canonical[anchors[1]]!, c = canonical[anchors[2]]!
    const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - a[0], vy = c[1] - a[1]
    const det = ux * vy - uy * vx
    if (Math.abs(det) < 1e-8) continue
    const u = ((x - a[0]) * vy - (y - a[1]) * vx) / det
    const v = (ux * (y - a[1]) - uy * (x - a[0])) / det
    const inside = u >= -1e-7 && v >= -1e-7 && u + v <= 1 + 1e-7
    // In projected overlap use the frontmost surface. Points outside the face
    // attach to the nearest mesh edge plus an offset in the head's own axes.
    const candidates: [number, number, number][] = inside ? [[1 - u - v, u, v]] : []
    if (!inside) for (const [i, j] of [[0, 1], [1, 2], [2, 0]] as const) {
      const p = canonical[anchors[i]]!, q = canonical[anchors[j]]!
      const dx = q[0] - p[0], dy = q[1] - p[1]
      const t = clamp(((x - p[0]) * dx + (y - p[1]) * dy) / (dx * dx + dy * dy || 1))
      const weights: [number, number, number] = [0, 0, 0]
      weights[i] = 1 - t; weights[j] = t
      candidates.push(weights)
    }
    for (const weights of candidates) {
      const sx = weights[0] * a[0] + weights[1] * b[0] + weights[2] * c[0]
      const sy = weights[0] * a[1] + weights[1] * b[1] + weights[2] * c[1]
      const sz = weights[0] * a[2] + weights[1] * b[2] + weights[2] * c[2]
      const error = Math.hypot(x - sx, (y - sy) * 1.9) * 100 + sz * .001
      if (error < score) { score = error; best = { anchors, weights, dx: x - sx, dy: y - sy, lift } }
    }
  }
  return best!
}

type Sketch = [Material, Point[], number?]
function surface([material, polygon, lift = .045]: Sketch): Surface {
  const segments = polygon.flatMap((a, i) => {
    const b = polygon[(i + 1) % polygon.length]!
    const steps = Math.ceil(Math.hypot(b[0] - a[0], (b[1] - a[1]) * 1.8) / .14)
    return Array.from({ length: steps }, (_, j): Point => [a[0] + (b[0] - a[0]) * j / steps, a[1] + (b[1] - a[1]) * j / steps])
  })
  return { material, vertices: segments.map(point => bind(point, lift)) }
}

function plate(outline: Point[], tone: Material, details: Sketch[]): Sketch[] {
  const x = outline.reduce((sum, point) => sum + point[0], 0) / outline.length
  const y = outline.reduce((sum, point) => sum + point[1], 0) / outline.length
  const inset = (ratio: number): Point[] => outline.map(([px, py]) => [x + (px - x) * ratio, y + (py - y) * ratio])
  const edge = tone === 'red' ? 'red-bevel' : 'gold-bevel'
  return [['rim', outline, .025], [edge, inset(.985), .032], [tone, inset(.955), .05], ...details]
}

// Broad gold brow, recessed eye slits and red shell panels across the temples and jaw.
const crown = plate([
  [-.98,.267],[-1.00,.118],[-.96,-.022],[-.84,-.113],[-.65,-.182],[-.39,-.232],
  [-.16,-.254],[.16,-.254],[.39,-.232],[.65,-.182],[.84,-.113],[.96,-.022],
  [1.00,.118],[.98,.267],[.79,.338],[.60,.371],[.32,.381],[.14,.369],[-.14,.369],
  [-.32,.381],[-.60,.371],[-.79,.338],
], 'red', [
  ['gold-bevel',[[-.905,.275],[-.906,.11],[-.865,-.04],[-.708,-.113],[-.53,-.149],[-.337,-.166],[-.246,.153],[.246,.153],[.337,-.166],[.53,-.149],[.708,-.113],[.865,-.04],[.906,.11],[.905,.275],[.785,.337],[.542,.361],[.28,.37],[0,.355],[-.28,.37],[-.542,.361],[-.785,.337]],.061],
  ['gold',[[-.878,.251],[-.876,.10],[-.835,-.03],[-.684,-.10],[-.525,-.136],[-.35,-.154],[-.255,.161],[.255,.161],[.35,-.154],[.525,-.136],[.684,-.10],[.835,-.03],[.876,.10],[.878,.251],[.757,.32],[.525,.345],[.267,.355],[0,.341],[-.267,.355],[-.525,.345],[-.757,.32]],.073],
  ['red-bevel',[[-.365,-.174],[-.187,-.204],[.187,-.204],[.365,-.174],[.309,-.017],[.249,.155],[.193,.168],[-.193,.168],[-.249,.155],[-.309,-.017]],.077],
  ['red',[[-.342,-.172],[-.182,-.191],[.182,-.191],[.342,-.172],[.291,-.023],[.23,.141],[.18,.15],[-.18,.15],[-.23,.141],[-.291,-.023]],.085],
  ['etched',[[-.298,-.062],[-.167,-.080],[0,-.086],[.167,-.080],[.298,-.062],[.28,-.047],[.131,-.061],[0,-.066],[-.131,-.061],[-.28,-.047]],.094],
])

const cheek = plate([
  [-.87,-.114],[-.943,-.054],[-1.018,.029],[-1.056,.151],[-1.052,.273],[-1.118,.337],
  [-1.119,.586],[-1.062,.655],[-.997,.841],[-.874,.981],[-.667,1.069],[-.477,1.075],
  [-.354,.937],[-.498,.738],[-.56,.526],[-.752,.407],[-.847,.288],[-.88,.12],
], 'red', [
  ['red-bevel',[[-1.073,.34],[-1.02,.313],[-1.002,.382],[-1.008,.591],[-1.055,.625],[-1.095,.576],[-1.091,.379]],.065],
  ['red',[[-1.066,.381],[-1.034,.356],[-1.022,.406],[-1.029,.578],[-1.059,.594],[-1.077,.562]],.075],
  ['etched',[[-1.036,.17],[-1.016,.24],[-1.008,.303],[-.996,.308],[-.997,.215]],.066],
  ['red-bevel',[[-.964,.649],[-.917,.762],[-.864,.874],[-.767,.951],[-.736,.954],[-.824,.861],[-.902,.727]],.067],
  ['etched',[[-.901,.768],[-.891,.755],[-.879,.769],[-.89,.783]],.077],
])

const chin = plate([
  [-.875,.899],[-.684,.861],[-.467,.851],[-.282,.888],[.282,.888],[.467,.851],
  [.684,.861],[.875,.899],[.779,1.004],[.606,1.108],[.405,1.146],[-.405,1.146],
  [-.606,1.108],[-.779,1.004],
], 'red', [
  ['gold-bevel',[[-.721,.894],[-.535,.836],[-.39,.855],[.39,.855],[.535,.836],[.721,.894],[.658,.979],[.502,1.046],[.254,1.002],[.19,.98],[-.19,.98],[-.254,1.002],[-.502,1.046],[-.658,.979]],.067],
  ['gold',[[-.686,.894],[-.529,.856],[-.38,.872],[.38,.872],[.529,.856],[.686,.894],[.62,.971],[.497,1.023],[.262,.984],[.209,.962],[-.209,.962],[-.262,.984],[-.497,1.023],[-.62,.971]],.078],
  ['etched',[[-.464,1.123],[-.316,1.068],[-.212,1.044],[.212,1.044],[.316,1.068],[.464,1.123],[.395,1.133],[-.395,1.133]],.082],
])

const faceplate = plate([
  [-.911,.278],[-.812,.285],[-.643,.342],[-.284,.354],[-.121,.328],[.121,.328],[.284,.354],
  [.643,.342],[.812,.285],[.911,.278],[.938,.418],[.896,.493],[.776,.57],[.672,.653],
  [.586,.769],[.539,.852],[.427,.927],[.308,.858],[-.308,.858],[-.427,.927],[-.539,.852],
  [-.586,.769],[-.672,.653],[-.776,.57],[-.896,.493],[-.938,.418],
], 'gold', [
  ['gold-bevel',[[-.89,.428],[-.831,.493],[-.709,.588],[-.632,.68],[-.556,.801],[-.498,.87],[-.552,.844],[-.647,.735],[-.729,.641],[-.836,.555]],.072],
  ['gold-bevel',[[.89,.428],[.831,.493],[.709,.588],[.632,.68],[.556,.801],[.498,.87],[.552,.844],[.647,.735],[.729,.641],[.836,.555]],.072],
  ['seal',[[-.509,.862],[-.416,.878],[-.336,.824],[-.262,.811],[.262,.811],[.336,.824],[.416,.878],[.509,.862],[.427,.928],[.319,.869],[-.319,.869],[-.427,.928]],.084],
  ['etched',[[-.337,.852],[-.27,.835],[.27,.835],[.337,.852],[.308,.863],[-.308,.863]],.093],
])

const eye = [
  ['gold-bevel',[[-.87,.286],[-.779,.303],[-.664,.325],[-.501,.336],[-.368,.332],[-.194,.321],[-.177,.349],[-.226,.409],[-.367,.418],[-.556,.415],[-.754,.397],[-.864,.359],[-.897,.325]],.100],
  ['seal',[[-.858,.293],[-.768,.315],[-.663,.334],[-.501,.343],[-.351,.338],[-.199,.330],[-.189,.349],[-.234,.400],[-.367,.409],[-.553,.406],[-.747,.39],[-.855,.352],[-.879,.326]],.111],
  ['etched',[[-.833,.306],[-.746,.326],[-.637,.346],[-.493,.351],[-.343,.347],[-.216,.338],[-.237,.384],[-.369,.396],[-.541,.393],[-.705,.379],[-.811,.348]],.117],
  ['light',[[-.814,.317],[-.74,.335],[-.619,.351],[-.486,.357],[-.35,.354],[-.222,.344],[-.252,.379],[-.376,.389],[-.531,.389],[-.692,.375],[-.785,.352]],.125],
] satisfies Sketch[]

function part(id: string, arrival: Point, delay: number, flight: number, priority: number, sketches: Sketch[], mirror = false): Part {
  return { id, arrival, delay, flight, priority, surfaces: sketches.map(([material, points, lift]) =>
    surface([material, mirror ? points.map(([x, y]) => [-x, y]) : points, lift])) }
}

export const parts = [
  part('crown', [0, -1], 0, 430, 1, crown),
  part('cheek-a', [-1, -.17], 125, 500, 2, cheek),
  part('cheek-b', [1, -.17], 230, 475, 2, cheek, true),
  part('chin', [0, 1], 390, 480, 3, chin),
  part('faceplate', [0, -1], 530, 460, 4, faceplate),
  part('optic-a', [-1, .22], 665, 445, 5, eye),
  part('optic-b', [1, .22], 770, 430, 5, eye, true),
]

function ellipse(x: number, y: number, rx: number, ry: number, angle = 0): Point[] {
  return Array.from({ length: 24 }, (_, i) => {
    const t = i * Math.PI / 12
    const u = Math.cos(t) * rx, v = Math.sin(t) * ry
    return [x + u * Math.cos(angle) - v * Math.sin(angle), y + u * Math.sin(angle) + v * Math.cos(angle)]
  })
}

function smoothContour(points: Point[]): Point[] {
  const n = points.length
  return points.flatMap((a, i) => {
    const previous = points[(i + n - 1) % n]!, b = points[(i + 1) % n]!, next = points[(i + 2) % n]!
    return Array.from({ length: 5 }, (_, j): Point => {
      const t = j / 5
      const curve = (axis: 0 | 1) => .5 * (2 * a[axis] + (-previous[axis] + b[axis]) * t
        + (2 * previous[axis] - 5 * a[axis] + 4 * b[axis] - next[axis]) * t * t
        + (-previous[axis] + 3 * a[axis] - 3 * b[axis] + next[axis]) * t * t * t)
      return [curve(0), curve(1)]
    })
  })
}

const spiritParts = [
  part('hood', [0, 1], 0, 610, 1, [
    ['hood', smoothContour([
      [0,-.28],[.72,-.18],[1.02,.06],[1.15,.44],[1.39,1.02],
      [1.8,1.95],[1.99,2.61],[-1.99,2.61],[-1.8,1.95],[-1.39,1.02],
      [-1.15,.44],[-1.02,.06],[-.72,-.18],
    ]), .02],
  ]),
  part('porcelain', [0, -1], 255, 620, 2, [
    ['porcelain', smoothContour([
      [0,-.125],[.49,-.055],[.79,.095],[.91,.31],[.87,.54],[.69,.78],
      [.4,1.01],[0,1.075],[-.4,1.01],[-.69,.78],[-.87,.54],[-.91,.31],[-.79,.095],[-.49,-.055],
    ]), .07],
    ...([-1, 1] as const).flatMap((side): Sketch[] => [
      ['violet', smoothContour([[.48,.115],[.57,.17],[.59,.255],[.44,.254],[.43,.204]]
        .map(([x, y]): Point => [x! * side, y!])), .09],
      ['ink', ellipse(.51 * side, .34, .174, .049, -.05 * side), .09],
      ['ink', ellipse(.51 * side, .433, .135, .018, -.04 * side), .09],
      ['violet', smoothContour([[.42,.49],[.58,.486],[.61,.565],[.55,.67],[.48,.746],[.443,.675],[.394,.554]]
        .map(([x, y]): Point => [x! * side, y!])), .09],
    ]),
    ['mouth', ellipse(0, .787, .254, .039), .1],
    ['violet', ellipse(0, .861, .122, .014), .09],
  ]),
]

export interface ResolvedSurface { material: Material; vertices: Vec3[] }
export interface ResolvedPart {
  part: Part
  surfaces: ResolvedSurface[]
  center: Vec3
  forward: Vec3
}

// Positions are in the original, unmirrored camera image space. Larger z
// means farther from the camera. A view applies its own projection/mirror.
export function resolveRig(frame: TrackingFrame, kind: MaskKind = 'iron-man'): ResolvedPart[] {
  if (kind === 'mario' || kind === 'conan' || kind === 'shinchan' || kind === 'coraline' || kind === 'bo') return []
  if (frame.face.length < canonical.length) return []
  const source = frame.face.map(p => ({ x: p.x * frame.width, y: p.y * frame.height, z: p.z * frame.width }))
  const horizontal = sub(source[356]!, source[127]!)
  const vertical = sub(source[152]!, source[10]!)
  const size = length(horizontal) / 2
  if (!Number.isFinite(size) || size < 5) return []
  const normal = unit(cross(vertical, horizontal))
  const selected = kind === 'no-face' ? spiritParts : parts
  return selected.map(part => {
    const surfaces = part.surfaces.map(surface => ({
      material: surface.material,
      vertices: surface.vertices.map(binding => {
        const [i, j, k] = binding.anchors
        const a = source[i]!, b = source[j]!, c = source[k]!
        const [u, v, w] = binding.weights
        const x = binding.dx / 2, y = binding.dy, z = binding.lift * size
        return {
          x: a.x * u + b.x * v + c.x * w + horizontal.x * x + vertical.x * y + normal.x * z,
          y: a.y * u + b.y * v + c.y * w + horizontal.y * x + vertical.y * y + normal.y * z,
          z: a.z * u + b.z * v + c.z * w + horizontal.z * x + vertical.z * y + normal.z * z,
        }
      }),
    }))
    return { part, surfaces, forward: normal, center: centerOf(surfaces[0]?.vertices ?? []) }
  })
}

export const sampleFrame: TrackingFrame = {
  timestamp: 0, width: 720, height: 720,
  face: canonical.map(([x, y, z]) => ({ x: .5 + x * .247, y: .175 + y * .64, z: z * .247 })),
}
