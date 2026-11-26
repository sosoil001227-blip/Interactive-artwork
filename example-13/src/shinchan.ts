import { clamp, ease } from './geometry.ts'
import { sampleFrame } from './rig.ts'
import type { TrackingFrame } from './tracking.ts'
import { crayonColors, fromPaintSpace, paintAnchors, paintParts, ShinchanGesture, shinchanLayout, shinchanOfferMs, shinchanStage } from './shinchanGesture.ts'
import type { CrayonTool, PaintSpace, PaintTarget, Point, ShinchanStatus } from './shinchanGesture.ts'
import { drawCrayon, drawShinchan, drawSpeech } from './shinchanCharacter.ts'
import { projectedFaceOutline } from './conanFit.ts'
import { PersonLayers, restoreTrackedHands } from './personLayers.ts'
import type { CameraLayer } from './personLayers.ts'

interface CameraImage extends CameraLayer { width: number; height: number; timestamp?: number }
function transform(c: CanvasRenderingContext2D, s: PaintSpace) {
  c.transform(s.across.x, s.across.y, s.down.x, s.down.y, s.origin.x, s.origin.y)
}
function partPath(c: CanvasRenderingContext2D, target: PaintTarget) {
  c.beginPath()
  target.outline.forEach((p, i) => {
    const x = (p.x - target.x) / target.rx, y = (p.y - target.y) / target.ry
    if (i === 0) c.moveTo(x, y)
    else c.lineTo(x, y)
  })
  c.closePath()
}

function drawPaint(c: CanvasRenderingContext2D, anchors: ReturnType<typeof paintAnchors>, gesture: ShinchanGesture, guides: boolean, onlyShirt?: boolean) {
  const ordered = [...anchors.targets].sort((a, b) => Number(a.id !== 'shirt') - Number(b.id !== 'shirt'))
  for (const target of ordered) {
    if (onlyShirt !== undefined && (target.id === 'shirt') !== onlyShirt) continue
    const basis = target.id === 'shirt' ? anchors.body : anchors.face
    if (!basis) continue
    const progress = gesture.progress[target.id]
    c.save(); transform(c, basis); c.translate(target.x, target.y); c.scale(target.rx, target.ry)
    c.lineJoin = 'round'
    partPath(c, target)
    if (guides && progress < 1) {
      const isActive = target.tool === gesture.tool
      c.fillStyle = `${crayonColors[target.tool]}${isActive ? '25' : '13'}`; c.fill()
      c.strokeStyle = target.tool === gesture.tool ? '#fff5c6c4' : '#fff4ce60'
      c.lineWidth = target.tool === 'ink' ? .035 : .016; c.setLineDash([.11, .08]); c.stroke(); c.setLineDash([])
    }
    if (progress > 0) {
      c.save(); c.clip()
      const edges = target.outline.map(p => (p.x - target.x) / target.rx)
      const left = Math.min(...edges), right = Math.max(...edges)
      c.beginPath(); c.rect(left, -1, (right - left) * progress, 2); c.clip()
      c.fillStyle = crayonColors[target.tool]; c.fillRect(left, -1, right - left, 2)
      if (target.id === 'face') {
        partPath(c, target); c.strokeStyle = '#472717'; c.lineWidth = .035; c.stroke()
        c.beginPath(); c.ellipse(-.65, .23, .19, .091, -.24, 0, Math.PI * 2)
        c.fillStyle = '#e2977755'; c.fill()
        c.beginPath(); c.moveTo(.82, -.035); c.quadraticCurveTo(.92, -.15, .93, .04)
        c.lineWidth = .018; c.lineCap = 'round'; c.strokeStyle = '#9651379e'; c.stroke()
      } else if (target.id === 'hair') {
        c.beginPath(); c.moveTo(-.66, -.59); c.quadraticCurveTo(-.10, -.96, .59, -.59)
        c.strokeStyle = '#75534969'; c.lineWidth = .047; c.lineCap = 'round'; c.stroke()
      } else if (target.id.startsWith('eye')) {
        c.beginPath(); c.ellipse(.13, -.20, .35, .36, 0, 0, Math.PI * 2); c.fillStyle = '#fffef4'; c.fill()
      } else if (target.id === 'mouth') {
        c.beginPath(); c.ellipse(.01, -.025, .87, .87, -.2, 0, Math.PI * 2); c.fillStyle = '#a5444b'; c.fill()
        c.beginPath(); c.ellipse(.25, .30, .54, .49, -.5, 0, Math.PI * 2); c.fillStyle = '#cf7571'; c.fill()
      } else if (target.id === 'shirt') {
        partPath(c, target); c.strokeStyle = '#271d18'; c.lineWidth = .027; c.stroke()
        c.strokeStyle = '#fff9d323'; c.lineWidth = .015
        for (let i = 0; i < 22; i++) { const y = -1.2 + i * .11; c.beginPath(); c.moveTo(-1.3, y); c.lineTo(1.3, y + .25); c.stroke() }
      }
      c.restore()
    }
    c.restore()
  }
}

function previewFrame(): TrackingFrame {
  const body = Array.from({ length: 33 }, () => ({ x: .5, y: .5, z: 0, visibility: 1 }))
  for (const [i, x, y] of [[11, .72, .44], [12, .28, .44], [23, .66, .71], [24, .34, .71]]) body[i!] = { x: x!, y: y!, z: 0, visibility: 1 }
  return { timestamp: 0, width: 720, height: 900, body, bodyTracking: 'ready',
    face: sampleFrame.face.map(p => ({ x: .5 + (p.x - .5) * .66, y: .245 + (p.y - .5) * .43, z: p.z * .66 })) }
}

export class ShinchanWorld {
  readonly gesture = new ShinchanGesture()
  private frame?: TrackingFrame
  private anchors?: ReturnType<typeof paintAnchors>
  private received = -Infinity
  private clock = 0
  private lastTick?: number
  private demonstrating = false
  private active = false
  private layers = new PersonLayers()
  private sample = previewFrame()
  private sampleAnchors = paintAnchors(this.sample)
  guides = true

  reset() {
    this.gesture.reset(); this.frame = this.anchors = undefined; this.received = -Infinity
    this.layers.reset()
    this.clock = 0; this.lastTick = undefined; this.demonstrating = false; this.active = false
  }
  clearTracking() { this.gesture.clearTracking(); this.layers.reset(); this.frame = this.anchors = undefined; this.received = -Infinity; this.lastTick = undefined }
  selectTool(tool: CrayonTool) { this.gesture.select(tool) }
  clearDrawing() { this.gesture.clearDrawing() }
  demo() { this.reset(); this.demonstrating = true }

  update(frame: TrackingFrame, now: number) {
    this.frame = frame; this.received = now
    this.anchors = paintAnchors(frame)
    this.gesture.update(frame, now, this.clock >= shinchanOfferMs, this.anchors)
  }

  status(now: number): ShinchanStatus {
    const anchors = this.demonstrating ? this.sampleAnchors : now - this.received < 390 ? this.anchors : undefined
    return { stage: this.active ? shinchanStage(this.clock, this.gesture.holding) : 'offering',
      tool: this.gesture.tool, holding: this.gesture.holding, drawing: this.gesture.drawing && this.gesture.fresh(now),
      hands: this.gesture.fresh(now) ? this.gesture.hands : 0, painted: paintParts.filter(p => this.gesture.progress[p] >= 1).length,
      face: !!anchors?.face, body: this.frame?.bodyTracking === 'unavailable' ? 'unavailable'
        : anchors?.body ? 'ready' : this.frame?.bodyTracking === 'ready' ? 'missing' : 'loading' }
  }

  draw(c: CanvasRenderingContext2D, now: number, w: number, h: number, reduced: boolean, preview: boolean, camera?: CameraImage) {
    this.active = !preview || this.demonstrating
    if (this.active) {
      if (this.lastTick !== undefined) this.clock += Math.min(80, Math.max(0, now - this.lastTick))
      if (reduced) this.clock = Math.max(this.clock, shinchanOfferMs)
    }
    this.lastTick = now
    const demo = preview && this.demonstrating
    if (demo && this.clock >= shinchanOfferMs + 700) {
      this.gesture.holding = true
      paintParts.forEach((part, i) => { this.gesture.progress[part] = clamp((this.clock - shinchanOfferMs - 1200 - i * 850) / 750) })
      this.gesture.tool = this.demoTarget()?.tool ?? 'peach'
    }
    const aligned = camera?.timestamp !== undefined && camera.timestamp === this.frame?.timestamp && now - this.received < 390
    const frame = preview ? this.sample : aligned ? this.frame : undefined
    const anchors = preview ? this.sampleAnchors : frame ? this.anchors : undefined
    const width = frame?.width ?? camera?.width ?? 720, height = frame?.height ?? camera?.height ?? 900
    const rect = camera?.rect ?? { x: 0, y: 0, width: w, height: h }
    c.save(); c.beginPath(); c.rect(rect.x, rect.y, rect.width, rect.height); c.clip()
    const scaleX = rect.width / width, scaleY = rect.height / height
    const project = (p: { x: number; y: number; z: number }) => ({
      x: rect.x + (width - p.x) * scaleX, y: rect.y + p.y * scaleY, z: p.z * scaleX,
    })
    if (anchors && anchors.body && !preview && frame && camera && this.gesture.holding) {
      this.layers.prepare(frame, camera, w, h)
      const state = `${this.gesture.progress.shirt}:${this.gesture.tool}:${this.guides}`
      this.layers.garment(c, camera, w, h, projectedFaceOutline(frame, project), state, layer => {
        layer.save(); layer.translate(rect.x, rect.y); layer.scale(scaleX, scaleY)
        drawPaint(layer, anchors, this.gesture, this.guides, true)
        layer.restore()
      })
    }
    c.save(); c.translate(rect.x, rect.y); c.scale(scaleX, scaleY)
    if (preview) this.mannequin(c)
    if (anchors && (this.gesture.holding || preview)) drawPaint(c, anchors, this.gesture, this.guides, preview ? undefined : false)
    c.restore()
    if (!preview && frame && camera) restoreTrackedHands(c, frame, project, camera)
    c.translate(rect.x, rect.y); c.scale(scaleX, scaleY)
    const stage = this.active ? shinchanStage(this.clock, this.gesture.holding) : 'offering'
    if (this.active && !this.gesture.holding && this.clock > 1000 && this.clock < shinchanOfferMs) this.peel(c, width, height, reduced)
    const layout = shinchanLayout(width, height)
    const entrance = this.active ? ease(this.clock / 1000) : 1
    const travel = stage === 'drawing' && !reduced ? (Math.sin(this.clock / 1350) + 1) / 2 * width * .19 : 0
    const x = layout.x - (1 - entrance) * 205 * layout.scale + travel
    drawShinchan(c, x, layout.y, layout.scale, this.active ? this.clock : shinchanOfferMs, stage, reduced)
    if (stage === 'offering') {
      const label = !this.active ? '크레용으로 놀자!' : '찾았다! 손을 내밀어 봐!'
      drawSpeech(c, label, Math.max(width * .16, layout.x + 104 * layout.scale), layout.y - 35 * layout.scale, width * .36)
      if (!preview && this.clock >= shinchanOfferMs) {
        c.save(); c.strokeStyle = '#fff8c6'; c.lineWidth = Math.max(1.3, width / 500)
        c.setLineDash([4, 5]); c.beginPath(); c.arc(layout.pickup.x, layout.pickup.y, layout.radius * (reduced ? 1 : 1 + Math.sin(this.clock / 270) * .07), 0, Math.PI * 2); c.stroke(); c.restore()
      }
    } else if (stage === 'searching') drawSpeech(c, '어디 있더라…?', layout.x + 110 * layout.scale, layout.y - 25 * layout.scale, width * .28)
    else if (stage === 'drawing') drawSpeech(c, '흔들흔들~ ♪', x + 100 * layout.scale, layout.y + 70 * layout.scale, width * .24)
    const cursor = !preview && this.gesture.fresh(now) ? this.gesture.cursor : demo && this.gesture.holding ? this.demoCursor() : undefined
    if (cursor) {
      const drawing = demo || this.gesture.drawing
      c.save(); c.strokeStyle = drawing ? crayonColors[this.gesture.tool] : '#fff7d6'; c.lineWidth = Math.max(1.6, width / 450)
      c.beginPath(); c.arc(cursor.x, cursor.y, drawing ? 7 : 12, 0, Math.PI * 2); c.stroke()
      const scale = Math.max(.42, width / 1100)
      c.translate(cursor.x, cursor.y); c.rotate(.32); drawCrayon(c, 0, 65 * scale, scale, 0, crayonColors[this.gesture.tool]); c.restore()
    }
    if (preview && !this.demonstrating) {
      c.save(); c.fillStyle = '#fff6d5c9'; c.textAlign = 'center'; c.font = '600 18px system-ui,sans-serif'
      c.fillText('카메라를 켜고 짱구의 크레용을 받아 보세요', width * .54, height * .93, width * .80); c.restore()
    }
    c.restore()
  }

  private mannequin(c: CanvasRenderingContext2D) {
    c.save(); c.strokeStyle = '#fff1c347'; c.fillStyle = '#f7dfba12'; c.lineWidth = 2
    c.beginPath(); c.moveTo(300, 310); c.lineTo(300, 360); c.moveTo(420, 310); c.lineTo(420, 360); c.stroke()
    c.restore()
  }

  private peel(c: CanvasRenderingContext2D, width: number, height: number, reduced: boolean) {
    const open = reduced ? 1 : ease((this.clock - 1000) / 1400) * (1 - ease((this.clock - 4650) / 950))
    const size = Math.min(width * .32, height * .40) * open
    if (size < 1) return
    c.save(); c.translate(0, height)
    // The original camera corner is covered by the paper's hidden reverse side.
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -size); c.quadraticCurveTo(size * .25, -size * .35, size, 0); c.closePath()
    const back = c.createLinearGradient(0, -size, size, 0); back.addColorStop(0, '#9a6a4c'); back.addColorStop(.5, '#d9bb85'); back.addColorStop(1, '#ffe9b3')
    c.fillStyle = back; c.fill(); c.strokeStyle = '#ebd3a1'; c.lineWidth = 1.5; c.stroke()
    if (this.clock < 4300) drawCrayon(c, size * .30, -size * .19, size / 180, .85)
    // A curled triangular flap with a bright reverse and a shadow along its fold.
    c.beginPath(); c.moveTo(0, -size); c.quadraticCurveTo(size * .17, -size * .18, size, 0)
    c.quadraticCurveTo(size * .78, -size * .53, size * .80, -size * .84)
    c.quadraticCurveTo(size * .40, -size * .92, 0, -size); c.closePath()
    const paper = c.createLinearGradient(0, -size, size, -size * .10)
    paper.addColorStop(0, '#fff6d7'); paper.addColorStop(.43, '#fffef0'); paper.addColorStop(.80, '#c3ae8a'); paper.addColorStop(1, '#806d57')
    c.fillStyle = paper; c.shadowColor = '#1d111b88'; c.shadowBlur = 13; c.shadowOffsetY = 4; c.fill()
    c.shadowBlur = 0; c.shadowOffsetY = 0; c.strokeStyle = '#f8e9c7'; c.lineWidth = 1.5; c.stroke(); c.restore()
  }

  private demoTarget() {
    const index = clamp(Math.floor((this.clock - shinchanOfferMs - 1200) / 850), 0, paintParts.length - 1)
    return this.sampleAnchors.targets.find(t => t.id === paintParts[index])
  }

  private demoCursor(): Point | undefined {
    const target = this.demoTarget()
    if (!target) return
    const space = target.id === 'shirt' ? this.sampleAnchors.body! : this.sampleAnchors.face!
    const hair = target.id === 'hair'
    const x = target.x + Math.sin(this.clock / 160) * target.rx * (hair ? .42 : .58)
    const y = hair ? target.y - target.ry * .74 : target.y
    return fromPaintSpace({ x, y }, space)
  }
}
