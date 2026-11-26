export type Point = { x: number; y: number }
export type Landmark = Point & { z?: number }
export type Face = { center: Point; contour: Point[]; cheeks: [Point, Point]; radius: number; seen: number; landmarks?:Point[] }
// The outer 22% is a transition into the unchanged camera, not a face crop.
export const FACE_SUPPORT=1.22
export const FACE_CORE=1/FACE_SUPPORT
export function smoothstep(a:number,b:number,value:number){const t=Math.max(0,Math.min(1,(value-a)/(b-a)));return t*t*(3-2*t)}
export function edgeWeight(p:Point){return 1-smoothstep(.85,1,Math.hypot(p.x,p.y))}
export function faceInteractionLifetime(interacting:boolean){return interacting?6200:650}
export function faceVisibility(face:Face,interacting:boolean,now:number){return 1-smoothstep(interacting?4000:650,interacting?6000:1500,now-face.seen)}
export const OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]
export const distance = (a: Point, b: Point) => Math.hypot(a.x-b.x,a.y-b.y)
export const mix = (a: number, b: number, t: number) => a+(b-a)*t

export function cameraToScreen(p: Point, vw: number, vh: number, w: number, h: number): Point {
  const scale = Math.max(w/vw,h/vh)
  return { x:(1-p.x)*vw*scale-(vw*scale-w)/2, y:p.y*vh*scale-(vh*scale-h)/2 }
}
export function screenToCamera(p: Point, vw: number, vh: number, w: number, h: number): Point {
  const scale = Math.max(w/vw,h/vh)
  return { x:1-(p.x+(vw*scale-w)/2)/(vw*scale), y:(p.y+(vh*scale-h)/2)/(vh*scale) }
}
export function readFace(points: Landmark[], vw: number, vh: number, w: number, h: number, seen: number): Face | undefined {
  if (points.length<468 || Math.min(vw,vh,w,h)<=0 || points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))) return
  const landmarks=points.map(p=>cameraToScreen(p,vw,vh,w,h))
  const contour = OVAL.map(i=>landmarks[i]!)
  const xs=contour.map(p=>p.x),ys=contour.map(p=>p.y)
  const center={x:(Math.min(...xs)+Math.max(...xs))/2,y:(Math.min(...ys)+Math.max(...ys))/2}
  const radius = (Math.max(...xs)-Math.min(...xs))/2
  if (radius<18) return
  return { center,contour,radius,cheeks:[landmarks[50]!,landmarks[280]!],landmarks,seen }
}

// Periodic Catmull–Rom interpolation removes the corners of the 36-point oval.
export function boundary(face: Face, t: number): Point {
  const n=face.contour.length, wrapped=((t%1)+1)%1*n, i=Math.floor(wrapped), f=wrapped-i
  const p0=face.contour[(i+n-1)%n]!,p1=face.contour[i%n]!,p2=face.contour[(i+1)%n]!,p3=face.contour[(i+2)%n]!
  const cubic=(a:number,b:number,c:number,d:number)=>.5*((2*b)+(-a+c)*f+(2*a-5*b+4*c-d)*f*f+(-a+3*b-3*c+d)*f*f*f)
  return {x:cubic(p0.x,p1.x,p2.x,p3.x),y:cubic(p0.y,p1.y,p2.y,p3.y)}
}
export function materialToScreen(p: Point, face: Face): Point {
  const r=Math.hypot(p.x,p.y)*FACE_SUPPORT, edge=boundary(face,Math.atan2(p.y,p.x)/(Math.PI*2))
  return {x:mix(face.center.x,edge.x,r),y:mix(face.center.y,edge.y,r)}
}

export class FaceTracker{
  private previous:Face|undefined
  reset(){this.previous=undefined}
  update(points:Landmark[],vw:number,vh:number,w:number,h:number,now:number){
    const face=readFace(points,vw,vh,w,h,now)
    if(!face)return
    const old=this.previous
    if(old&&now-old.seen<300&&distance(old.center,face.center)<face.radius*.75){
      const alpha=1-Math.exp(-(now-old.seen)/28)
      const blend=(p:Point,q:Point)=>({x:mix(p.x,q.x,alpha),y:mix(p.y,q.y,alpha)})
      face.center=blend(old.center,face.center);face.radius=mix(old.radius,face.radius,alpha)
      face.contour=face.contour.map((p,i)=>blend(old.contour[i]!,p))
      face.cheeks=[blend(old.cheeks[0],face.cheeks[0]),blend(old.cheeks[1],face.cheeks[1])]
      if(old.landmarks?.length===face.landmarks?.length)face.landmarks=face.landmarks?.map((p,i)=>blend(old.landmarks![i]!,p))
    }
    this.previous=face;return face
  }
}
export function unwrap(angle: number) { return Math.atan2(Math.sin(angle),Math.cos(angle)) }

export function barycentric(p:Point,a:Point,b:Point,c:Point): [number,number,number] | undefined {
  const den=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y)
  if(Math.abs(den)<.0001)return
  const u=((b.y-c.y)*(p.x-c.x)+(c.x-b.x)*(p.y-c.y))/den
  const v=((c.y-a.y)*(p.x-c.x)+(a.x-c.x)*(p.y-c.y))/den, z=1-u-v
  if(Math.min(u,v,z)<-.001)return
  return [u,v,z]
}
