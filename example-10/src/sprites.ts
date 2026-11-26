const patterns = {
  jelly: ['...aaaaa...', '..abbbbba..', '.abcccccba.', '.abcccccba.', 'abcccccccba', 'abccdccdcba', 'abcccccccba', 'abcccddccba', '.abcccccba.', '..aaaaaaa..', '...a...a...'],
  candy: ['a.........a', 'aba.aaa.aba', '.ababbbaaab', '..abcccba..', '..abcccba..', '..abcccba..', '.abaaabbaba', 'aba.....aba', 'a.........a'],
  gummy: ['..aa...aa..', '.abba.abba.', '.abbaaabba.', '..abbbbba..', '..bcccbcb..', '..bccdccb..', '..bcccccb..', '..abbbbba..', '.abbbaaabba', '.abba.abba.', '..aa...aa..'],
  blob: ['....aaa....', '..aabccaa..', '.abcccccca.', 'abcccccccba', 'abccdccdcba', 'abcccccccba', '.abccddcba.', '..abbbbba..', '...aaaaa...'],
  planet: ['....aaaa....', '..aabbbbaa..', '.abccbbbbaa.', 'abccbbbbbbba', 'abbccccbbbba', 'abbbbccbbbba', 'abbbbbbcccba', '.abbbbbcbba.', '..aabbbbaa..', '....aaaa....'],
  ufo: ['....aaa....', '...abcca...', '..abcccca..', '.aaaaaaaaa.', 'abbbbbbbbba', 'accccbcccca', '.aaaaaaaaa.', '...a.a.a...'],
  star: ['....a....', '....ba...', '..aabbaa.', 'aabccccba', '.abcccba.', '..abbba..', '..ab.ba..', '..a...a..'],
  moon: ['....aaaa..', '..aabbba..', '.abbbba...', 'abbbba....', 'abbbba....', 'abbbbba...', '.abbbbbaa.', '..aabbbba.', '....aaaa..'],
}
const colors = [
  ['#603caa', '#ff77c8', '#ffb5e1'], ['#4037aa', '#8d7aff', '#c7b8ff'],
  ['#254c94', '#61baff', '#b6e9ff'], ['#286f75', '#76f1d0', '#c4ffdf'],
  ['#99569b', '#ffc764', '#fff3a3'],
]
export type SpriteKind = keyof typeof patterns
const cache = new Map<string, HTMLCanvasElement>()

export function sprite(kind: SpriteKind, color = 0) {
  const key = `${kind}:${color}`
  const existing = cache.get(key)
  if (existing) return existing
  const pattern = patterns[kind], palette = colors[color % colors.length]!
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(...pattern.map(row => row.length)); canvas.height = pattern.length
  const ctx = canvas.getContext('2d')!
  const paint: Record<string, string> = { a: palette[0]!, b: palette[1]!, c: palette[2]!, d: '#241332' }
  pattern.forEach((row, y) => [...row].forEach((cell, x) => {
    if (paint[cell]) { ctx.fillStyle = paint[cell]!; ctx.fillRect(x, y, 1, 1) }
  }))
  cache.set(key, canvas)
  return canvas
}
