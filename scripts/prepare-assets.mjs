import { cp, mkdir, access, writeFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
await mkdir(new URL('public/mediapipe/', root), { recursive: true })
await cp(new URL('node_modules/@mediapipe/tasks-vision/wasm/', root), new URL('public/mediapipe/', root), { recursive: true })
await cp(new URL('example-8/public/fonts/', root), new URL('public/fonts/', root), { recursive: true })
await mkdir(new URL('public/models/', root), { recursive: true })
const model = new URL('public/models/hand_landmarker.task', root)
try {
  await access(model)
} catch {
  try {
    await cp(new URL('example-8/public/models/hand_landmarker.task', root), model)
  } catch {
    const url = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
    const response = await fetch(url, { signal: AbortSignal.timeout(120000) })
    if (!response.ok) throw new Error(`Hand model download failed: ${response.status}`)
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength < 1000000) throw new Error('Incomplete hand model download')
    await writeFile(model, bytes)
  }
}
console.log('Shared MediaPipe runtime, hand model and fonts ready for examples 8 and 9.')
await import('./prepare-worker.mjs')
