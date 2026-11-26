type SummonCue = { output: GainNode; sources: Set<AudioScheduledSourceNode>; nodes: AudioNode[]; timer: number }

// Synthesized locally: a quiet bass drone and a shimmering summoning chime.
// The audio context is only resumed from the camera/sound button's gesture.
export class MagicHum {
  enabled = true
  private context: AudioContext | undefined
  private volume: GainNode | undefined
  private bass: OscillatorNode | undefined
  private overtone: OscillatorNode | undefined
  private tremolo: OscillatorNode | undefined
  private depth: GainNode | undefined
  private cue: SummonCue | undefined
  private impulse: AudioBuffer | undefined
  private lastEnergy = -1

  async start() {
    if (!this.enabled) return
    if (!this.context) {
      const context = new AudioContext()
      this.context = context
      const volume = context.createGain(), filter = context.createBiquadFilter()
      const bass = context.createOscillator(), overtone = context.createOscillator()
      const overtoneVolume = context.createGain()
      const tremolo = context.createOscillator(), depth = context.createGain()
      filter.type = 'lowpass'; filter.frequency.value = 380; filter.Q.value = .6
      bass.type = 'sine'; bass.frequency.value = 66
      overtone.type = 'triangle'; overtone.frequency.value = 133.5; overtoneVolume.gain.value = .14
      tremolo.type = 'sine'; tremolo.frequency.value = 7
      volume.gain.value = 0; depth.gain.value = 0
      bass.connect(filter); overtone.connect(overtoneVolume); overtoneVolume.connect(filter)
      filter.connect(volume); volume.connect(context.destination)
      tremolo.connect(depth); depth.connect(volume.gain)
      bass.start(); overtone.start(); tremolo.start()
      this.volume = volume; this.bass = bass; this.overtone = overtone; this.tremolo = tremolo; this.depth = depth
    }
    this.lastEnergy = -1
    if (this.context.state === 'suspended') await this.context.resume()
  }

  update(energy: number) {
    const context = this.context
    if (!context || context.state === 'closed') return
    const amount = this.enabled ? Math.max(0, Math.min(1, energy)) : 0
    if (amount === this.lastEnergy) return
    this.lastEnergy = amount
    const now = context.currentTime
    // Retarget from the current sound without retaining hours of automation.
    for (const parameter of [this.volume!.gain, this.depth!.gain, this.bass!.frequency, this.overtone!.frequency, this.tremolo!.frequency]) {
      if (typeof parameter.cancelAndHoldAtTime === 'function') parameter.cancelAndHoldAtTime(now)
      else {
        const value = parameter.value
        parameter.cancelScheduledValues(now); parameter.setValueAtTime(value, now)
      }
    }
    this.volume!.gain.setTargetAtTime(.065 * amount ** .8, now, .06)
    this.depth!.gain.setTargetAtTime(.009 * amount, now, .07)
    this.bass!.frequency.setTargetAtTime(66 + amount * 18, now, .10)
    this.overtone!.frequency.setTargetAtTime(133.5 + amount * 38, now, .10)
    this.tremolo!.frequency.setTargetAtTime(7 + amount * 5, now, .10)
  }

  summon() {
    const context = this.context
    if (!this.enabled || !context || context.state !== 'running') return
    this.stopCue()
    const now = context.currentTime + .01
    const output = context.createGain(), dry = context.createGain(), wet = context.createGain()
    const reverb = context.createConvolver(), tone = context.createBiquadFilter()
    output.gain.value = .75; dry.gain.value = .78; wet.gain.value = .52
    tone.type = 'lowpass'; tone.frequency.value = 3800
    if (!this.impulse) {
      const frames = Math.ceil(context.sampleRate * 2.2)
      this.impulse = context.createBuffer(2, frames, context.sampleRate)
      for (let channel = 0; channel < 2; channel++) {
        const samples = this.impulse.getChannelData(channel)
        for (let i = 0; i < frames; i++) {
          samples[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 3.2 * Math.min(1, i / (context.sampleRate * .008))
        }
      }
    }
    reverb.buffer = this.impulse
    dry.connect(output); reverb.connect(tone); tone.connect(wet); wet.connect(output)
    output.connect(context.destination)
    const cue: SummonCue = { output, sources: new Set(), nodes: [output, dry, wet, reverb, tone], timer: 0 }
    this.cue = cue
    const route = (source: AudioScheduledSourceNode, envelope: GainNode, start: number, duration: number) => {
      source.connect(envelope); envelope.connect(dry); envelope.connect(reverb)
      cue.nodes.push(source, envelope); cue.sources.add(source)
      source.onended = () => { source.disconnect(); cue.sources.delete(source) }
      source.start(start); source.stop(start + duration)
    }
    // A rising, lightly detuned bell arpeggio with inharmonic glass overtones.
    ;[293.665, 440, 587.33, 880, 1174.66].forEach((frequency, index) => {
      const start = now + index * .095
      for (const partial of [1, 2.756]) {
        const oscillator = context.createOscillator(), envelope = context.createGain()
        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(frequency * partial * .975, start)
        oscillator.frequency.exponentialRampToValueAtTime(frequency * partial, start + .16)
        const level = (partial === 1 ? .032 : .005) * (1 - index * .07)
        envelope.gain.setValueAtTime(.0001, start)
        envelope.gain.exponentialRampToValueAtTime(level, start + .025)
        envelope.gain.exponentialRampToValueAtTime(.0001, start + 1.25)
        route(oscillator, envelope, start, 1.3)
      }
    })
    // A soft filtered breath opens the sound without a sharp impact.
    const noise = context.createBufferSource(), breath = context.createBuffer(1, context.sampleRate, context.sampleRate)
    const samples = breath.getChannelData(0)
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1
    noise.buffer = breath
    const air = context.createBiquadFilter(), envelope = context.createGain()
    air.type = 'bandpass'; air.Q.value = .65
    air.frequency.setValueAtTime(500, now); air.frequency.exponentialRampToValueAtTime(2200, now + .65)
    envelope.gain.setValueAtTime(.0001, now)
    envelope.gain.exponentialRampToValueAtTime(.022, now + .28)
    envelope.gain.exponentialRampToValueAtTime(.0001, now + .95)
    noise.connect(air); air.connect(envelope); envelope.connect(dry); envelope.connect(reverb)
    cue.nodes.push(noise, air, envelope); cue.sources.add(noise)
    noise.onended = () => { noise.disconnect(); cue.sources.delete(noise) }
    noise.start(now); noise.stop(now + 1)
    cue.timer = window.setTimeout(() => this.disposeCue(cue), 4000)
  }

  private disposeCue(cue: SummonCue) {
    clearTimeout(cue.timer)
    for (const source of cue.sources) { try { source.stop() } catch { /* Already ended. */ } }
    cue.sources.clear()
    cue.nodes.forEach(node => node.disconnect())
    if (this.cue === cue) this.cue = undefined
  }

  private stopCue(immediate = false) {
    const cue = this.cue, context = this.context
    if (!cue || !context) return
    this.cue = undefined; clearTimeout(cue.timer)
    if (immediate) { this.disposeCue(cue); return }
    cue.output.gain.cancelScheduledValues(context.currentTime)
    cue.output.gain.setTargetAtTime(0, context.currentTime, .012)
    for (const source of cue.sources) { try { source.stop(context.currentTime + .04) } catch { /* Already ended. */ } }
    cue.timer = window.setTimeout(() => this.disposeCue(cue), 80)
  }

  silence() { this.update(0); this.stopCue() }
  suspend() {
    this.update(0); this.stopCue(true)
    this.lastEnergy = -1
    if (this.context && this.context.state !== 'closed') {
      this.volume?.gain.cancelScheduledValues(this.context.currentTime)
      this.volume?.gain.setValueAtTime(0, this.context.currentTime)
      this.depth?.gain.cancelScheduledValues(this.context.currentTime)
      this.depth?.gain.setValueAtTime(0, this.context.currentTime)
      void this.context.suspend().catch(() => {})
    }
  }
  close() { this.stopCue(true); void this.context?.close().catch(() => {}); this.context = undefined; this.impulse = undefined }
}
