export class JellySound {
  enabled = true
  private context: AudioContext | undefined
  private voices = new Map<OscillatorNode, GainNode>()

  async start() {
    if (!this.enabled) return
    this.context ??= new AudioContext()
    if (this.context.state === 'suspended') await this.context.resume()
  }

  play(kind: 'open' | 'burst' | 'pop') {
    const context = this.context
    if (!this.enabled || !context || context.state !== 'running') return
    const frequencies = kind === 'burst' ? [523.25, 659.25, 783.99, 1046.5] : kind === 'open' ? [220, 440] : [780]
    frequencies.forEach((frequency, index) => {
      const oscillator = context.createOscillator(), volume = context.createGain()
      const start = context.currentTime + index * .065, duration = kind === 'pop' ? .14 : .18
      oscillator.type = 'triangle'
      oscillator.frequency.setValueAtTime(frequency, start)
      oscillator.frequency.exponentialRampToValueAtTime(kind === 'pop' ? 150 : frequency * 1.7, start + duration)
      volume.gain.setValueAtTime(.0001, start)
      volume.gain.exponentialRampToValueAtTime(.035, start + .012)
      volume.gain.exponentialRampToValueAtTime(.0001, start + duration)
      oscillator.connect(volume); volume.connect(context.destination)
      this.voices.set(oscillator, volume)
      oscillator.onended = () => { oscillator.disconnect(); volume.disconnect(); this.voices.delete(oscillator) }
      oscillator.start(start); oscillator.stop(start + duration + .02)
    })
  }

  suspend() {
    for (const [oscillator, volume] of this.voices) {
      oscillator.onended = null
      try { oscillator.stop() } catch { /* Already ended. */ }
      oscillator.disconnect(); volume.disconnect()
    }
    this.voices.clear()
    if (this.context?.state === 'running') void this.context.suspend().catch(() => {})
  }

  close() { this.suspend(); void this.context?.close().catch(() => {}); this.context = undefined }
}
