import line1 from './assets/conan/line-1.wav'
import line2 from './assets/conan/line-2.wav'
import line3 from './assets/conan/line-3.wav'

const urls = [line1, line2, line3]
export const narrationCues = [450, 3300, 5900] as const

/** Original Korean system-voice recording; no actor voice or broadcast audio. */
export class ConanNarration {
  enabled = true
  private context?: AudioContext
  private buffers?: AudioBuffer[]
  private loading?: Promise<void>
  private nodes = new Map<AudioScheduledSourceNode, AudioNode[]>()
  private generation = 0

  unlock() {
    if (!this.enabled) return
    try {
      this.context ??= new AudioContext()
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {})
      void this.load().catch(() => {})
    } catch { /* Captions remain available if audio is blocked. */ }
  }

  private load() {
    if (this.loading) return this.loading
    const context = this.context
    if (!context) return Promise.resolve()
    this.loading = Promise.all(urls.map(async url => {
      const response = await fetch(url)
      if (!response.ok) throw new Error('Narration unavailable')
      return context.decodeAudioData(await response.arrayBuffer())
    })).then(buffers => { this.buffers = buffers })
      .catch(error => { this.loading = undefined; throw error })
    return this.loading
  }

  private register(source: AudioScheduledSourceNode, nodes: AudioNode[]) {
    this.nodes.set(source, nodes)
    source.onended = () => { source.disconnect(); nodes.forEach(node => node.disconnect()); this.nodes.delete(source) }
  }

  play(startedAt: number) {
    this.stop()
    if (!this.enabled) return
    const context = this.context, generation = this.generation
    if (!context || context.state !== 'running') return
    this.crack(context)
    void this.load().then(() => {
      if (generation !== this.generation || !this.enabled || context.state !== 'running') return
      const elapsed = (performance.now() - startedAt) / 1000
      this.buffers?.forEach((buffer, index) => {
        const offset = narrationCues[index]! / 1000 - elapsed
        if (offset + buffer.duration <= 0) return
        const voice = context.createBufferSource(), gain = context.createGain()
        voice.buffer = buffer; gain.gain.value = .88
        voice.connect(gain); gain.connect(context.destination); this.register(voice, [gain])
        voice.start(context.currentTime + Math.max(.02, offset), Math.max(0, -offset))
      })
    }).catch(() => {})
  }

  private crack(context: AudioContext) {
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * .23), context.sampleRate)
    const samples = buffer.getChannelData(0)
    for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * (1 - i / samples.length) ** 2
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain()
    source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = 2300
    gain.gain.setValueAtTime(.12, context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .23)
    source.connect(filter); filter.connect(gain); gain.connect(context.destination)
    this.register(source, [filter, gain]); source.start()
  }

  stop() {
    this.generation++
    for (const [source, nodes] of this.nodes) {
      source.onended = null; source.stop(); source.disconnect(); nodes.forEach(node => node.disconnect())
    }
    this.nodes.clear()
  }

  silence() { this.stop(); if (this.context?.state === 'running') void this.context.suspend().catch(() => {}) }
  toggle() { this.enabled = !this.enabled; if (this.enabled) this.unlock(); else this.silence(); return this.enabled }
  close() { this.silence(); this.buffers = undefined; if (this.context) void this.context.close().catch(() => {}) }
}
