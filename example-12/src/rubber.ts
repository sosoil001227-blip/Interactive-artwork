import { distance, edgeWeight, FACE_CORE, materialToScreen, mix, unwrap } from './geometry.ts'
import type { Face, Point } from './geometry.ts'
import type { Hand } from './gestures.ts'

export type Grip = { id:number; material:Point; offset:Point; velocity:Point; target:Point; active:boolean; missing:number }
const SPOKES=176,RINGS=80,FACE_RINGS=64
const kernel=(a:Point,b:Point)=>Math.exp(-((a.x-b.x)**2+(a.y-b.y)**2)/.52)

export class Rubber {
  readonly material:Float32Array
  readonly indices:Uint16Array
  readonly positions:Float32Array
  readonly depth:Float32Array
  readonly sides:Float32Array
  readonly normals:Float32Array
  grips:Grip[]=[]
  twist=0
  private twistVelocity=0
  private twistTarget=0
  private pair: {angle:number;roll:number;separation:number;ids:string} | undefined
  private coefficients:Point[]=[]
  private bounds={left:0,right:0,top:0,bottom:0}
  private frontVertices=0
  private frontIndices=0
  private wrists=new Map<number,number>()
  private lastFace:Face|undefined
  constructor(){
    const materials:number[]=[0,0],indices:number[]=[]
    for(let ring=1;ring<=RINGS;ring++)for(let j=0;j<SPOKES;j++){
      const angle=j/SPOKES*Math.PI*2,r=ring<=FACE_RINGS
        ?FACE_CORE*Math.sin(ring/FACE_RINGS*Math.PI*.5)
        :FACE_CORE+(1-FACE_CORE)*(ring-FACE_RINGS)/(RINGS-FACE_RINGS)
      materials.push(Math.cos(angle)*r,Math.sin(angle)*r)
      const here=1+(ring-1)*SPOKES+j,next=1+(ring-1)*SPOKES+(j+1)%SPOKES
      if(ring===1)indices.push(0,here,next)
      else {const inner=here-SPOKES,innerNext=next-SPOKES;indices.push(inner,here,next,inner,next,innerNext)}
    }
    this.frontVertices=materials.length/2;this.frontIndices=indices.length
    // A closed, rounded head: the back surface fills the coil when the face
    // rotates away, instead of exposing a thin, open ribbon.
    const faceVertices=1+FACE_RINGS*SPOKES,faceIndices=SPOKES*(2*FACE_RINGS-1)*3
    const back=indices.slice(0,faceIndices).map(index=>index+this.frontVertices)
    this.material=new Float32Array([...materials,...materials.slice(0,faceVertices*2)]);this.indices=new Uint16Array([...indices,...back])
    this.positions=new Float32Array(this.material.length);this.depth=new Float32Array(this.material.length/2)
    this.sides=new Float32Array(this.depth.length).fill(1);this.sides.fill(-1,this.frontVertices)
    this.normals=new Float32Array(this.depth.length*3)
  }
  reset(){this.grips=[];this.pair=undefined;this.twist=this.twistVelocity=this.twistTarget=0;this.coefficients=[];this.wrists.clear();this.bounds={left:0,right:0,top:0,bottom:0};this.lastFace=undefined}
  get active(){return this.grips.filter(g=>g.active).length}
  get settling(){return this.grips.length>0||this.torsion>.0001}
  get stretch(){return this.grips.reduce((max,g)=>Math.max(max,Math.hypot(g.offset.x,g.offset.y)),0)}
  get recovery(){return this.grips.reduce((max,g)=>Math.max(max,Math.sqrt(g.offset.x*g.offset.x+g.offset.y*g.offset.y+(g.velocity.x*g.velocity.x+g.velocity.y*g.velocity.y)/145)),0)}
  get torsion(){return Math.hypot(this.twist,this.twistVelocity/Math.sqrt(95))}
  private twisted(p:Point,face:Face,side=1):Point & {z:number}{
    const base=materialToScreen(p,face),x=base.x-face.center.x,y=base.y-face.center.y
    const amount=Math.min(1,Math.abs(this.twist)/4),height=y/(face.radius*1.5)
    const angle=this.twist*height*1.35
    const z=side*face.radius*.66*Math.sqrt(Math.max(0,1-(p.x*p.x+p.y*p.y)/(FACE_CORE*FACE_CORE)))
    const envelope=Math.max(0,1-height*height*.45),fold=1+amount*.075*Math.cos(angle*2.2)
    const tx=(x*Math.cos(angle)+z*Math.sin(angle))*fold+face.radius*amount*.17*Math.sin(angle)*envelope
    const tz=(-x*Math.sin(angle)+z*Math.cos(angle))*fold
    const longY=y*(1+amount*.42),roll=this.twist*.07
    const weight=edgeWeight(p)
    return {x:mix(base.x,face.center.x+tx*Math.cos(roll)-longY*Math.sin(roll),weight),y:mix(base.y,face.center.y+tx*Math.sin(roll)+longY*Math.cos(roll),weight),z:tz*weight}
  }
  update(hands:Hand[],face:Face,dt:number){
    if(!this.grips.length&&Math.abs(this.twist)<.0001&&Math.abs(this.twistVelocity)<.001&&!hands.some(h=>h.closed)){
      if(this.lastFace!==face)this.rebuild(face)
      return
    }
    // Seed the picking surface immediately, including the very first face frame.
    if(this.lastFace!==face||this.bounds.right===this.bounds.left)this.rebuild(face)
    for(const grip of this.grips){
      const hand=hands.find(h=>h.id===grip.id)
      if(grip.active){
        if(hand){grip.missing=0;if(!hand.closed)grip.active=false}
        else{grip.missing+=Math.min(.05,Math.max(0,dt));if(grip.missing>.30)grip.active=false}
      }
      if(grip.active&&hand){
        const step=Math.max(.008,Math.min(.05,dt)),dx=(hand.pinch.x-grip.target.x)/step,dy=(hand.pinch.y-grip.target.y)/step
        const speed=Math.max(1,Math.hypot(dx,dy)/1800)
        grip.velocity.x=grip.velocity.x*.65+dx/speed*.35;grip.velocity.y=grip.velocity.y*.65+dy/speed*.35
        grip.target={...hand.pinch}
      }
    }
    // Test contact while the pinch is held, not only on its first frame. Hand
    // and face results arrive independently, and a closed hand can enter later.
    for(const hand of hands.filter(h=>h.closed)){
      if(this.grips.some(g=>g.id===hand.id&&g.active))continue
      const material=this.pick(hand.pinch)
      if(!material)continue
      if(this.grips.some(g=>g.id!==hand.id&&distance(g.material,material)<.035))continue
      // Retain released springs, but each hand may attach to only one new point.
      this.grips=this.grips.filter(g=>g.id!==hand.id)
      const origin=this.twisted(material,face)
      this.grips.push({id:hand.id,material,offset:{x:hand.pinch.x-origin.x,y:hand.pinch.y-origin.y},velocity:{x:0,y:0},target:{...hand.pinch},active:true,missing:0})
      this.wrists.set(hand.id,hand.roll)
    }
    const held=this.grips.filter(g=>g.active&&hands.some(h=>h.id===g.id&&h.closed)).sort((a,b)=>a.id-b.id)
    for(const grip of held){
      const hand=hands.find(h=>h.id===grip.id)!,previous=this.wrists.get(hand.id)??hand.roll
      this.twistTarget+=unwrap(hand.roll-previous)*(held.length===1?1.25:.55)
      this.wrists.set(hand.id,hand.roll)
    }
    for(const id of this.wrists.keys())if(!this.grips.some(g=>g.id===id&&g.active))this.wrists.delete(id)
    if(held.length===2){
      const a=hands.find(h=>h.id===held[0]!.id)!,b=hands.find(h=>h.id===held[1]!.id)!
      const angle=Math.atan2(b.pinch.y-a.pinch.y,b.pinch.x-a.pinch.x),roll=unwrap(b.roll-a.roll),separation=distance(a.pinch,b.pinch),ids=`${a.id}:${b.id}`
      if(this.pair?.ids===ids){
        // Accumulate across ±π; hand crossings never reverse the material IDs.
        this.twistTarget+=unwrap(angle-this.pair.angle)*3.1+unwrap(roll-this.pair.roll)*.48+(separation-this.pair.separation)/face.radius*1.15
      }
      this.pair={angle,roll,separation,ids}
    }else this.pair=undefined
    if(!this.active)this.twistTarget=0
    this.twistTarget=Math.max(-Math.PI*5,Math.min(Math.PI*5,this.twistTarget))
    const duration=Math.min(Math.max(dt,0),.05),steps=Math.max(1,Math.ceil(duration*120)),step=duration/steps
    for(let j=0;j<steps;j++){
      this.twistVelocity+=((this.twistTarget-this.twist)*95-this.twistVelocity*11)*step
      this.twist+=this.twistVelocity*step
      for(const g of this.grips){
        if(g.active){const origin=this.twisted(g.material,face);g.offset={x:g.target.x-origin.x,y:g.target.y-origin.y}}
        else for(const axis of ['x','y'] as const){g.velocity[axis]+=(-g.offset[axis]*145-g.velocity[axis]*10)*step;g.offset[axis]+=g.velocity[axis]*step}
      }
    }
    this.grips=this.grips.filter(g=>g.active||Math.hypot(g.offset.x,g.offset.y)+Math.hypot(g.velocity.x,g.velocity.y)>.005)
    // Two Gaussian radial basis functions are solved together, so each picked
    // material point stays exactly at its own fingertip even when fields overlap.
    this.coefficients=this.grips.map(g=>({...g.offset}))
    if(this.grips.length===2){
      const a=this.grips[0]!,b=this.grips[1]!,k=kernel(a.material,b.material),den=Math.max(.001,1-k*k)
      this.coefficients=[{x:(a.offset.x-k*b.offset.x)/den,y:(a.offset.y-k*b.offset.y)/den},{x:(b.offset.x-k*a.offset.x)/den,y:(b.offset.y-k*a.offset.y)/den}]
    }
    this.rebuild(face)
  }
  deform(p:Point,face:Face,side=1){
    const base=this.twisted(p,face,side)
    const weight=edgeWeight(p)
    this.grips.forEach((g,i)=>{const k=kernel(p,g.material)*weight,c=this.coefficients[i]!;base.x+=c.x*k;base.y+=c.y*k})
    return base
  }
  rebuild(face:Face){
    this.lastFace=face
    let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity
    for(let i=0;i<this.material.length;i+=2){
      const p=this.deform({x:this.material[i]!,y:this.material[i+1]!},face,this.sides[i/2]!)
      this.positions[i]=p.x;this.positions[i+1]=p.y;this.depth[i/2]=p.z/face.radius
      left=Math.min(left,p.x);right=Math.max(right,p.x);top=Math.min(top,p.y);bottom=Math.max(bottom,p.y)
    }
    this.bounds={left,right,top,bottom}
    if(this.grips.length||Math.abs(this.twist)>.001)this.rebuildNormals(face)
  }
  private rebuildNormals(face:Face){
    const normal=this.normals,position=this.positions,depth=this.depth,radius=face.radius
    normal.fill(0)
    const area=face.contour.reduce((sum,p,i)=>{const next=face.contour[(i+1)%face.contour.length]!;return sum+p.x*next.y-next.x*p.y},0)
    const winding=area<0?-1:1
    // Accumulate area-weighted triangle normals, then smooth across each shared
    // vertex. Interpolated normals keep stretched skin free of triangle facets.
    for(let i=0;i<this.indices.length;i+=3){
      const a=this.indices[i]!,b=this.indices[i+1]!,c=this.indices[i+2]!
      const ux=position[b*2]!-position[a*2]!,uy=position[b*2+1]!-position[a*2+1]!,uz=(depth[b]!-depth[a]!)*radius
      const vx=position[c*2]!-position[a*2]!,vy=position[c*2+1]!-position[a*2+1]!,vz=(depth[c]!-depth[a]!)*radius
      const sign=this.sides[a]!*winding,nx=(uy*vz-uz*vy)*sign,ny=(uz*vx-ux*vz)*sign,nz=(ux*vy-uy*vx)*sign
      normal[a*3]!+=nx;normal[a*3+1]!+=ny;normal[a*3+2]!+=nz
      normal[b*3]!+=nx;normal[b*3+1]!+=ny;normal[b*3+2]!+=nz
      normal[c*3]!+=nx;normal[c*3+1]!+=ny;normal[c*3+2]!+=nz
    }
    const rim=1+(FACE_RINGS-1)*SPOKES
    for(let i=rim;i<rim+SPOKES;i++)for(let axis=0;axis<3;axis++){
      const value=normal[i*3+axis]!+normal[(i+this.frontVertices)*3+axis]!
      normal[i*3+axis]=normal[(i+this.frontVertices)*3+axis]=value
    }
    for(let i=0;i<normal.length;i+=3){const length=Math.hypot(normal[i]!,normal[i+1]!,normal[i+2]!)||1;normal[i]!/=length;normal[i+1]!/=length;normal[i+2]!/=length}
  }
  pick(point:Point):Point|undefined {
    const {left,right,top,bottom}=this.bounds
    if(point.x<left||point.x>right||point.y<top||point.y>bottom)return
    let picked:Point|undefined,nearest=-Infinity
    // Match the GPU depth test when a twisted surface folds over itself.
    for(let i=this.frontIndices-3;i>=0;i-=3){
      const a=this.indices[i]!,b=this.indices[i+1]!,c=this.indices[i+2]!
      const ax=this.positions[a*2]!,ay=this.positions[a*2+1]!,bx=this.positions[b*2]!,by=this.positions[b*2+1]!,cx=this.positions[c*2]!,cy=this.positions[c*2+1]!
      const den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy)
      if(Math.abs(den)<.0001)continue
      const u=((by-cy)*(point.x-cx)+(cx-bx)*(point.y-cy))/den,v=((cy-ay)*(point.x-cx)+(ax-cx)*(point.y-cy))/den,z=1-u-v
      if(Math.min(u,v,z)<-.001)continue
      const depth=this.depth[a]!*u+this.depth[b]!*v+this.depth[c]!*z
      if(depth<nearest)continue
      const candidate={x:this.material[a*2]!*u+this.material[b*2]!*v+this.material[c*2]!*z,y:this.material[a*2+1]!*u+this.material[b*2+1]!*v+this.material[c*2+1]!*z}
      if(Math.hypot(candidate.x,candidate.y)>FACE_CORE+.004)continue
      nearest=depth;picked=candidate
    }
    return picked
  }
}
