import { readdir, readFile, writeFile, rm } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { brotliCompress, constants, gzip } from 'node:zlib'
import { promisify } from 'node:util'

const brotli = promisify(brotliCompress), deflate = promisify(gzip)
const compressible = /\.(?:html|css|js|svg|wasm|task|tflite)$/i

// Keep original URLs and bytes intact. The host can negotiate .br/.gz using
// Accept-Encoding; hosts without precompression support still serve originals.
export async function compressAssets(directory) {
  const files = []
  async function collect(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = `${path}/${entry.name}`
      if (entry.isDirectory()) await collect(child)
      else if (entry.isFile() && compressible.test(entry.name)) files.push(child)
    }
  }
  await collect(directory)
  let original = 0, brotliBytes = 0, gzipBytes = 0
  // Bound memory and CPU use when processing the large WASM binaries.
  for (const path of files) {
    const input = await readFile(path)
    const [br, gz] = await Promise.all([
      brotli(input, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }),
      deflate(input, { level: 9 }),
    ])
    original += input.length
    for (const [extension, output] of [['br', br], ['gz', gz]]) {
      const useful = output.length < input.length
      if (useful) await writeFile(`${path}.${extension}`, output)
      else await rm(`${path}.${extension}`, { force: true })
      if (extension === 'br') brotliBytes += useful ? output.length : input.length
      else gzipBytes += useful ? output.length : input.length
    }
  }
  return { files: files.length, original, brotli: brotliBytes, gzip: gzipBytes }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await compressAssets(fileURLToPath(new URL('../dist', import.meta.url)))
  const mb = bytes => `${(bytes / 1e6).toFixed(2)} MB`
  console.log(`Lossless precompression (${result.files} assets): ${mb(result.original)} → Brotli ${mb(result.brotli)} / gzip ${mb(result.gzip)}`)
}
