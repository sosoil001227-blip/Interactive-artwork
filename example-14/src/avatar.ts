type RGB = readonly [number, number, number]
interface Style {
  name: string
  color: string
  label: string
  shadow: RGB
  light: RGB
  mix: number
  saturation: number
}

export const characters = [
  { name: 'VOLT', color: '#e3ff5d', label: '라임 러닝웨어', shadow: [20, 28, 49], light: [238, 255, 170], mix: .33, saturation: 1.18 },
  { name: 'ROXY', color: '#ff77a7', label: '핑크 와이드 팬츠', shadow: [47, 15, 55], light: [255, 214, 222], mix: .42, saturation: 1.03 },
  { name: 'BIT', color: '#7ff9ff', label: '아이스 트랙수트', shadow: [10, 26, 51], light: [187, 244, 255], mix: .40, saturation: .91 },
  { name: 'NOVA', color: '#b298ff', label: '바이올렛 점프수트', shadow: [27, 18, 61], light: [224, 211, 255], mix: .44, saturation: 1.08 },
] as const satisfies readonly Style[]

export type Character = typeof characters[number]
export interface Box { x: number; y: number; width: number; height: number }

export function fitFrame(frame: Box, aspect: number): Box {
  const width = Math.min(frame.width, frame.height * aspect)
  const height = width / aspect
  return { x: frame.x + (frame.width - width) / 2, y: frame.y + (frame.height - height) / 2, width, height }
}

const bayer = [-3.5, .5, -2.5, 1.5, 2.5, -1.5, 3.5, -.5, -2, 2, -3, 1, 4, 0, 3, -1]

function grade(image: ImageData, look: Character) {
  const { data, width, height } = image
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4
      const luma = data[index]! * .213 + data[index + 1]! * .715 + data[index + 2]! * .072
      const level = Math.max(0, Math.min(1, (luma - 15) / 224))
      const texture = bayer[(y & 3) * 4 + (x & 3)]! * .7
      for (let channel = 0; channel < 3; channel++) {
        const original = luma + (data[index + channel]! - luma) * look.saturation
        const graded = look.shadow[channel]! + (look.light[channel]! - look.shadow[channel]!) * level
        data[index + channel] = Math.round((original + (graded - original) * look.mix + texture) / 7) * 7
      }
    }
  }
}

export class ArcadePortrait {
  private canvas = document.createElement('canvas')
  private context = this.canvas.getContext('2d', { alpha: false, willReadFrequently: true })!
  private lastFrame = ''
  private lastStream: HTMLVideoElement['srcObject'] = null
  draw(
    context: CanvasRenderingContext2D, frame: Box, video: HTMLVideoElement,
    look: Character, count: number, slot: number,
  ) {
    if (frame.width <= 0 || frame.height <= 0) return
    const w = video.videoWidth, h = video.videoHeight
    if (!w || !h || video.readyState < 2) return

    const sw = w / count, sx = (count - 1 - slot) * sw
    const scale = Math.min(1, 256 / Math.max(sw, h))
    const key = `${Math.floor(video.currentTime * 30)}:${w}:${h}:${count}:${slot}:${look.name}`
    const stream = video.srcObject
    if (this.lastFrame !== key || this.lastStream !== stream) {
      const width = Math.max(1, Math.round(sw * scale)), height = Math.max(1, Math.round(h * scale))
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width
        this.canvas.height = height
      }
      const layer = this.context
      layer.setTransform(-1, 0, 0, 1, width, 0)
      layer.drawImage(video, sx, 0, sw, h, 0, 0, width, height)
      const pixels = layer.getImageData(0, 0, width, height)
      grade(pixels, look)
      layer.putImageData(pixels, 0, 0)
      this.lastFrame = key
      this.lastStream = stream
    }

    const box = fitFrame(frame, sw / h)
    const { x, y, width, height } = box
    context.save()
    context.imageSmoothingEnabled = false
    context.drawImage(this.canvas, x, y, width, height)
    context.restore()
  }
}
