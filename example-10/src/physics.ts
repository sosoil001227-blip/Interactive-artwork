export type Treat = {
  x: number; y: number; vx: number; vy: number; size: number
  rotation: number; spin: number; life: number; maxLife: number
  squash: number; bounces: number; orbit: boolean; angle: number; sprite: number
}
export type Attractor = { x: number; y: number; radiusX: number; radiusY: number }

// Small fixed substeps keep floor collisions stable when an inference or a
// slow display delays a frame. Coordinates and velocities use CSS pixels.
export function advanceTreat(body: Treat, elapsed: number, width: number, height: number, hole?: Attractor) {
  let remaining = Math.max(0, Math.min(.05, elapsed))
  while (remaining > .000001) {
    const dt = Math.min(remaining, 1 / 120); remaining -= dt
    const radius = body.size * .42
    if (body.orbit && hole) {
      body.angle += dt * .85
      const targetX = hole.x + Math.cos(body.angle) * (hole.radiusX + body.size * 1.8)
      const targetY = hole.y + Math.sin(body.angle) * (hole.radiusY + body.size)
      body.vx += ((targetX - body.x) * 9 - body.vx * 4) * dt
      body.vy += ((targetY - body.y) * 9 - body.vy * 4) * dt
    } else body.vy += 540 * dt
    body.x += body.vx * dt; body.y += body.vy * dt
    if (width > radius * 2 && (body.x < radius || body.x > width - radius)) {
      body.x = Math.max(radius, Math.min(width - radius, body.x)); body.vx *= -.72
    }
    const floor = height - 24 - radius
    if ((!body.orbit || !hole) && body.bounces < 3 && body.y > floor && body.vy > 0) {
      body.y = floor; body.vy *= -.69; body.vx *= .83
      body.squash = Math.min(.42, Math.abs(body.vy) / 1200); body.bounces++
    }
    body.squash *= Math.exp(-dt * 10)
    body.rotation += body.spin * dt
    body.life -= dt
  }
}
