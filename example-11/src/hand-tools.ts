import type { Hands, HandPose } from './tracking'
import type { MusicState } from './music'
import { controllerLayout, drawController, drawWand } from './props.ts'
import { handCameraMask } from './face-window.ts'

/** Two bounded patches keep real hands and their props visible in front of the valance. */
export class HandTools {
  private frameKey = ''
  private readonly left: HTMLCanvasElement
  private readonly right: HTMLCanvasElement
  constructor(left: HTMLCanvasElement,right: HTMLCanvasElement) { this.left=left;this.right=right }
  hide() {
    this.frameKey = ''
    for(const canvas of [this.left,this.right]){
      if(canvas.hidden)continue
      canvas.hidden=true
      const ctx=canvas.getContext('2d');ctx?.setTransform(1,0,0,1,0,0);ctx?.clearRect(0,0,canvas.width,canvas.height)
    }
  }
  draw(video: HTMLVideoElement, hands: Hands, music: MusicState, width: number, height: number) {
    const baton=music.baton
    const key=`${video.currentTime}/${hands.left?.seen}/${hands.right?.seen}/${width}/${height}/${devicePixelRatio}/${baton?.base.x}/${baton?.base.y}/${baton?.tip.x}/${baton?.tip.y}`
    if(key===this.frameKey)return
    this.frameKey=key
    this.patch(this.left,video,hands.left,music,width,height,true)
    this.patch(this.right,video,hands.right,music,width,height,false)
  }
  private patch(canvas: HTMLCanvasElement,video: HTMLVideoElement,hand: HandPose|undefined,music:MusicState,width:number,height:number,left:boolean){
    if(!hand){canvas.hidden=true;return}
    const ctx=canvas.getContext('2d'),mask=handCameraMask(hand,width)
    if(!ctx||!mask){canvas.hidden=true;return}
    const pins=left?controllerLayout(hand).pins:music.baton?[music.baton.base,music.baton.tip]:[]
    const points=[...hand.points,...pins],xs=points.map(p=>p.x),ys=points.map(p=>p.y)
    const x=Math.floor(Math.min(...xs)-36),y=Math.floor(Math.min(...ys)-36)
    const w=Math.min(768,Math.ceil((Math.max(...xs)-x+36)/64)*64),h=Math.min(768,Math.ceil((Math.max(...ys)-y+36)/64)*64)
    const dpr=Math.min(devicePixelRatio||1,1.25)
    if(canvas.width!==Math.round(w*dpr))canvas.width=Math.round(w*dpr)
    if(canvas.height!==Math.round(h*dpr))canvas.height=Math.round(h*dpr)
    for(const [property,value] of [['left',x],['top',y],['width',w],['height',h]] as const){
      const css=`${value}px`;if(canvas.style[property]!==css)canvas.style[property]=css
    }
    canvas.hidden=false
    ctx.setTransform(dpr,0,0,dpr,-x*dpr,-y*dpr);ctx.clearRect(x,y,w,h)
    if(video.readyState>=2&&video.videoWidth&&video.videoHeight){
      const scale=Math.max(width/video.videoWidth,height/video.videoHeight)
      ctx.save();ctx.globalAlpha=.28;ctx.translate(width,0);ctx.scale(-1,1)
      ctx.drawImage(video,-(video.videoWidth*scale-width)/2,-(video.videoHeight*scale-height)/2,video.videoWidth*scale,video.videoHeight*scale);ctx.restore()
      const cx=width-mask.x,cy=mask.y
      ctx.save();ctx.translate(cx,cy);ctx.scale(mask.rx,mask.ry)
      const fade=ctx.createRadialGradient(0,0,.5,0,0,1);fade.addColorStop(0,'#000');fade.addColorStop(1,'#0000')
      ctx.globalCompositeOperation='destination-in';ctx.fillStyle=fade;ctx.fillRect((x-cx)/mask.rx,(y-cy)/mask.ry,w/mask.rx,h/mask.ry);ctx.restore()
    }
    if(left)drawController(ctx,hand)
    else if(music.baton)drawWand(ctx,music.baton,hand.size)
  }
}
