/** Short, locally synthesized arcade coin/block sounds; no audio downloads. */
export class MarioSound {
  private context?: AudioContext
  private voices = new Map<OscillatorNode, GainNode>()
  enabled = true

  unlock() {
    if (!this.enabled) return
    try {
      this.context ??= new AudioContext()
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {})
    } catch { /* Visual interaction is still available without Web Audio. */ }
  }

  hit() {
    const context = this.context
    if (!this.enabled || !context || context.state !== 'running') return
    const start = context.currentTime
    for (const [offset, duration, frequency, end, volume, type] of [
      [0, .07, 170, 65, .10, 'triangle'],
      [.015, .075, 988, 988, .065, 'square'],
      [.09, .28, 1319, 1319, .055, 'square'],
    ] as const) {
      const voice = context.createOscillator(), gain = context.createGain()
      voice.type = type
      voice.frequency.setValueAtTime(frequency, start + offset)
      voice.frequency.exponentialRampToValueAtTime(end, start + offset + duration)
      gain.gain.setValueAtTime(.0001, start + offset)
      gain.gain.exponentialRampToValueAtTime(volume, start + offset + .006)
      gain.gain.exponentialRampToValueAtTime(.0001, start + offset + duration)
      voice.connect(gain); gain.connect(context.destination)
      this.voices.set(voice, gain)
      voice.onended = () => { voice.disconnect(); gain.disconnect(); this.voices.delete(voice) }
      voice.start(start + offset); voice.stop(start + offset + duration + .015)
    }
  }

  silence() {
    for (const [voice, gain] of this.voices) { voice.onended = null; voice.stop(); voice.disconnect(); gain.disconnect() }
    this.voices.clear()
    if (this.context?.state === 'running') void this.context.suspend().catch(() => {})
  }

  toggle() {
    this.enabled = !this.enabled
    if (this.enabled) this.unlock()
    else this.silence()
    return this.enabled
  }

  close() { this.silence(); if (this.context) void this.context.close().catch(() => {}) }
}
