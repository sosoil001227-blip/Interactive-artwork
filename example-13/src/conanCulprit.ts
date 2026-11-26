/** A black, angular culprit silhouette, drawn behind the segmented camera subject. */
export class ConanCulprit {
  private canvas=document.createElement('canvas')
  constructor() {
    this.canvas.width=500;this.canvas.height=700
    const c=this.canvas.getContext('2d')!
    c.lineJoin='round';c.lineCap='round'
    const body=c.createLinearGradient(70,250,420,650)
    body.addColorStop(0,'#070b11');body.addColorStop(.5,'#171e28');body.addColorStop(1,'#010306')
    c.beginPath();c.moveTo(256,210);c.bezierCurveTo(208,251,230,312,178,345)
    c.bezierCurveTo(112,369,59,379,27,421);c.lineTo(-22,713);c.lineTo(519,713)
    c.bezierCurveTo(495,499,459,405,380,369);c.bezierCurveTo(325,344,317,291,330,253);c.closePath()
    c.fillStyle=body;c.fill();c.strokeStyle='#46576c';c.lineWidth=2.2;c.stroke()
    c.beginPath();c.moveTo(74,430);c.bezierCurveTo(122,395,173,391,225,423)
    c.lineTo(255,469);c.bezierCurveTo(197,449,150,446,94,469);c.closePath();c.fillStyle='#303844';c.fill()
    c.beginPath();c.moveTo(311,342);c.bezierCurveTo(309,394,331,423,363,446)
    c.lineTo(310,431);c.lineTo(275,367);c.closePath();c.fillStyle='#29323e';c.fill()
    const head=c.createLinearGradient(218,94,392,265)
    head.addColorStop(0,'#070a0f');head.addColorStop(.55,'#202732');head.addColorStop(1,'#020408')
    c.beginPath();c.moveTo(203,184)
    c.bezierCurveTo(178,126,193,49,248,24);c.bezierCurveTo(300,-3,355,18,379,57)
    c.bezierCurveTo(403,99,389,121,382,146);c.lineTo(407,174);c.lineTo(383,185)
    c.lineTo(389,218);c.bezierCurveTo(370,246,361,277,333,288)
    c.bezierCurveTo(303,285,260,256,246,225);c.lineTo(229,230)
    c.bezierCurveTo(201,229,191,208,203,184);c.closePath();c.fillStyle=head;c.fill()
    c.strokeStyle='#566174';c.lineWidth=2.4;c.stroke()
    c.beginPath();c.moveTo(231,53);c.bezierCurveTo(280,16,345,44,359,83)
    c.lineTo(376,145);c.lineTo(349,125);c.lineTo(326,75);c.closePath();c.fillStyle='#3a424b88';c.fill()
    c.beginPath();c.moveTo(248,100);c.lineTo(300,111);c.lineTo(323,136);c.lineTo(276,132);c.closePath()
    c.fillStyle='#020406';c.fill()
    c.beginPath();c.moveTo(259,109);c.lineTo(289,118);c.lineTo(305,130);c.lineTo(278,125);c.closePath()
    c.fillStyle='#e9f1f2';c.fill()
    c.beginPath();c.moveTo(349,136);c.lineTo(371,116);c.lineTo(378,139);c.lineTo(364,155);c.closePath();c.fillStyle='#eff7f7';c.fill()
    c.beginPath();c.moveTo(336,139);c.lineTo(346,174);c.lineTo(367,180)
    c.strokeStyle='#607082';c.lineWidth=2;c.stroke()
    c.beginPath();c.moveTo(275,197);c.bezierCurveTo(306,205,332,218,370,204)
    c.bezierCurveTo(345,237,310,235,282,213);c.closePath();c.fillStyle='#e3ecec';c.fill()
    c.beginPath();c.moveTo(284,209);c.bezierCurveTo(312,218,338,222,359,214)
    c.strokeStyle='#6c7680';c.lineWidth=2;c.stroke()
    c.beginPath();c.moveTo(291,246);c.lineTo(326,265);c.lineTo(342,258)
    c.strokeStyle='#303f51';c.lineWidth=3;c.stroke()
  }

  draw(c:CanvasRenderingContext2D,w:number,h:number,subjectX:number,revealing:boolean) {
    const right=subjectX<w*.5
    const height=Math.min(h*.90,w*.88),width=height*500/700
    const x=right?w-width*.72:-width*.28,y=h*.07
    c.save();c.globalAlpha=revealing?.96:.78
    if(right){c.translate(x+width,y);c.scale(-1,1);c.drawImage(this.canvas,0,0,width,height)}
    else c.drawImage(this.canvas,x,y,width,height)
    c.restore()
  }
}
