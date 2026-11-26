import sharp from 'sharp'
import { readdir, readFile, writeFile } from 'node:fs/promises'

const directory = new URL('../example-11/src/assets/', import.meta.url)
const modern = new Set(['christine-ivory-v3.png', 'audience-wooden-hands-v4.png'])
let before = 0, after = 0
for (const name of (await readdir(directory)).filter(name => name.endsWith('.png'))) {
  const path = new URL(name, directory), input = await readFile(path)
  const original = await sharp(input).ensureAlpha().raw().toBuffer()
  const png = await sharp(input).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()
  const decodedPNG = await sharp(png).ensureAlpha().raw().toBuffer()
  if (!original.equals(decodedPNG)) throw new Error(`PNG pixels changed: ${name}`)
  if (png.length < input.length) await writeFile(path, png)
  if (!modern.has(name)) continue
  const webp = await sharp(input).webp({ lossless: true, effort: 6, alphaQuality: 100 }).toBuffer()
  const decoded = await sharp(webp).ensureAlpha().raw().toBuffer()
  if (decoded.length !== original.length) throw new Error(`Image dimensions changed: ${name}`)
  for (let i = 0; i < original.length; i += 4) {
    // WebP may discard RGB under zero alpha; every visible RGBA value is exact.
    if (original[i + 3] !== decoded[i + 3] || (original[i + 3] &&
      (original[i] !== decoded[i] || original[i + 1] !== decoded[i + 1] || original[i + 2] !== decoded[i + 2]))) {
      throw new Error(`Visible pixels changed: ${name}`)
    }
  }
  await writeFile(new URL(name.replace(/\.png$/, '.webp'), directory), webp)
  before += input.length; after += webp.length
}
console.log(`Lossless theatre images: ${(before / 1e6).toFixed(2)} MB → ${(after / 1e6).toFixed(2)} MB; PNG fallbacks retained.`)
