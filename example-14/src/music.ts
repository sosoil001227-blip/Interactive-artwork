import track from './assets/chrome-steps.wav?url'

export class DiscPlayer {
  private context?: AudioContext
  private output?: GainNode
  private analyser?: AnalyserNode
  private bands = new Uint8Array(32)
  private buffer?: Promise<AudioBuffer>
  private source?: AudioBufferSourceNode
  private origin = 0
  private ticket = 0
  private level = .68
  private muted = false

  get clock() { return this.context && this.source ? (this.context.currentTime - this.origin) * 1_000 : 0 }

  async start() {
    this.stop()
    const ticket = this.ticket
    const browser = window as Window & { webkitAudioContext?: typeof AudioContext }
    const Context = window.AudioContext ?? browser.webkitAudioContext
    if (!Context) throw new Error('이 브라우저에서 CD를 재생할 수 없어요.')
    const context = this.context ??= new Context()
    if (!this.output) {
      this.output = context.createGain()
      this.output.connect(context.destination)
      this.analyser = context.createAnalyser()
      this.analyser.fftSize = 64
      this.analyser.smoothingTimeConstant = .7
      this.analyser.connect(this.output)
      this.volume(this.level, this.muted)
    }
    const resume = context.resume()
    this.buffer ??= fetch(track).then(response => {
      if (!response.ok) throw new Error('CD 음원을 읽지 못했어요.')
      return response.arrayBuffer()
    }).then(data => context.decodeAudioData(data)).catch(reason => {
      this.buffer = undefined
      throw reason
    })
    const [, audio] = await Promise.all([resume, this.buffer])
    if (ticket !== this.ticket) return false
    const source = context.createBufferSource()
    source.buffer = audio
    source.connect(this.analyser!)
    this.origin = context.currentTime + .04
    source.start(this.origin)
    this.source = source
    return true
  }

  volume(level: number, muted: boolean) {
    this.level = level
    this.muted = muted
    if (this.context && this.output) {
      this.output.gain.setTargetAtTime(muted ? 0 : level, this.context.currentTime, .018)
    }
  }

  spectrum() {
    this.analyser?.getByteFrequencyData(this.bands)
    return this.bands
  }

  stop() {
    this.ticket++
    if (!this.source) return
    this.source.stop()
    this.source.disconnect()
    this.source = undefined
  }

  close() { this.stop(); void this.context?.close() }
}
