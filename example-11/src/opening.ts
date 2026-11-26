const clamp = (value: number) => Math.max(0, Math.min(1, value))
const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t) }

export function openingAt(elapsed: number, reducedMotion = false) {
  const factor = reducedMotion ? .45 : 1, t = Math.max(0, elapsed) / factor
  const applauseAt = 2100 * factor
  return {
    sign: smooth(t / 900), curtain: smooth((t - 180) / 2100),
    audience: smooth((elapsed - applauseAt) / (500 * factor)) * (1 - smooth((elapsed - applauseAt - 3700) / 900)),
    ovation: elapsed >= applauseAt, musicReady: elapsed >= applauseAt + 4600,
    spotlight: smooth((t - 2550) / 1000), puppet: smooth((t - 2800) / 800), ready: t >= 3650,
  }
}
