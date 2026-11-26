import type { HandLandmarkerResult } from '@mediapipe/tasks-vision'
import { cameraToScreen, distance } from './geometry.ts'
import type { Point } from './geometry.ts'

export type Hand = { id:number; points:Point[]; pinch:Point; closed:boolean; roll:number; seen:number; label:string }
export class Hands {
  private slots: (Hand | undefined)[] = [undefined,undefined]
  reset(){this.slots=[undefined,undefined]}
  snapshot(now:number){return this.slots.filter((h):h is Hand=>!!h&&now-h.seen<180)}
  update(result:HandLandmarkerResult,vw:number,vh:number,w:number,h:number,now:number){
    const candidates=result.landmarks.slice(0,2).flatMap((raw,i)=>{
      if(raw.length!==21||raw.some(p=>![p.x,p.y,p.z].every(Number.isFinite))||(result.handedness[i]?.[0]?.score??1)<.45)return []
      const points=raw.map(p=>cameraToScreen(p,vw,vh,w,h))
      const world=result.worldLandmarks?.[i]
      const metric=world?.length===21&&world.every(p=>[p.x,p.y,p.z].every(Number.isFinite))?world:raw.map(p=>({x:p.x,y:p.y*vh/vw,z:p.z}))
      const dist=(a:number,b:number)=>Math.hypot(metric[a]!.x-metric[b]!.x,metric[a]!.y-metric[b]!.y,metric[a]!.z-metric[b]!.z)
      const size=Math.max(dist(0,9),dist(5,17),.00001)
      // Reconstructed fingertip depth gets noisy in front of the face. Visible
      // thumb/index contact must still count as a pinch when their 3D z differs.
      const projectedSize=Math.max(distance(points[0]!,points[9]!),distance(points[5]!,points[17]!),12)
      const ratio=Math.min(dist(4,8)/size,distance(points[4]!,points[8]!)/projectedSize)
      return [{points,ratio,label:result.handedness[i]?.[0]?.categoryName??'',pinch:{x:(points[4]!.x+points[8]!.x)/2,y:(points[4]!.y+points[8]!.y)/2}}]
    })
    const cost=(i:number,slot:number)=>{
      const c=candidates[i]!,old=this.slots[slot]
      // An unused slot must not steal an existing hand as it crosses the image.
      if(!old||now-old.seen>600)return 1.5+Math.abs(c.pinch.x-w*(slot===0?.3:.7))/w*.1
      return distance(c.pinch,old.pinch)/w+(old.label!==c.label?.35:0)
    }
    let assignment:number[]=[]
    if(candidates.length===2)assignment=cost(0,0)+cost(1,1)<=cost(0,1)+cost(1,0)?[0,1]:[1,0]
    else if(candidates.length===1){
      const candidate=candidates[0]!,recent=this.slots.map((hand,id)=>({hand,id})).filter(({hand})=>hand&&now-hand.seen<600)
      const matching=recent.filter(({hand})=>candidate.label&&hand!.label===candidate.label)
      const empty=[0,1].find(id=>!this.slots[id]||now-this.slots[id]!.seen>=600)
      const newLabel=candidate.label&&recent.length&&recent.every(({hand})=>hand!.label&&hand!.label!==candidate.label)
      assignment=[matching.length===1?matching[0]!.id:newLabel&&empty!==undefined?empty:cost(0,0)<=cost(0,1)?0:1]
    }
    candidates.forEach((c,i)=>{
      const id=assignment[i]!,old=this.slots[id],recent=old&&now-old.seen<180
      const closed=c.ratio<(recent&&old.closed?.52:.34)
      const alpha=recent?1-Math.exp(-(now-old.seen)/24):1
      const pinch={x:old&&recent?old.pinch.x+(c.pinch.x-old.pinch.x)*alpha:c.pinch.x,y:old&&recent?old.pinch.y+(c.pinch.y-old.pinch.y)*alpha:c.pinch.y}
      this.slots[id]={id,points:c.points,pinch,closed,roll:Math.atan2(c.points[9]!.y-c.points[0]!.y,c.points[9]!.x-c.points[0]!.x),seen:now,label:c.label}
    })
  }
}
