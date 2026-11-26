import { clamp, ease } from './geometry.ts'
import type { Vec3 } from './geometry.ts'
import type { TrackingFrame } from './tracking.ts'
import { sampleFrame } from './rig.ts'
import { ConanGesture, conanLines, conanSceneMs } from './conanGesture.ts'
import type { ConanStatus } from './conanGesture.ts'
import { ConanNarration, narrationCues } from './conanNarration.ts'
import { fitBody,fitGlasses,conanImpact,projectBodyFit,projectedFaceOutline } from './conanFit.ts'
import type { BodyFit, GlassFit } from './conanFit.ts'
import { drawTrackedGlasses,drawTrackedJacket } from './conanGarment.ts'
import { PersonLayers, restoreTrackedHands } from './personLayers.ts'
import type { CameraLayer } from './personLayers.ts'
import { ConanCulprit } from './conanCulprit.ts'

type Projection = (point: Vec3) => Vec3
interface Outfit { x: number; y: number; width: number; height: number; roll: number; forehead: Vec3; chin: Vec3; eyeY: number }

export class ConanWorld {
  readonly gesture = new ConanGesture()
  readonly narration = new ConanNarration()
  private frame?: TrackingFrame
  private bodyFit?: BodyFit
  private received = -Infinity
  private demoStart?: number
  private demoSound = false
  private layers=new PersonLayers()
  private culprit=new ConanCulprit()

  reset() { this.gesture.reset(); this.narration.stop(); this.frame = undefined; this.bodyFit = undefined; this.received = -Infinity; this.demoStart = undefined; this.demoSound = false;this.layers.reset() }

  update(frame: TrackingFrame, now: number) {
    this.frame = frame; this.received = now
    this.bodyFit = fitBody(frame, p => p)
    const before = this.gesture.reveals
    const body = this.bodyFit
    this.gesture.update(frame, now, body ? {
      x: body.neck.x / frame.width, y: body.neck.y / frame.height,
      width: body.neckWidth / frame.width,
      height: Math.max(body.neckWidth, 1.24 * ((body.left.y + body.right.y) / 2 - body.neck.y)) / frame.height,
    } : undefined)
    if (before !== this.gesture.reveals) this.narration.play(now)
  }

  status(now: number): ConanStatus {
    if (this.demoStart === undefined) return {...this.gesture.status(now),body:this.frame?.bodyTracking==='unavailable'?'unavailable'
      :this.frame?.bodyTracking!=='ready'?'loading':this.bodyFit && now - this.received < 390?'ready':'missing'}
    const elapsed = now - this.demoStart
    return { stage: elapsed < 700 ? 'glasses' : elapsed < 1700 ? 'collar' : elapsed < 2600 ? 'point'
      : elapsed < 2600 + conanSceneMs ? 'reveal' : 'point', glasses: elapsed >= 700, suit: elapsed >= 1700,
      hands: 1, leftPoint: elapsed >= 2600, reveals: elapsed >= 2600 ? 1 : 0,body:'ready' }
  }

  demo(now: number) { this.reset(); this.demoStart = now }
  trigger(now:number) { if(this.gesture.trigger(now))this.narration.play(now) }

  private outfit(frame: TrackingFrame, project: Projection): Outfit | undefined {
    if (!frame.face[454] || !frame.face[234] || !frame.face[152] || !frame.face[10]) return
    const at = (index: number) => { const p = frame.face[index]!; return project({ x: p.x * frame.width, y: p.y * frame.height, z: p.z * frame.width }) }
    const a = at(454), b = at(234), forehead = at(10), chin = at(152)
    const width = Math.hypot(b.x - a.x, b.y - a.y), height = Math.hypot(chin.x - forehead.x, chin.y - forehead.y)
    if (![width, height, chin.x, chin.y].every(Number.isFinite) || width < 10 || height < 10) return
    const eyeY = (at(33).y + at(133).y + at(263).y + at(362).y) / 4
    return { x: chin.x, y: chin.y + height * .12, width, height, roll: Math.atan2(b.y - a.y, b.x - a.x), forehead, chin, eyeY }
  }

  draw(c: CanvasRenderingContext2D, project: Projection, now: number, w: number, h: number, reduced: boolean, preview: boolean, camera?: CameraLayer) {
    const demo = this.demoStart
    const elapsed = demo === undefined ? 0 : now - demo
    const status = this.status(now)
    const bodyPoints=Array.from({length:33},()=>({x:.5,y:1,z:0,visibility:1}))
    for(const [index,x,y] of [[11,.85,.96],[12,.15,.96],[13,.94,1.3],[14,.06,1.3],[15,.86,1.6],[16,.14,1.6],[23,.75,1.65],[24,.25,1.65]])bodyPoints[index!]={x:x!,y:y!,z:0,visibility:1}
    const previewFrame = {...sampleFrame,body:bodyPoints}
    const previewScale = Math.min(w / 720, h / 900) * .64
    const previewProject: Projection = p => ({ x: w / 2 + (360 - p.x) * previewScale,
      y: h * .38 + (p.y - 350) * previewScale, z: p.z * previewScale })
    const frame = preview ? previewFrame : now - this.received < 450 ? this.frame : undefined
    const projection = preview ? previewProject : project
    const outfit = frame ? this.outfit(frame, projection) : undefined
    const face=frame?fitGlasses(frame,projection):undefined
    const body = preview ? fitBody(previewFrame, projection) : frame && this.bodyFit ? projectBodyFit(this.bodyFit, project) : undefined
    const masked=!!(frame&&camera&&this.layers.prepare(frame,camera,w,h))
    const revealAt = demo === undefined ? this.gesture.revealAt : demo + 2600
    const reveal = revealAt !== undefined && now >= revealAt && now - revealAt < conanSceneMs
    if (demo !== undefined && elapsed >= 2600 && !this.demoSound) {
      this.demoSound = true; this.narration.play(demo + 2600)
    }
    if (reveal) {
      this.lightning(c, now - revealAt!, w, h, reduced)
    }
    if(masked||preview)this.culprit.draw(c,w,h,body?(body.left.x+body.right.x)/2:face?.center.x??w*.5,reveal)
    if(masked&&camera)this.layers.restore(c,camera,w,h)
    if (preview && outfit) {
      c.save(); c.fillStyle = '#ccd7e11c'; c.strokeStyle = '#b4d4ef44'; c.lineWidth = 1
      c.beginPath(); c.ellipse(outfit.x, (outfit.forehead.y + outfit.chin.y) / 2, outfit.width * .51, outfit.height * .55, outfit.roll, 0, Math.PI * 2); c.fill(); c.stroke(); c.restore()
    }
    const glasses = demo === undefined ? this.gesture.glassesAt : demo + 700
    const suit = demo === undefined ? this.gesture.suitAt : demo + 1700
    if(body&&((preview&&demo===undefined)||(suit!==undefined&&now>=suit))){
      const progress=reduced||suit===undefined?1:ease((now-suit)/620)
      if (frame && camera) {
        this.layers.garment(c, camera, w, h, projectedFaceOutline(frame, project), progress,
          layer => drawTrackedJacket(layer, body, progress))
      } else drawTrackedJacket(c, body, progress)
    }
    if(face&&((preview&&demo===undefined)||(glasses!==undefined&&now>=glasses)))drawTrackedGlasses(c,face,reduced||glasses===undefined?1:ease((now-glasses)/480))
    if (frame && camera) restoreTrackedHands(c, frame, project, camera, true)
    if (reveal) {
      this.impact(c,now-revealAt!,w,h,reduced,face)
      if(now-revealAt!>=220)this.news(c, now - revealAt!, w, h)
    }
    else if (!preview && face && status.stage === 'point') this.pointHint(c, w, h)
  }

  private lightning(c: CanvasRenderingContext2D, elapsed: number, w: number, h: number, reduced: boolean) {
    c.save(); c.fillStyle='#07152bd9'; c.fillRect(0,0,w,h)
    const gradient=c.createRadialGradient(w*.5,h*.35,0,w*.5,h*.35,w*.75)
    gradient.addColorStop(0,'#1957a05c'); gradient.addColorStop(1,'#07152b00'); c.fillStyle=gradient;c.fillRect(0,0,w,h)
    const power = conanImpact(elapsed,reduced).glow
    const bolts = [
      [[-.05,.78],[.18,.58],[.14,.56],[.39,.38],[.35,.37],[.67,.15],[.61,.15],[1.04,-.08]],
      [[.95,.78],[.82,.58],[.88,.58],[.64,.40],[.71,.39],[.47,.19],[.52,.19],[.35,-.08]],
    ]
    c.lineCap='round';c.lineJoin='miter'
    for (const [i,bolt] of bolts.entries()) {
      c.beginPath(); bolt.forEach(([x,y],j)=>{const px=x!*w,py=y!*h;if(j)c.lineTo(px,py);else c.moveTo(px,py)})
      c.globalAlpha=power*(i?.7:1);c.shadowColor='#72baff';c.shadowBlur=reduced?0:23;c.strokeStyle='#8bc9ff';c.lineWidth=Math.max(3,w*.009);c.stroke()
      c.shadowBlur=8;c.strokeStyle='#f5fcff';c.lineWidth=Math.max(1.3,w*.0035);c.stroke()
    }
    if (!reduced && elapsed < 260) { c.globalAlpha=(1-elapsed/260)*.20;c.fillStyle='#d6edff';c.fillRect(0,0,w,h) }
    c.restore()
  }

  private impact(c:CanvasRenderingContext2D,elapsed:number,w:number,h:number,reduced:boolean,face:GlassFit|undefined){
    const effect=conanImpact(elapsed,reduced)
    c.save()
    // The foreground slash stays visible after the segmented subject is restored.
    if(face){
      c.beginPath();c.rect(0,0,w,h)
      face.outline.forEach((p,i)=>{if(i)c.lineTo(p.x,p.y);else c.moveTo(p.x,p.y)});c.closePath();c.clip('evenodd')
    }
    c.globalAlpha=effect.slash*.94;c.lineCap='round';c.lineJoin='miter'
    const paths=[[[0,.77],[.28,.56],[.23,.55],[.57,.32],[.52,.32],[1,.02]],
      [[0,.18],[.18,.24],[.14,.29],[.36,.36]],[[1,.48],[.88,.37],[.91,.31],[.72,.17]]]
    for(const points of paths){
      c.beginPath();points.forEach(([x,y],i)=>{if(i)c.lineTo(x!*w,y!*h);else c.moveTo(x!*w,y!*h)})
      c.shadowColor='#65baff';c.shadowBlur=25;c.strokeStyle='#70baff';c.lineWidth=Math.max(5,w*.014);c.stroke()
      c.shadowBlur=9;c.strokeStyle='#f4fdff';c.lineWidth=Math.max(2,w*.005);c.stroke()
    }
    c.restore()
    if(effect.flash>0){c.save();c.globalAlpha=effect.flash;c.fillStyle='#e6f5ff';c.fillRect(0,0,w,h);c.restore()}
    if(effect.label>0){
      c.save();c.globalAlpha=effect.label;c.translate((face?.center.x??w*.5)>w*.5?w*.20:w*.80,h*.28);c.rotate(-.16)
      c.font=`900 ${clamp(w*.085,29,72)}px system-ui,sans-serif`;c.textAlign='center';c.lineJoin='round'
      c.strokeStyle='#133358';c.lineWidth=7;c.strokeText('파칭!',0,0);c.fillStyle='#f5fbff';c.shadowColor='#5bb5ff';c.shadowBlur=18;c.fillText('파칭!',0,0);c.restore()
    }
  }

  private news(c: CanvasRenderingContext2D, elapsed: number, w: number, h: number) {
    c.save()
    const margin=Math.max(12,w*.035), width=w-margin*2, red='#a6231c'
    const scale=clamp(w/800,.5,1.2), tagH=23*scale
    c.fillStyle=red;c.fillRect(margin,Math.max(54,h*.10),Math.min(width*.64,330*scale),tagH)
    c.font=`700 ${13*scale}px system-ui,sans-serif`;c.fillStyle='#fff';c.textBaseline='middle'
    c.fillText('사건반장  ·  소년 탐정의 결정적 한마디',margin+9*scale,Math.max(54,h*.10)+tagH/2)
    c.font=`800 ${15*scale}px ui-monospace,monospace`;c.textAlign='right';c.fillStyle='#f2f4f7'
    c.fillText('DETECTIVE LIVE',w-margin,33*scale)
    const boxH=Math.max(106,h*.22), y=h-boxH-margin, header=Math.max(27,31*scale)
    c.fillStyle='#0004';c.fillRect(margin+3,y+4,width,boxH)
    c.fillStyle=red;c.fillRect(margin,y,width,header)
    c.textAlign='left';c.font=`700 ${clamp(w*.02,12,18)}px system-ui,sans-serif`;c.fillStyle='#fff'
    c.fillText('제보자  (소년 탐정 코난)',margin+13,y+header/2)
    c.textAlign='right';c.font=`500 ${clamp(w*.015,10,13)}px system-ui,sans-serif`
    c.fillText('●  나레이션',w-margin-12,y+header/2)
    c.fillStyle='#fffdf6';c.fillRect(margin,y+header,width,boxH-header)
    const line=elapsed<narrationCues[1]?0:elapsed<narrationCues[2]?1:2
    const quote=conanLines[line]!
    const font=clamp(w*.036,16,31)
    c.textAlign='left';c.font=`800 ${font}px system-ui,sans-serif`;c.fillStyle=line===1?'#9b241c':'#242323'
    c.fillText(quote,margin+13,y+header+(boxH-header)*.43,width-26)
    c.font=`500 ${clamp(w*.017,10,15)}px system-ui,sans-serif`;c.fillStyle='#7e7470'
    c.fillText('내 이름은 코난, 탐정이죠. 범인은 바로 당신이야! 진실은 언제나 하나!',margin+13,y+header+(boxH-header)*.78,width-26)
    c.restore()
  }

  private pointHint(c: CanvasRenderingContext2D, w: number, h: number) {
    c.save();c.textAlign='center';c.font=`600 ${clamp(w*.018,11,15)}px system-ui,sans-serif`;c.fillStyle='#dbefff'
    c.fillText('왼손 검지를 카메라를 향해 가리켜 보세요.',w/2,h-23,w-30);c.restore()
  }

  close() { this.reset(); this.narration.close() }
}
