// Keep the original 60 Hz animation speed on 90/120/144/240 Hz displays.
// Hidden documents have no scheduled work; resuming never catches up a backlog.
export class FrameLoop {
  private raf = 0
  private nextFrame = 0
  private disposed = false
  private running = false
  private readonly render: (now: number) => void

  constructor(render: (now: number) => void, autoStart = true) {
    this.render = render
    document.addEventListener('visibilitychange', this.visibility)
    if (autoStart) this.start()
  }

  private tick = (now: number) => {
    this.raf = 0
    if (this.disposed || !this.running || document.hidden) return
    if (now >= this.nextFrame - .5) {
      this.nextFrame = now - this.nextFrame > 1000 / 60 ? now + 1000 / 60 : this.nextFrame + 1000 / 60
      this.render(now)
    }
    if (!this.disposed && this.running && !this.raf && !document.hidden) this.raf = requestAnimationFrame(this.tick)
  }

  private visibility = () => {
    cancelAnimationFrame(this.raf); this.raf = 0
    if (this.running && !document.hidden) this.start()
  }

  start() {
    if (this.disposed) return
    this.running = true
    if (this.raf || document.hidden) return
    this.nextFrame = 0
    this.raf = requestAnimationFrame(this.tick)
  }

  pause() {
    this.running = false
    cancelAnimationFrame(this.raf); this.raf = 0
  }

  close() {
    this.disposed = true; this.pause()
    document.removeEventListener('visibilitychange', this.visibility)
  }
}
