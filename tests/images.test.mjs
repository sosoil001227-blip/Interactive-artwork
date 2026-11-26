import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { readFile } from 'node:fs/promises'

test('compressed theatre assets preserve dimensions, alpha and every visible colour exactly', async () => {
  const root = new URL('../example-11/src/assets/', import.meta.url)
  for (const name of ['christine-ivory-v3', 'audience-wooden-hands-v4']) {
    const png = await readFile(new URL(`${name}.png`, root)), webp = await readFile(new URL(`${name}.webp`, root))
    assert.ok(webp.length < png.length, `${name}: lossless alternative reduces transfer size`)
    const [before, after] = await Promise.all([sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
      sharp(webp).ensureAlpha().raw().toBuffer({ resolveWithObject: true })])
    assert.equal(before.info.width, after.info.width); assert.equal(before.info.height, after.info.height)
    let changed = 0
    for (let i = 0; i < before.data.length; i += 4) {
      if (before.data[i + 3] !== after.data[i + 3] || (before.data[i + 3] &&
        (before.data[i] !== after.data[i] || before.data[i + 1] !== after.data[i + 1] || before.data[i + 2] !== after.data[i + 2]))) changed++
    }
    assert.equal(changed, 0, `${name}: no visible pixel may change`)
  }
})
