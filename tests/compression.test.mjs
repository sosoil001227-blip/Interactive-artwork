import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { brotliDecompressSync, gunzipSync } from 'node:zlib'
import { compressAssets } from '../scripts/compress-assets.mjs'

test('precompression round-trips text and binary without changing originals or compressing fonts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'artwork-compression-'))
  try {
    await mkdir(join(directory, 'assets'))
    const inputs = {
      'index.html': Buffer.from('<!doctype html><title>물결 · 마법</title>'.repeat(50)),
      'assets/runtime.wasm': Buffer.from([0, 97, 115, 109, ...Array(4096).fill(128)]),
      'assets/face.tflite': Buffer.alloc(4096, 85),
      'assets/font.woff2': Buffer.from('already compressed font'),
    }
    for (const [path, input] of Object.entries(inputs)) await writeFile(join(directory, path), input)
    const result = await compressAssets(directory)
    assert.equal(result.files, 3)
    assert.ok(result.brotli < result.original && result.gzip < result.original)
    for (const path of ['index.html', 'assets/runtime.wasm', 'assets/face.tflite']) {
      assert.deepEqual(await readFile(join(directory, path)), inputs[path])
      assert.deepEqual(brotliDecompressSync(await readFile(join(directory, `${path}.br`))), inputs[path])
      assert.deepEqual(gunzipSync(await readFile(join(directory, `${path}.gz`))), inputs[path])
    }
    assert.ok(!(await readdir(join(directory, 'assets'))).some(name => /woff2\./.test(name)))
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('a repeated build cannot serve stale compressed bytes for a now incompressible asset', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'artwork-compression-'))
  try {
    const path = join(directory, 'page.html')
    await writeFile(path, 'a'.repeat(4000)); await compressAssets(directory)
    assert.ok((await readdir(directory)).includes('page.html.br'))
    await writeFile(path, 'x'); await compressAssets(directory)
    assert.deepEqual((await readdir(directory)).sort(), ['page.html'])
    assert.equal(await readFile(path, 'utf8'), 'x')
  } finally { await rm(directory, { recursive: true, force: true }) }
})
