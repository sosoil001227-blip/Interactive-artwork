import test from 'node:test'
import assert from 'node:assert/strict'
import { alphaBounds, audienceLayout, loadTheatreSprites } from '../src/sprites.ts'

test('atlas crops preserve transparent gaps and separate expression hair from the shoes above', () => {
  const width = 30, height = 40, pixels = new Uint8ClampedArray(width * height * 4)
  const set = (x: number, y: number) => { pixels[(y * width + x) * 4 + 3] = 255 }
  for (let y = 21; y < 27; y++) for (let x = 22; x < 28; x++) set(x, y)
  for (let y = 29; y < 39; y++) for (let x = 22; x < 28; x++) set(x, y)
  const crops = alphaBounds(pixels, width, height, 3, 4, [0, .25, .5, .70, 1])
  assert.equal(crops.length, 12)
  const shoe = crops[8]!, head = crops[11]!
  assert.ok(shoe.y + shoe.h <= 28)
  assert.ok(head.y <= 29 && head.y + head.h >= 38)
  for (const crop of crops) assert.ok(crop.w > 0 && crop.h > 0 && crop.x >= 0 && crop.y >= 0)
})

test('a WebView without WebP loads both original PNG atlases instead', async () => {
  const descriptors = ['Image', 'document'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  const requests: string[] = []
  class ImageFallback {
    naturalWidth = 6; naturalHeight = 8; decoding = ''
    onload = () => {}; onerror = () => {}
    private url = ''
    get src() { return this.url }
    set src(value: string) {
      this.url = value; requests.push(value)
      queueMicrotask(() => { if (value.endsWith('.webp')) this.onerror(); else this.onload() })
    }
  }
  Object.defineProperties(globalThis, {
    Image: { value: ImageFallback, configurable: true },
    document: { value: { createElement: () => ({ width: 0, height: 0, getContext: () => ({
      drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(6 * 8 * 4).fill(255) }),
    }) }) }, configurable: true },
  })
  try {
    const sprites = await loadTheatreSprites()
    assert.equal(requests.filter(url => url.endsWith('.webp')).length, 0)
    assert.equal(requests.filter(url => url.endsWith('.png')).length, 2)
    assert.equal(sprites.ivory.cells.length, 12); assert.equal(sprites.hands.cells.length, 6)
  } finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})

test('clapping palms rise above the apron, with wrist ends hidden behind it, then leave the viewport',()=>{
  for(const[width,height]of [[1440,900],[390,844]]){
    const count=width<650?3:5
    for(let i=0;i<count;i++){
      const visible=audienceLayout(width,height,1,i),gone=audienceLayout(width,height,0,i)
      assert.ok(visible.y+visible.size*.72<height*.91)
      assert.ok(visible.y+visible.size>height*.91)
      assert.ok(visible.y>height*.6)
      assert.ok(gone.y>height)
      assert.ok(visible.x>=width*.2&&visible.x<=width*.8)
    }
  }
})
