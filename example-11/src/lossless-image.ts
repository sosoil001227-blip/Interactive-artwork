const pngProbe = 'iVBORw0KGgoAAAANSUhEUgAAAAQAAAABCAYAAAD5PA/NAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGUlEQVQImWP4X2/PKFh9mSmiakKDuXPKfwA4uAbfsVwiiAAAAABJRU5ErkJggg=='
const webpProbe = 'UklGRj4AAABXRUJQVlA4TDEAAAAvAwAAEB+gIAABRH0yzj0jBQJEgwQX/oM0CAmINZpp3jokICHKc8eJMbkfVUVjI/ofAA=='
let exactDecoder: Promise<boolean> | undefined

function loadPNG(url: string) {
  const image = new Image(); image.decoding = 'async'
  return new Promise<HTMLImageElement>((resolve, reject) => {
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('퍼펫 이미지를 읽지 못했어요. 새로고침해 주세요.'))
    image.src = url
  })
}
function probeBlob() {
  const binary = atob(webpProbe), bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: 'image/webp' })
}
async function canDecodeExactly() {
  if (typeof createImageBitmap !== 'function' || typeof fetch !== 'function') return false
  let bitmap: ImageBitmap | undefined
  const canvas = document.createElement('canvas'); canvas.width = 4; canvas.height = 1
  try {
    const png = await loadPNG(`data:image/png;base64,${pngProbe}`)
    bitmap = await createImageBitmap(probeBlob(), { premultiplyAlpha: 'none' })
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return false
    ctx.drawImage(png, 0, 0)
    const reference = ctx.getImageData(0, 0, 4, 1).data
    ctx.clearRect(0, 0, 4, 1); ctx.drawImage(bitmap, 0, 0)
    return ctx.getImageData(0, 0, 4, 1).data.every((value, i) => value === reference[i])
  } catch { return false } finally { bitmap?.close(); canvas.width = canvas.height = 1 }
}

/** Use WebP only when its canvas output matches PNG, including faint alpha edges. */
export async function loadLosslessImage(webp: string, png: string): Promise<HTMLImageElement | ImageBitmap> {
  exactDecoder ??= canDecodeExactly()
  if (await exactDecoder) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8000)
    try {
      const response = await fetch(webp, { signal: controller.signal })
      if (response.ok) return await createImageBitmap(await response.blob(), { premultiplyAlpha: 'none' })
    } catch { /* Unsupported decoder, CSP, or transfer failure: keep the original PNG. */ }
    finally { clearTimeout(timer) }
  }
  return loadPNG(png)
}
