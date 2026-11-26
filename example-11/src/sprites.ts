import type { Point } from './tracking'
import type { PuppetPose } from './rig'
import type { MusicState } from './music'
import { loadLosslessImage } from './lossless-image.ts'

export type Sprite = { x: number; y: number; w: number; h: number }
export type Atlas = { image: CanvasImageSource; cells: Sprite[] }
export type TheatreSprites = { ivory: Atlas; hands: Atlas }

export function alphaBounds(data: Uint8ClampedArray, width: number, height: number, columns: number, rows: number, rowStops?: readonly number[]): Sprite[] {
  return Array.from({ length: columns * rows }, (_, index) => {
    const row = Math.floor(index / columns)
    const x0 = Math.round(index % columns * width / columns), y0 = Math.round((rowStops?.[row] ?? row / rows) * height)
    const x1 = Math.round((index % columns + 1) * width / columns), y1 = Math.round((rowStops?.[row + 1] ?? (row + 1) / rows) * height)
    let left = x1, right = x0, top = y1, bottom = y0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (data[(y * width + x) * 4 + 3]! < 128) continue
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
    }
    return right >= left && bottom >= top ? { x: Math.max(x0, left - 2), y: Math.max(y0, top - 2),
      w: Math.min(x1, right + 3) - Math.max(x0, left - 2), h: Math.min(y1, bottom + 3) - Math.max(y0, top - 2) }
      : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  })
}
async function loadAtlas(url: string, fallback: string, columns: number, rows: number, rowStops?: readonly number[]): Promise<Atlas> {
  const image = await loadLosslessImage(url, fallback)
  const canvas = document.createElement('canvas')
  canvas.width = 'naturalWidth' in image ? image.naturalWidth : image.width
  canvas.height = 'naturalHeight' in image ? image.naturalHeight : image.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(image, 0, 0)
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const cells = alphaBounds(pixels.data, canvas.width, canvas.height, columns, rows, rowStops)
  canvas.width = canvas.height = 1
  return { image, cells }
}
export async function loadTheatreSprites(): Promise<TheatreSprites> {
  // The generated expression heads slightly overhang the last uniform row;
  // partition there before alpha bounds so their curls cannot enter the shoe crop.
  const [ivory, hands] = await Promise.all([
    loadAtlas(new URL('./assets/christine-ivory-v3.webp', import.meta.url).href,
      new URL('./assets/christine-ivory-v3.png', import.meta.url).href, 3, 4, [0, .25, .5, .735, 1]),
    loadAtlas(new URL('./assets/audience-wooden-hands-v4.webp', import.meta.url).href,
      new URL('./assets/audience-wooden-hands-v4.png', import.meta.url).href, 2, 3),
  ])
  return { ivory, hands }
}
function part(ctx: CanvasRenderingContext2D, atlas: Atlas, index: number, x: number, y: number, w: number, h: number) {
  const s = atlas.cells[index]!
  ctx.drawImage(atlas.image, s.x, s.y, s.w, s.h, x, y, w, h)
}
function segment(ctx: CanvasRenderingContext2D, atlas: Atlas, index: number, a: Point, b: Point, width: number, flip: boolean) {
  ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2)
  if (flip) ctx.scale(-1, 1)
  // Endpoints fall on the centers of the carved ball joints, not the image edges.
  const length = Math.hypot(b.x - a.x, b.y - a.y), extra = length * .055
  part(ctx, atlas, index, -width / 2, -extra, width, length + extra * 2)
  ctx.restore()
}

export function drawChristine(ctx: CanvasRenderingContext2D, atlas: Atlas, pose: PuppetPose, music: MusicState, now: number, playful: boolean, reduced: boolean) {
  const u = pose.scale
  if (pose.anchors) {
    ctx.lineWidth = .7
    pose.anchors.forEach((anchor, i) => {
      const end = pose.attachments[i]!
      const tension = pose.tensions[i] ?? .5
      ctx.strokeStyle = `rgba(234,219,189,${.35 + tension * .45})`
      ctx.beginPath(); ctx.moveTo(anchor.x, anchor.y)
      const slack = (1 - tension) * 18 * u
      ctx.quadraticCurveTo((anchor.x + end.x) / 2 + slack, (anchor.y + end.y) / 2 + slack, end.x, end.y); ctx.stroke()
      ctx.fillStyle = '#edddbf'; ctx.beginPath(); ctx.arc(anchor.x, anchor.y, 2.2, 0, Math.PI * 2); ctx.fill()
    })
  }
  // Legs remain separate bones under the skirt, exposed as the hem follows each knee.
  for (let i = 0; i < 2; i++) {
    segment(ctx, atlas, 6, pose.hips[i]!, pose.knees[i]!, 25 * u, !!i)
    segment(ctx, atlas, 7, pose.knees[i]!, pose.ankles[i]!, 19 * u, !!i)
    const ankle = pose.ankles[i]!
    ctx.save(); ctx.translate(ankle.x, ankle.y); ctx.rotate(Math.atan2(ankle.x - pose.knees[i]!.x, ankle.y - pose.knees[i]!.y) * -.25)
    part(ctx, atlas, 8, -12 * u, -7 * u, 24 * u, 38 * u); ctx.restore()
  }
  // A single continuous skirt belongs to the fixed torso; legs hinge behind it.
  // Its native aspect ratio is retained rather than widening and separating panels.
  ctx.save(); ctx.translate(pose.hip.x, pose.hip.y); ctx.rotate(pose.bodyTilt)
  part(ctx, atlas, 2, -82.5 * u, -10 * u, 165 * u, 180 * u); ctx.restore()
  // Draw the head behind the neckline, so the long atlas neck tucks into the bodice.
  ctx.save(); ctx.translate(pose.head.x, pose.head.y); ctx.rotate(pose.tilt - (music.active ? (music.midi - 60) / 9 * .025 : 0))
  const mouth = music.mouth
  const closed = playful && !reduced && Math.sin(now / 2100) > .998 ? 11 : 0
  const singing = mouth > .63 || (mouth > .12 && music.midi >= 67) ? 10 : mouth > .12 ? 9 : closed
  part(ctx, atlas, singing, -41 * u, -53.5 * u, 82 * u, 107 * u)
  ctx.restore()
  ctx.save(); ctx.translate(pose.neck.x, pose.neck.y)
  ctx.rotate(pose.bodyTilt)
  part(ctx, atlas, 1, -45 * u, -5 * u, 90 * u, 110 * u); ctx.restore()
  for (let i = 0; i < 2; i++) {
    segment(ctx, atlas, 3, pose.shoulders[i]!, pose.elbows[i]!, 24 * u, !!i)
    segment(ctx, atlas, 4, pose.elbows[i]!, pose.wrists[i]!, 28 * u, !!i)
    ctx.save(); ctx.translate(pose.wrists[i]!.x, pose.wrists[i]!.y)
    ctx.rotate(Math.atan2(pose.wrists[i]!.y - pose.elbows[i]!.y, pose.wrists[i]!.x - pose.elbows[i]!.x) - Math.PI / 2)
    if (i) ctx.scale(-1, 1)
    part(ctx, atlas, 5, -10 * u, -3 * u, 21 * u, 37 * u); ctx.restore()
  }
}

export function audienceLayout(width: number, height: number, amount: number, index: number) {
  const count=width<650?3:5, size=Math.min(width<650?138:190,width/count*1.08)
  const lift=Math.max(0,Math.min(1,(amount-(index%3)*.07)/(1-(index%3)*.07)))
  // Palms clear the apron while wrist ends stay tucked behind its front edge.
  return { size, x:width*(.2+.6*(index+.5)/count), y:height+size*.3-lift*(height*.075+size*1.3) }
}
export function drawAudience(ctx: CanvasRenderingContext2D, atlas: Atlas, amount: number, now: number, width: number, height: number, reduced: boolean) {
  if (amount < .01) return
  const count = width < 650 ? 3 : 5
  for (let i = 0; i < count; i++) {
    const cycle = reduced ? .5 : (Math.sin(now / 105 + i * 1.7) + 1) * .5
    const {size,x,y}=audienceLayout(width,height,amount,i)
    ctx.save(); ctx.translate(x, y); ctx.rotate((i % 2 ? -1 : 1) * .09)
    ctx.scale(1 - cycle * .075, 1 + cycle * .025)
    part(ctx, atlas, i % 3 * 2 + (cycle > .68 ? 1 : 0), -size / 2, 0, size, size)
    ctx.restore()
  }
}
