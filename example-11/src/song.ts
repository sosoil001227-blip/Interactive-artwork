export type Vowel = 'ih' | 'uh' | 'ah' | 'oh' | 'oo' | 'er'
export type SongNote = { midi: number; beats: number; start: number; duration: number; syllable: string; vowel: Vowel; chord: readonly number[] }
export const TEMPO = 84
export const BEAT = 60 / TEMPO
export const SONG_TITLE = 'Twinkle, Twinkle, Little Star'
const phrases = [
  [60, 60, 67, 67, 69, 69, 67], [65, 65, 64, 64, 62, 62, 60],
  [67, 67, 65, 65, 64, 64, 62], [67, 67, 65, 65, 64, 64, 62],
  [60, 60, 67, 67, 69, 69, 67], [65, 65, 64, 64, 62, 62, 60],
]
const syllables = [
  ['Twin', 'kle', 'twin', 'kle', 'lit', 'tle', 'star'], ['How', 'I', 'won', 'der', 'what', 'you', 'are'],
  ['Up', 'a', 'bove', 'the', 'world', 'so', 'high'], ['Like', 'a', 'dia', 'mond', 'in', 'the', 'sky'],
  ['Twin', 'kle', 'twin', 'kle', 'lit', 'tle', 'star'], ['How', 'I', 'won', 'der', 'what', 'you', 'are'],
]
const vowels: Vowel[][] = [
  ['ih','uh','ih','uh','ih','uh','ah'], ['oh','ah','uh','er','ah','oo','ah'],
  ['uh','ah','oh','uh','er','oh','ah'], ['ah','ah','ah','uh','ih','uh','ah'],
  ['ih','uh','ih','uh','ih','uh','ah'], ['oh','ah','uh','er','ah','oo','ah'],
]
// Original piano/strings harmony around the traditional tune; no recording/samples.
const C = [48, 52, 55], F = [41, 48, 53], G = [43, 50, 55]
const chords = [[C,C,F,C], [F,C,G,C], [C,F,C,G], [C,F,C,G], [C,C,F,C], [F,C,G,C]]
let cursor = 0
export const MELODY: readonly SongNote[] = phrases.flatMap((phrase, line) => phrase.map((midi, i) => {
  const beats = i === 6 ? 2 : 1, start = cursor, duration = beats * BEAT
  cursor += duration
  return { midi, beats, start, duration, syllable: syllables[line]![i]!, vowel: vowels[line]![i]!, chord: chords[line]![Math.min(3, Math.floor(i / 2))]! }
}))
export const SONG_DURATION = cursor
export function locateNote(elapsed: number) {
  const time = Math.max(0, Math.min(SONG_DURATION, elapsed))
  const index = MELODY.findIndex(note => time < note.start + note.duration - .000001)
  return index < 0 ? MELODY.length - 1 : index
}
export function midiFrequency(midi: number) { return 440 * 2 ** ((midi - 69) / 12) }
export function noteName(midi: number) {
  const names = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B']
  return `${names[((Math.round(midi) % 12) + 12) % 12]}${Math.floor(Math.round(midi) / 12) - 1}`
}
