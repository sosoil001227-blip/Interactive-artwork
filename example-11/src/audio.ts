import type { MusicState } from './music'
import { MELODY, midiFrequency } from './song.ts'
import type { Vowel } from './song'

const FORMANTS: Record<Vowel, readonly [number, number, number]> = {
  ih: [390, 1990, 2550], uh: [520, 1190, 2390], ah: [800, 1150, 2800],
  oh: [450, 800, 2830], oo: [350, 950, 2200], er: [490, 1350, 1690],
}
function retarget(parameter: AudioParam, value: number, now: number, tau = .035) {
  parameter.cancelScheduledValues(now); parameter.setTargetAtTime(value, now, tau)
}

export class OperaAudio {
  enabled = true
  echo = true
  private context: AudioContext | undefined
  private master: GainNode | undefined
  private vocal: GainNode | undefined
  private backing: GainNode | undefined
  private wet: GainNode | undefined
  private feedback: GainNode | undefined
  private carrier: OscillatorNode | undefined
  private vibratoDepth: GainNode | undefined
  private formants: BiquadFilterNode[] = []
  private strings: OscillatorNode[] = []
  private sources = new Set<AudioScheduledSourceNode>()
  private nodes: AudioNode[] = []
  private lastNote = -1
  private lastVowel = ''
  private lastChord = ''
  private lastPlaying = false
  private lastVolume = -1
  private lastEnvelope = -1
  private contextFactory: () => AudioContext
  constructor(factory: () => AudioContext = () => new AudioContext()) { this.contextFactory = factory }
  get clock() { return this.context?.currentTime ?? 0 }

  async start() {
    if (!this.context || this.context.state === 'closed') {
      const context = this.contextFactory(); this.context = context
      const master = context.createGain(), vocal = context.createGain(), backing = context.createGain(), compressor = context.createDynamicsCompressor()
      const carrier = context.createOscillator(), carrierGain = context.createGain()
      const vibrato = context.createOscillator(), depth = context.createGain(), cyber = context.createOscillator(), cyberDepth = context.createGain()
      master.gain.value = this.enabled ? .78 : 0; vocal.gain.value = backing.gain.value = 0; carrierGain.gain.value = .22
      const real = new Float32Array(33), imag = new Float32Array(33)
      for (let i = 1; i < imag.length; i++) imag[i] = Math.exp(-i / 17) / i * (i % 2 ? 1 : .78)
      carrier.setPeriodicWave(context.createPeriodicWave(real, imag)); carrier.frequency.value = midiFrequency(60)
      carrier.connect(carrierGain)
      vibrato.frequency.value = 5.6; depth.gain.value = midiFrequency(60) * .0045
      vibrato.connect(depth); depth.connect(carrier.frequency)
      cyber.frequency.value = 31; cyberDepth.gain.value = .007
      cyber.connect(cyberDepth); cyberDepth.connect(carrierGain.gain)
      this.formants = FORMANTS.ih.map((frequency, i) => {
        const filter = context.createBiquadFilter(), gain = context.createGain()
        filter.type = 'bandpass'; filter.frequency.value = frequency; filter.Q.value = [4.5, 7, 9][i]!
        gain.gain.value = [2.4, 1.4, .65][i]!
        carrierGain.connect(filter); filter.connect(gain); gain.connect(vocal)
        this.nodes.push(filter, gain); return filter
      })
      const breath = context.createBufferSource(), breathGain = context.createGain(), breathFilter = context.createBiquadFilter()
      const breathBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate), samples = breathBuffer.getChannelData(0)
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1
      breath.buffer = breathBuffer; breath.loop = true; breathGain.gain.value = .011
      breathFilter.type = 'highpass'; breathFilter.frequency.value = 2100
      breath.connect(breathFilter); breathFilter.connect(breathGain); breathGain.connect(vocal)
      this.strings = [48, 52, 55].map(midi => {
        const oscillator = context.createOscillator(), filter = context.createBiquadFilter(), gain = context.createGain()
        oscillator.type = 'sawtooth'; oscillator.frequency.value = midiFrequency(midi)
        filter.type = 'lowpass'; filter.frequency.value = 1100; gain.gain.value = .022
        oscillator.connect(filter); filter.connect(gain); gain.connect(backing)
        this.nodes.push(oscillator, filter, gain); this.startSource(oscillator); return oscillator
      })
      const delay = context.createDelay(.8), wet = context.createGain(), feedback = context.createGain(), echoTone = context.createBiquadFilter()
      delay.delayTime.value = .24; wet.gain.value = this.echo ? .23 : 0; feedback.gain.value = this.echo ? .23 : 0
      echoTone.type = 'lowpass'; echoTone.frequency.value = 2300
      vocal.connect(delay); delay.connect(echoTone); echoTone.connect(wet); wet.connect(compressor); echoTone.connect(feedback); feedback.connect(delay)
      // Only the singer gets echo. Accompaniment uses a fixed independent gain.
      vocal.connect(compressor); backing.connect(compressor); compressor.connect(master); master.connect(context.destination)
      compressor.threshold.value = -16; compressor.knee.value = 18; compressor.ratio.value = 3
      this.master = master; this.vocal = vocal; this.backing = backing; this.wet = wet; this.feedback = feedback
      this.carrier = carrier; this.vibratoDepth = depth
      this.nodes.push(master, vocal, backing, compressor, carrier, carrierGain, vibrato, depth, cyber, cyberDepth, breath, breathGain, breathFilter, delay, wet, feedback, echoTone)
      for (const source of [carrier, vibrato, cyber, breath]) this.startSource(source)
    }
    if (this.context.state !== 'running') await this.context.resume()
  }

  private startSource(source: AudioScheduledSourceNode) { source.start(); this.sources.add(source) }

  update(state: MusicState) {
    const context = this.context
    if (!context || context.state !== 'running' || !this.carrier || !this.vocal || !this.backing) return
    const now = context.currentTime, playing = state.active && this.enabled
    if (state.noteIndex !== this.lastNote) {
      retarget(this.carrier.frequency, state.frequency, now, .014)
      retarget(this.vibratoDepth!.gain, state.frequency * .0045, now)
      this.lastNote = state.noteIndex
    }
    if (state.vowel !== this.lastVowel) {
      FORMANTS[state.vowel].forEach((frequency, i) => retarget(this.formants[i]!.frequency, frequency, now, .04))
      this.lastVowel = state.vowel
    }
    const chord = MELODY[state.noteIndex]!.chord, key = chord.join(',')
    if (key !== this.lastChord) {
      this.strings.forEach((oscillator, i) => retarget(oscillator.frequency, midiFrequency(chord[i]!), now, .025))
      this.lastChord = key
    }
    const envelope = playing ? (.18 + .82 * state.energy) * state.volume : 0
    if (Math.abs(envelope - this.lastEnvelope) > .008 || playing !== this.lastPlaying || Math.abs(state.volume - this.lastVolume) > .008) {
      retarget(this.vocal.gain, envelope, now, playing ? .018 : .025)
      this.lastEnvelope = envelope; this.lastVolume = state.volume
    }
    if (playing !== this.lastPlaying) retarget(this.backing.gain, playing ? .7 : 0, now, .025)
    if (playing && (this.playedNote !== state.noteIndex || (!this.lastPlaying && state.noteProgress < .08))) {
      this.playedNote = state.noteIndex
      // Soft piano arpeggios and bell-like overtones are synthesized anew.
      if (state.noteIndex % 2 === 0) chord.forEach((midi, i) => this.tone(midiFrequency(midi + 12), now + i * .014, .55, .045, 'triangle'))
      this.tone(state.frequency * 2, now, .38, .022, 'sine')
      this.tone(state.frequency * 4.01, now, .14, .004, 'sine')
    }
    this.lastPlaying = playing
  }
  private playedNote = -1
  private tone(frequency: number, when: number, duration: number, amount: number, type: OscillatorType) {
    const context = this.context!, oscillator = context.createOscillator(), gain = context.createGain()
    oscillator.type = type; oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(.0001, when); gain.gain.exponentialRampToValueAtTime(amount, when + .009)
    gain.gain.exponentialRampToValueAtTime(.0001, when + duration)
    oscillator.connect(gain); gain.connect(this.backing!)
    this.sources.add(oscillator)
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.sources.delete(oscillator) }
    oscillator.start(when); oscillator.stop(when + duration + .03)
  }
  setEcho(enabled: boolean) {
    this.echo = enabled
    if (this.context && this.wet && this.feedback) {
      retarget(this.wet.gain, enabled ? .23 : 0, this.context.currentTime)
      retarget(this.feedback.gain, enabled ? .23 : 0, this.context.currentTime)
    }
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled
    if (this.context && this.master) retarget(this.master.gain, enabled ? .78 : 0, this.context.currentTime)
  }
  ovation() {
    const context = this.context, master = this.master
    if (!context || context.state !== 'running' || !master || !this.enabled) return
    const noise = context.createBuffer(1, Math.ceil(context.sampleRate * .13), context.sampleRate)
    const samples = noise.getChannelData(0)
    for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length) ** 2
    const route = (source: AudioScheduledSourceNode, nodes: AudioNode[], start: number, duration: number) => {
      this.sources.add(source)
      source.onended = () => { source.disconnect(); nodes.forEach(node => node.disconnect()); this.sources.delete(source) }
      source.start(start); source.stop(start + duration)
    }
    for (let i = 0; i < 52; i++) {
      const start = context.currentTime + i * .068 + Math.random() * .09
      const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain()
      source.buffer = noise; filter.type = 'highpass'; filter.frequency.value = 700
      gain.gain.setValueAtTime(.0001, start)
      gain.gain.exponentialRampToValueAtTime(.08 + Math.random() * .07, start + .004)
      gain.gain.exponentialRampToValueAtTime(.0001, start + .11)
      source.connect(filter); filter.connect(gain); gain.connect(master)
      route(source, [filter, gain], start, .13)
    }
    // Original synthesized crowd whoops: rising vowels mixed with the claps.
    for (const [i, frequency] of [240, 285, 350, 415].entries()) {
      const start = context.currentTime + .25 + i * .18
      const voice = context.createOscillator(), vowel = context.createBiquadFilter(), gain = context.createGain()
      voice.type = 'sawtooth'; voice.frequency.setValueAtTime(frequency, start)
      voice.frequency.exponentialRampToValueAtTime(frequency * 1.5, start + .5)
      voice.frequency.exponentialRampToValueAtTime(frequency * 1.15, start + 1.1)
      vowel.type = 'bandpass'; vowel.frequency.value = 900; vowel.Q.value = 2.5
      gain.gain.setValueAtTime(.0001, start)
      gain.gain.exponentialRampToValueAtTime(.045, start + .16)
      gain.gain.exponentialRampToValueAtTime(.0001, start + 1.3)
      voice.connect(vowel); vowel.connect(gain); gain.connect(master)
      route(voice, [vowel, gain], start, 1.35)
    }
  }

  pause() {
    if (!this.context) return
    if (this.vocal) retarget(this.vocal.gain, 0, this.context.currentTime, .025)
    if (this.backing) retarget(this.backing.gain, 0, this.context.currentTime, .025)
    this.lastPlaying = false; this.lastEnvelope = -1
  }
  suspend() { this.pause(); void this.context?.suspend().catch(() => {}) }
  close() {
    for (const source of this.sources) { source.onended = null; try { source.stop() } catch { /* Already ended. */ }; source.disconnect() }
    this.sources.clear(); this.nodes.forEach(node => node.disconnect()); this.nodes.length = 0
    void this.context?.close().catch(() => {}); this.context = undefined
    this.master = this.vocal = this.backing = this.wet = this.feedback = undefined; this.carrier = undefined; this.vibratoDepth = undefined
    this.formants = []; this.strings = []; this.lastNote = this.playedNote = -1; this.lastVowel = this.lastChord = ''
    this.lastPlaying = false; this.lastVolume = this.lastEnvelope = -1
  }
}
