export type FaceBox = { x: number; y: number; width: number; height: number }
import type { HandPose } from './tracking'

/** Hand landmarks are already mirrored screen coordinates; masks precede CSS mirroring. */
export function handCameraMask(hand: HandPose, width: number) {
  if(hand.points.length!==21 || hand.points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return
  const xs=hand.points.map(p=>p.x),ys=hand.points.map(p=>p.y)
  const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys)
  if(right-left<8 || bottom-top<8 || right-left>width*.65)return
  return {x:width-(left+right)/2,y:(top+bottom)/2,rx:(right-left)*.57+5,ry:(bottom-top)*.57+5}
}

/** Cover coordinates before the video's CSS mirror, shared by pixels and mask. */
export function faceMask(box: FaceBox, videoWidth: number, videoHeight: number, width: number, height: number) {
  if (![box.x, box.y, box.width, box.height, videoWidth, videoHeight, width, height].every(Number.isFinite)
    || box.width <= .025 || box.height <= .025 || box.width > .9 || box.height > .95 || videoWidth <= 0 || videoHeight <= 0 || width <= 0 || height <= 0) return
  const scale = Math.max(width / videoWidth, height / videoHeight)
  return { x: (box.x + box.width / 2) * videoWidth * scale - (videoWidth * scale - width) / 2,
    y: (box.y + box.height * .51) * videoHeight * scale - (videoHeight * scale - height) / 2,
    rx: box.width * videoWidth * scale * .49, ry: box.height * videoHeight * scale * .57 }
}

export class FaceWindow {
  private box: FaceBox | undefined
  private seen = -Infinity
  reset() { this.box = undefined; this.seen = -Infinity }
  update(box: FaceBox | undefined, now: number) {
    if (!box || !faceMask(box, 1, 1, 1, 1)) return
    // A displaced face is hidden until the new mask is in place; never sweep a room.
    const jump = this.box && Math.hypot(box.x - this.box.x, box.y - this.box.y) > .09
    const mix = !this.box || jump || now - this.seen > 450 ? 1 : .72
    this.box = { x: (this.box?.x ?? box.x) * (1 - mix) + box.x * mix,
      y: (this.box?.y ?? box.y) * (1 - mix) + box.y * mix,
      width: (this.box?.width ?? box.width) * (1 - mix) + box.width * mix,
      height: (this.box?.height ?? box.height) * (1 - mix) + box.height * mix }
    this.seen = now
  }
  snapshot(now: number) { return now - this.seen <= 300 ? this.box : undefined }
}
