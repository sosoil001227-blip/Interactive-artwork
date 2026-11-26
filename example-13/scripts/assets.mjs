import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const root = new URL('../', import.meta.url)
const shared = process.argv.includes('--shared')
const output = new URL(shared ? '../public/example-13-assets/' : 'public/', root)
const models = [
  ['face_landmarker', 'face_landmarker', '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff'],
  ['pose_landmarker', 'pose_landmarker_lite', '59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a'],
]
// The hub already serves the hand model from its shared models directory.
if (!shared) models.push(['hand_landmarker', 'hand_landmarker', 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1'])
await mkdir(new URL('models/', output), { recursive: true })
await Promise.all(models.map(async ([family, name, hash]) => {
  const destination = new URL(`models/${name}.task`, output)
  const digest = bytes => createHash('sha256').update(bytes).digest('hex')
  const candidates = [destination]
  if (shared) candidates.push(new URL(`public/models/${name}.task`, root))
  else if (name === 'hand_landmarker') candidates.push(new URL(`../public/models/${name}.task`, root))
  for (const candidate of candidates) {
    const cached = await readFile(candidate).catch(() => null)
    if (!cached || digest(cached) !== hash) continue
    if (candidate.href !== destination.href) await writeFile(destination, cached)
    return
  }
  const response = await fetch(`https://storage.googleapis.com/mediapipe-models/${family}/${name}/float16/1/${name}.task`, { signal: AbortSignal.timeout(60000) })
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (digest(bytes) !== hash) throw new Error(`${name}: model checksum mismatch`)
  await writeFile(destination, bytes)
}))
if (!shared) {
  await cp(new URL('node_modules/@mediapipe/tasks-vision/wasm/', root), new URL('wasm/', output), { recursive: true })
}
await build({
  configFile: false, publicDir: false, logLevel: 'warn',
  build: {
    outDir: fileURLToPath(new URL('runtime/', output)), emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL('src/tracking.worker.ts', root)),
      name: 'VeilFaceTracking', formats: ['iife'], fileName: () => 'tracking.js',
    },
  },
})
