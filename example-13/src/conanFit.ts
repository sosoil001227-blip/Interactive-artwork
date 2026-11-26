import type { Vec3 } from './geometry.ts'
import { clamp, mix } from './geometry.ts'
import type { BodyLandmark, TrackingFrame } from './tracking.ts'

export type Projection = (point: Vec3) => Vec3
export const faceOval = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]
const add = (a:Vec3,b:Vec3,k=1):Vec3 => ({x:a.x+b.x*k,y:a.y+b.y*k,z:a.z+b.z*k})
const sub = (a:Vec3,b:Vec3):Vec3 => ({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z})
const dot = (a:Vec3,b:Vec3) => a.x*b.x+a.y*b.y+a.z*b.z
const unit = (a:Vec3):Vec3 => {const n=Math.hypot(a.x,a.y,a.z)||1;return {x:a.x/n,y:a.y/n,z:a.z/n}}
export const lerpPoint = (a:Vec3,b:Vec3,t:number):Vec3 => ({x:mix(a.x,b.x,t),y:mix(a.y,b.y,t),z:mix(a.z,b.z,t)})
const valid = (p:Vec3|undefined):p is Vec3 => !!p && [p.x,p.y,p.z].every(Number.isFinite)
const metric = (p:Vec3,frame:TrackingFrame):Vec3 => ({x:p.x*frame.width,y:p.y*frame.height,z:p.z*frame.width})

export interface GlassLens { points:Vec3[]; center:Vec3; inner:Vec3; outer:Vec3; temple:Vec3 }
export interface GlassFit { lenses:GlassLens[]; outline:Vec3[]; width:number; center:Vec3; nose:Vec3 }
export function fitGlasses(frame:TrackingFrame,project:Projection):GlassFit|undefined {
  const f=frame.face
  if (![10,152,168,33,133,263,362,127,356,...faceOval].every(i=>valid(f[i]))) return
  const vertical=unit(sub(metric(f[152]!,frame),metric(f[10]!,frame)))
  const faceHeight=Math.hypot((f[152]!.x-f[10]!.x)*frame.width,(f[152]!.y-f[10]!.y)*frame.height)
  const lenses:GlassLens[]=[]
  for (const [outer,inner,temple] of [[33,133,127],[263,362,356]]) {
    const a=metric(f[outer!]!,frame),b=metric(f[inner!]!,frame),center=lerpPoint(a,b,.5)
    const horizontal=unit(sub(a,b))
    const down=unit(sub(vertical,{x:horizontal.x*dot(vertical,horizontal),y:horizontal.y*dot(vertical,horizontal),z:horizontal.z*dot(vertical,horizontal)}))
    const radiusX=Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)*.91
    const radiusY=Math.min(faceHeight*.16,radiusX*.95)
    const at=(theta:number)=>project(add(add(center,horizontal,Math.cos(theta)*radiusX),down,Math.sin(theta)*radiusY))
    lenses.push({points:Array.from({length:40},(_,i)=>at(i/40*Math.PI*2)),center:project(center),inner:at(Math.PI),outer:at(0),temple:project(metric(f[temple!]!,frame))})
  }
  const edgeA=project(metric(f[234]!,frame)),edgeB=project(metric(f[454]!,frame))
  const width=Math.hypot(edgeA.x-edgeB.x,edgeA.y-edgeB.y)
  if (width<12 || lenses.some(l=>l.points.some(p=>!valid(p)))) return
  return {lenses,outline:faceOval.map(i=>project(metric(f[i]!,frame))),width,
    center:lerpPoint(lenses[0]!.center,lenses[1]!.center,.5),nose:project(metric(f[168]!,frame))}
}

export interface ArmFit {
  shoulder: Vec3; elbow: Vec3; wrist: Vec3; visible: boolean; front: boolean
  outline: Vec3[]
  cuff: Vec3[]
}
export interface BodyFit {
  left:Vec3;right:Vec3;leftHip:Vec3;rightHip:Vec3;neck:Vec3;width:number;height:number
  arms:ArmFit[]
  outline: Vec3[]
  neckWidth: number
  at(x:number,y:number):Vec3
  collarAt(x: number, y: number): Vec3
}
function confident(p:BodyLandmark|undefined,threshold=.35):p is BodyLandmark {
  return valid(p) && (p.visibility??1)>=threshold && (p.presence??1)>=threshold
}

export function personMask(frame: TrackingFrame) {
  const mask = frame.personMask
  if (!mask || mask.width < 1 || mask.height < 1 || mask.alpha.length !== mask.width * mask.height) return
  return mask
}

export function personAlpha(frame: TrackingFrame, x: number, y: number) {
  const mask = personMask(frame)
  if (!mask) return 0
  const col = Math.floor(x * mask.width / frame.width), row = Math.floor(y * mask.height / frame.height)
  return col >= 0 && row >= 0 && col < mask.width && row < mask.height ? mask.alpha[row * mask.width + col]! : 0
}

export function projectedFaceOutline(frame: TrackingFrame, project: Projection) {
  return faceOval.every(i => valid(frame.face[i]))
    ? faceOval.map(i => project(metric(frame.face[i]!, frame))) : undefined
}

type MaskSample = (p: Vec3) => boolean
function silhouetteSide(sample: MaskSample, at: (distance: number) => Vec3, limit: number, step: number) {
  if (!sample(at(0))) return
  let edge = 0
  for (let distance = step; distance <= limit; distance += step) {
    if (sample(at(distance))) edge = distance
    else if (distance - edge >= step * 2.5) return edge + step * 1.25
  }
  return Math.min(limit, edge + step * 1.25)
}

export function fitBody(frame: TrackingFrame, project: Projection): BodyFit | undefined {
  const p = frame.body
  if (!p) return
  const mask = personMask(frame)
  const sample = mask ? (point: Vec3) => personAlpha(frame, point.x, point.y) >= 105 : undefined
  const leftJoint = p[11], rightJoint = p[12]
  if (!valid(leftJoint) || !valid(rightJoint)) return
  const left = metric(leftJoint, frame), right = metric(rightJoint, frame)
  const middle = lerpPoint(left, right, .5), width = Math.hypot(right.x - left.x, right.y - left.y)
  if (width < 24) return
  const across = { x: (right.x - left.x) / width, y: (right.y - left.y) / width, z: 0 }
  const normal = across.x < 0 ? { x: across.y, y: -across.x, z: 0 } : { x: -across.y, y: across.x, z: 0 }
  const threshold = sample ? .22 : .35
  if (!confident(leftJoint, threshold) || !confident(rightJoint, threshold)) {
    const leftIsWeak = !confident(leftJoint, threshold)
    const weak = leftIsWeak ? leftJoint : rightJoint, strong = leftIsWeak ? rightJoint : leftJoint
    const nearWeak = add(lerpPoint(leftIsWeak ? left : right, middle, .20), normal, width * .09)
    if (!sample?.(nearWeak) || !confident(weak, .10) || !confident(strong, .32)) return
  }
  const step = mask ? Math.max(.75, Math.min(frame.width / mask.width, frame.height / mask.height) * .8) : 1
  const fallbackHeight = clamp((frame.height - middle.y) / Math.max(.5, normal.y), width * .82, width * 2.4)
  const fallbackHip = (side: Vec3) => add(lerpPoint(middle, side, .88), normal, fallbackHeight)
  let leftHip = confident(p[23], .22) ? metric(p[23]!, frame) : fallbackHip(left)
  let rightHip = confident(p[24], .22) ? metric(p[24]!, frame) : fallbackHip(right)
  const hipOffset = () => sub(lerpPoint(leftHip, rightHip, .5), middle)
  if (dot(hipOffset(), normal) < width * .27 || Math.hypot(hipOffset().x, hipOffset().y) > width * 3.4) {
    leftHip = fallbackHip(left); rightHip = fallbackHip(right)
  }
  const offset = hipOffset(), height = Math.hypot(offset.x, offset.y)
  const sourceAt = (x: number, y: number) => {
    const top = lerpPoint(left, right, (x + 1) / 2), bottom = lerpPoint(leftHip, rightHip, (x + 1) / 2)
    return lerpPoint(top, bottom, y)
  }
  const posePair = (a: number, b: number) => confident(p[a], .3) && confident(p[b], .3)
    ? lerpPoint(metric(p[a]!, frame), metric(p[b]!, frame), .5) : undefined
  const mouth = posePair(9, 10), ears = posePair(7, 8)
  const chin = valid(frame.face[152]) ? metric(frame.face[152]!, frame) : undefined
  const faceWidth = valid(frame.face[234]) && valid(frame.face[454])
    ? Math.hypot((frame.face[234]!.x - frame.face[454]!.x) * frame.width, (frame.face[234]!.y - frame.face[454]!.y) * frame.height) : width * .50
  const head = [chin, mouth && add(mouth, normal, faceWidth * .23), ears && add(ears, normal, faceWidth * .39)].find(point => {
    if (!point) return false
    const relative = sub(point, middle), height = -dot(relative, normal)
    return height > width * .06 && height < width * 1.12 && Math.abs(dot(relative, across)) < width * .59
  })
  const headOffset = head ? sub(head, middle) : undefined
  const rise = headOffset ? clamp(-dot(headOffset, normal) - width * .035, width * .095, width * .78) : width * .22
  const lean = headOffset ? clamp(dot(headOffset, across) * .92, -width * .48, width * .48) : 0
  const sectionAbove = (fraction: number) => add(add(middle, normal, -rise * fraction), across, lean * fraction)
  const fittingEdge = (center: Vec3, axis: Vec3, side: number, limit: number, fallback: number) =>
    sample ? silhouetteSide(sample, d => add(center, axis, d * side), width * limit, step) ?? width * fallback : width * fallback
  const collarCenter = sectionAbove(.82)
  const collarSides = [-1, 1].map(side => fittingEdge(collarCenter, across, side, .38, .20))
  const neck = add(collarCenter, across, (collarSides[1]! - collarSides[0]!) / 2)
  const neckWidth = Math.max(width * .22, collarSides[0]! + collarSides[1]!)

  const hem = sample ? clamp((frame.height + width * .06 - middle.y) / Math.max(1, offset.y), .30, 1.09) : 1.09
  const above = [[1,.39,.20],[.86,.46,.22],[.70,.55,.25],[.54,.67,.32],
    [.40,.78,.42],[.28,.89,.53],[.16,1,.61],[.07,1.07,.67],[0,1.13,.71]] as const
  const below = [[.09,1.17,.74],[.19,1.14,.72],[.31,1.10,.69],[.43,1.06,.67],
    [.56,1.02,.66],[.70,1,.66],[.85,.99,.67],[1,.98,.68]] as const
  const sideOutline = (side: number) => [
    ...above.map(([fraction, limit, fallback]) => {
      const center = sectionAbove(fraction)
      return add(center, across, fittingEdge(center, across, side, limit, fallback) * side)
    }),
    ...below.map(([fraction, limit, fallback]) => {
      const row = fraction * hem, center = sourceAt(0, row)
      const left = sourceAt(-1, row), right = sourceAt(1, row)
      const axis = unit({ x: right.x - left.x, y: right.y - left.y, z: 0 })
      return add(center, axis, fittingEdge(center, axis, side, limit, fallback) * side)
    }),
  ]
  const outline = [...sideOutline(-1), ...sideOutline(1).reverse()]
  const torsoZ = (leftJoint.z + rightJoint.z) / 2
  const arms = [[11,13,15], [12,14,16]].map(([s,e,w]): ArmFit => {
    const shoulder = metric(p[s!]!, frame), elbowJoint = p[e!], wristJoint = p[w!]
    if (!confident(elbowJoint, .27)) return { shoulder, elbow: shoulder, wrist: shoulder, visible: false, front: false, outline: [], cuff: [] }
    const elbow = metric(elbowJoint, frame)
    const wrist = confident(wristJoint, .23) ? metric(wristJoint, frame) : elbow
    const forearmVisible = Math.hypot(wrist.x - elbow.x, wrist.y - elbow.y) > width * .07
    const stations = [
      { p: shoulder, limit: .36, fallback: .19 },
      { p: lerpPoint(shoulder, elbow, .33), limit: .34, fallback: .19 },
      { p: lerpPoint(shoulder, elbow, .68), limit: .30, fallback: .17 },
      { p: elbow, limit: .27, fallback: .15 },
    ]
    if (forearmVisible) {
      stations.push({ p: lerpPoint(elbow, wrist, .34), limit: .27, fallback: .15 },
        { p: lerpPoint(elbow, wrist, .64), limit: .23, fallback: .13 },
        { p: lerpPoint(elbow, wrist, .88), limit: .20, fallback: .105 },
        { p: lerpPoint(elbow, wrist, .98), limit: .17, fallback: .095 })
    }
    const edges = [-1, 1].map(sign => stations.map(({ p, limit, fallback }, i) => {
      const a = stations[Math.max(0, i - 1)]!.p, b = stations[Math.min(stations.length - 1, i + 1)]!.p
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy)
      const axis = length > 1 ? { x: -dy / length, y: dx / length, z: 0 } : across
      return add(p, axis, fittingEdge(p, axis, sign, limit, fallback) * sign)
    }))
    return { shoulder, elbow, wrist, visible: Math.hypot(elbow.x - shoulder.x, elbow.y - shoulder.y) > width * .07,
      front: (elbow.z + (forearmVisible ? wrist.z : elbow.z)) / 2 < torsoZ + .04,
      outline: [...edges[0]!, ...edges[1]!.slice().reverse()], cuff: forearmVisible
        ? [edges[0]!.at(-1)!, edges[1]!.at(-1)!] : [] }
  })
  return projectBodyFit({
    left, right, leftHip, rightHip, neck, width, height, neckWidth, outline, arms, at: sourceAt,
    collarAt: (x, y) => add(add(neck, across, x * neckWidth), normal, y * neckWidth),
  }, project)
}

export function projectBodyFit(body: BodyFit, project: Projection): BodyFit {
  const left = project(body.left), right = project(body.right)
  const width = Math.hypot(right.x - left.x, right.y - left.y)
  const scale = width / body.width
  return {
    left, right, leftHip: project(body.leftHip), rightHip: project(body.rightHip), neck: project(body.neck),
    width, height: body.height * scale, neckWidth: body.neckWidth * scale, outline: body.outline.map(project),
    arms: body.arms.map(arm => ({ ...arm, shoulder: project(arm.shoulder), elbow: project(arm.elbow), wrist: project(arm.wrist),
      outline: arm.outline.map(project), cuff: arm.cuff.map(project) })),
    at: (x, y) => project(body.at(x, y)),
    collarAt: (x, y) => project(body.collarAt(x, y)),
  }
}

export interface ImpactState { glow:number;flash:number;slash:number;label:number }
export function conanImpact(elapsed:number,reduced=false):ImpactState {
  if (elapsed<0 || elapsed>9800) return {glow:0,flash:0,slash:0,label:0}
  return {glow:reduced?.55:elapsed<900?1:Math.max(.32,1-(elapsed-900)/2400),
    flash:reduced?0:clamp(1-elapsed/220)*.22,
    slash:reduced?0:clamp(1-Math.abs(elapsed-180)/480),label:clamp(1-(elapsed-850)/400)}
}
