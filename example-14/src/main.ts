import { element, setText } from '../../shared/dom.ts'
import { FrameLoop } from '../../shared/frame-loop.ts'
import { characters } from './avatar.ts'
import type { Character } from './avatar.ts'
import { DanceCamera } from './camera.ts'
import { DancerMotion } from './dancer.ts'
import { assignPoses, beatMs, DanceTracker, symbols } from './dance.ts'
import type { Direction, PlayerCount, Step, Tracking } from './dance.ts'
import { SwingEffect } from './gesture.ts'
import { DiscPlayer } from './music.ts'
import type { PoseFrame } from './pose.ts'
import { duration, leadIn, Round } from './round.ts'
import { DanceStage } from './stage.ts'
import type { Screen } from './stage.ts'
import './style.css'

type Phase = 'ready' | 'loading' | 'playing' | 'results'
const video = element<HTMLVideoElement>('camera')
const cameraButton = element<HTMLButtonElement>('camera-toggle')
const demoButton = element<HTMLButtonElement>('demo-toggle')
const startButton = element<HTMLButtonElement>('start-round')
const stopButton = element<HTMLButtonElement>('stop-round')
const chooseButton = element<HTMLButtonElement>('choose')
const backButton = element<HTMLButtonElement>('back')
const resetButton = element<HTMLButtonElement>('reset')
const enterButton = element<HTMLButtonElement>('enter-arena')
const muteButton = element<HTMLButtonElement>('mute')
const volume = element<HTMLInputElement>('volume')
const progress = element<HTMLProgressElement>('disc-progress')
progress.max = duration
const permission = element('permission')
const cabinet = element('cabinet'), surface = element('stage')
const entry = element('entry')
const field = element('field'), fieldStatus = element('field-status'), fieldMessage = element('field-message')
const fieldControls = element('field-controls'), fieldStandby = element('field-standby')
const footReadouts = element('foot-readouts')
const fieldToggle = element<HTMLButtonElement>('field-toggle'), fieldSurface = element<HTMLCanvasElement>('field-surface')
const error = element('error'), hint = element('hint')
const score = element('scoreboard'), cd = element('cd-player')
const arenaBanner = element('arena-banner'), arenaMode = element('arena-mode')
const arenaStatus = element('arena-status'), beatLamps = element('beat-lamps')
const discState = element('disc-state'), discTime = element('disc-time')
const spectrum = element('disc-spectrum')
const bands = Array.from({ length: 14 }, () => {
  const bar = document.createElement('i')
  spectrum.append(bar)
  return bar
})
const selection = element('selection'), roster = element('roster'), playerPick = element('player-pick')
const modePick = element('mode-picker')
const reduced = matchMedia('(prefers-reduced-motion: reduce)')
const stage = new DanceStage(element<HTMLCanvasElement>('surface'), fieldSurface, cd)
const music = new DiscPlayer()
const swing = new SwingEffect()

class Player {
  readonly tracker = new DanceTracker()
  readonly motion = new DancerMotion()
  look: Character
  track?: Tracking
  lastStep?: Step
  round?: Round
  demoNote = 0
  constructor(index: number) { this.look = characters[index]! }
  reset() { this.tracker.reset(); this.motion.clear(); this.track = this.lastStep = undefined }
}

const allPlayers = [new Player(0), new Player(1)]
let players = allPlayers.slice(0, 1), count: PlayerCount = 1, focusSlot = 0
let screen: Screen = 'home', phase: Phase = 'ready', demo = false
let workerReady = false, freshAt = -Infinity, lampUntil = -Infinity
let epoch = 0, muted = false, styledFeed = false
let entryUntil = -Infinity
const samples: HTMLCanvasElement[] = []

for (const look of characters) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'character'
  button.style.setProperty('--character', look.color)
  button.dataset.look = look.name
  button.setAttribute('aria-pressed', 'false')
  button.innerHTML = `<canvas width="120" height="144" aria-hidden="true"></canvas><strong>${look.name}</strong><small>${look.label}</small>`
  samples.push(button.querySelector('canvas')!)
  button.addEventListener('click', () => {
    players[focusSlot]!.look = look
    updatePick()
  })
  roster.append(button)
}
stage.drawSamples(samples)

const panels = allPlayers.map((_, index) => {
  const panel = document.createElement('article')
  panel.className = 'score-card'
  panel.innerHTML = `
    <div class="score-header"><b>P${index + 1}</b><span class="score-name"></span>
      <progress max="1" value=".67" aria-label="P${index + 1} 에너지"></progress>
    </div>
    <div class="judgement" hidden><strong></strong><div class="combo-count"><b></b><span>COMBO</span></div></div>
    <div class="score-ribbon"><span>P${index + 1} SCORE</span><strong class="score-value"></strong></div>
    <div class="result" hidden><strong>ROUND END</strong><dl></dl></div>`
  const [value, name, energy, judgement, result, stats] = [
    panel.querySelector<HTMLElement>('.score-value')!,
    panel.querySelector<HTMLElement>('.score-name')!,
    panel.querySelector<HTMLProgressElement>('progress')!,
    panel.querySelector<HTMLElement>('.judgement')!,
    panel.querySelector<HTMLElement>('.result')!,
    panel.querySelector<HTMLElement>('.result dl')!,
  ] as const
  const grade = judgement.querySelector('strong')!, combo = judgement.querySelector<HTMLElement>('.combo-count b')!
  const comboLabel = judgement.querySelector<HTMLElement>('.combo-count')!
  stats.innerHTML = '<div><dt>PERFECT</dt><dd></dd></div><div><dt>GREAT</dt><dd></dd></div><div><dt>BAD</dt><dd></dd></div><div><dt>BEST COMBO</dt><dd></dd></div>'
  const totals = [...stats.querySelectorAll('dd')]
  score.append(panel)
  return { panel, value, name, energy, judgement, result, totals, grade, combo, comboLabel }
})

const directionName: Record<Direction, string> = { left: '왼쪽', up: '뒤쪽', down: '카메라 쪽', right: '오른쪽' }
const footsteps = allPlayers.map((_, index) => {
  const row = document.createElement('div')
  row.className = 'foot-readout'
  row.innerHTML = `<b>P${index + 1}</b><span></span><strong></strong>`
  footReadouts.append(row)
  return { row, status: row.querySelector('span')!, input: row.querySelector('strong')! }
})

function updatePick() {
  for (const button of modePick.querySelectorAll('button')) button.setAttribute('aria-pressed', String(Number(button.dataset.count) === count))
  for (const button of playerPick.querySelectorAll('button')) button.setAttribute('aria-pressed', String(Number(button.dataset.slot) === focusSlot))
  for (const button of roster.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.look === players[focusSlot]!.look.name))
  playerPick.hidden = count === 1
}

function show(next: Screen) {
  screen = next
  const home = next === 'home', connecting = next === 'connecting'
  const picking = next === 'select', arena = next === 'arena'
  const open = !home && !connecting
  cabinet.dataset.screen = next
  surface.dataset.screen = next
  surface.dataset.count = String(count); score.dataset.count = String(count)
  if (!arena) {
    entry.hidden = true
    swing.reset()
  }
  updateField()
  permission.hidden = !connecting
  selection.hidden = !picking
  score.hidden = !arena
  arenaBanner.hidden = !arena
  setText(arenaMode, `${count}P MODE`)
  cd.hidden = !arena
  cameraButton.classList.toggle('primary', home || connecting)
  demoButton.hidden = !home
  chooseButton.hidden = next !== 'camera'
  backButton.hidden = !arena && (!picking || demo)
  modePick.hidden = next !== 'camera' && !picking
  setText(cameraButton, home ? '카메라 켜기' : connecting ? '연결 취소' : demo ? '시연 끝내기' : '카메라 끄기')
  setText(backButton, arena ? '캐릭터 다시 고르기' : '카메라 미리보기')
  updatePick()
  if (open) loop.start()
  else loop.pause()
  report(0)
}

function updateField() {
  const arena = screen === 'arena'
  const guide = screen === 'camera'
  const preview = screen === 'select'
  const live = (arena || guide || preview) && !demo
  const connecting = screen === 'connecting'
  const simulation = demo && (arena || preview)
  const showStyle = arena && live && styledFeed
  field.dataset.state = live ? 'live' : connecting ? 'connecting' : simulation ? 'demo' : 'standby'
  field.dataset.styled = String(showStyle)
  fieldStandby.hidden = live
  fieldSurface.hidden = !live
  footReadouts.hidden = !live
  fieldControls.hidden = !arena || !live
  fieldToggle.setAttribute('aria-pressed', String(live && styledFeed))
  setText(fieldToggle, live && styledFeed ? '원본 영상 보기' : '캐릭터 스타일 보기')
  setText(fieldStatus, live ? 'LIVE' : simulation ? '시연' : connecting ? '연결 중' : '대기')
  setText(fieldMessage, simulation ? '카메라 없이 DDR 무대를 시연 중이에요.'
    : connecting ? '브라우저의 카메라 권한을 확인해 주세요.' : '카메라를 켜면 이곳에 실제 공간이 보여요.')
}

function resetTracking() {
  camera.invalidate()
  allPlayers.forEach(player => player.reset())
  swing.reset()
  freshAt = -Infinity
}

function resetRound() {
  epoch++
  music.stop()
  phase = 'ready'
  cabinet.dataset.step = ''
  allPlayers.forEach(player => { player.round = undefined; player.demoNote = 0 })
}

function goHome() {
  resetRound()
  camera.close()
  resetTracking()
  workerReady = false
  demo = false
  styledFeed = false
  show('home')
}

function receive(frame: PoseFrame) {
  const { at, landmarks } = frame
  const now = performance.now()
  const aspect = video.videoWidth / video.videoHeight / count
  if (!Number.isFinite(aspect) || aspect <= 0) return
  freshAt = now
  const poses = assignPoses(landmarks, count)
  const clock = music.clock
  players.forEach((player, i) => {
    const pose = poses[i]!
    player.motion.update(pose, aspect, at)
    player.track = player.tracker.update(pose, at, aspect)
    for (const step of player.track.steps.sort((a, b) => a.at - b.at)) {
      showStep(player, step.direction, now)
      if (phase === 'playing') player.round?.hit({ direction: step.direction, at: clock - (now - step.at) }, clock)
    }
  })
  if (screen === 'arena' && entry.hidden) swing.update(frame, poses, aspect, now)
}

const camera = new DanceCamera(video, {
  preview() { show('camera'); chooseButton.focus() },
  ready() { workerReady = true },
  frame: receive,
  error(message) { goHome(); setText(error, message); error.hidden = false },
})

function showStep(player: Player, direction: Direction, now: number) {
  player.lastStep = { direction, at: now }
  cabinet.dataset.step = direction
  lampUntil = now + 250
}

function readyToPlay() { return demo || players.every(player => player.track?.floor) }

async function startRound() {
  if (screen !== 'arena' || !entry.hidden || !readyToPlay() || phase === 'loading' || phase === 'playing') return
  resetRound()
  error.hidden = true
  phase = 'loading'
  report(0)
  const attempt = epoch
  try {
    if (!await music.start() || epoch !== attempt) return
    players.forEach((player, i) => { player.round = new Round(i) })
    phase = 'playing'
  } catch {
    if (epoch !== attempt) return
    resetRound()
    setText(error, 'CD를 재생하지 못했어요. 게임 시작을 다시 눌러 주세요.')
    error.hidden = false
    report(0)
  }
}

const timecode = (ms: number) => `0:${String(Math.floor(ms / 1_000)).padStart(2, '0')}`

function reportFeet(now: number) {
  if (footReadouts.hidden) return
  footsteps.forEach(({ row, status, input }, i) => {
    const player = players[i]
    row.hidden = !player
    if (!player) return
    const track = player.track, observed = track?.feet.length ?? 0
    const tiles = [...new Set(track?.feet.flatMap(foot => foot.tile ? [foot.tile] : []))]
    const latest = player.lastStep && now - player.lastStep.at < 1_600 ? player.lastStep.direction : undefined
    const text = !workerReady ? '인식 준비 중' : track?.phase === 'centering' ? '중앙 보정 중'
      : track?.phase === 'framing' ? '발을 나란히'
      : !observed ? '발 미인식' : observed === 1 ? '한 발 인식'
      : track?.phase === 'ready' ? '양발 인식' : '상체도 보여 주세요'
    setText(status, text)
    const tone = tiles[0] ?? latest
    if (row.dataset.input !== (tone ?? '')) row.dataset.input = tone ?? ''
    const names = tiles.map(tile => `${symbols[tile]} ${directionName[tile]}`).join(' · ')
    setText(input, names ? `밟는 중  ${names}` : latest ? `최근 입력  ${symbols[latest]} ${directionName[latest]}`
      : track?.floor && observed > 0 ? track.feet.every(foot => foot.centered) ? '중앙' : '방향 칸으로 이동'
      : `발 ${observed}/2`)
  })
}

function report(clock: number) {
  const playing = phase === 'playing', loading = phase === 'loading', results = phase === 'results'
  const arena = screen === 'arena', hasPlayers = readyToPlay()
  let guidance = ''
  if (screen === 'camera' || screen === 'select' || arena) {
    if (loading) guidance = 'CD를 읽고 있어요.'
    else if (playing) guidance = clock < leadIn ? '카운트다운에 맞춰 준비하세요.' : '화살표가 위쪽 판정선에 닿을 때 발을 내디뎌요.'
    else if (results) guidance = '곡이 끝났어요. 기록을 확인하고 다시 도전해 보세요.'
    else if (!demo && !workerReady) guidance = '전신 추적을 준비하고 있어요.'
    else if (!hasPlayers) guidance = count === 2
      ? 'P1은 화면 왼쪽, P2는 오른쪽에 서서 각자 머리와 두 발을 보여 주세요.'
      : '머리와 두 발이 모두 보이게 서서 두 발을 나란히 맞추고 잠깐 멈춰 주세요.'
    else if (screen === 'camera') guidance = '중계창의 점이 발 위치예요. ←·→는 옆으로, ↑는 뒤로, ↓는 카메라 쪽으로 밟아 보세요.'
    else if (screen === 'select') guidance = demo ? '네온 댄서를 고르고 시연 무대로 들어가세요.' : '댄서를 고르고 발판을 밟아 보세요. 중계창에서 인식한 방향을 확인할 수 있어요.'
    else guidance = demo ? '게임 시작을 눌러 캐릭터의 시연과 음악을 감상하세요.' : '게임 시작 전에도 발판을 밟아 볼 수 있어요. 시작을 누르면 여덟 박자 뒤 첫 노트가 나와요.'
  }
  setText(hint, guidance)
  hint.hidden = !guidance
  startButton.hidden = !arena || playing
  startButton.disabled = !hasPlayers || loading || !entry.hidden
  setText(startButton, !entry.hidden ? '입장 중…' : loading ? 'CD 읽는 중…' : results ? '▶ 다시 도전' : '▶ 게임 시작')
  stopButton.hidden = !playing && !loading
  resetButton.hidden = demo || screen !== 'camera' && screen !== 'select' && (!arena || playing || loading)
  const current = Math.min(duration, Math.max(0, clock))
  progress.value = current
  setText(discTime, `${timecode(current)} / ${timecode(duration)}`)
  setText(discState, playing ? muted ? 'MUTE' : 'PLAY' : loading ? 'READING' : results ? 'END' : 'READY')
  const discMode = playing ? 'play' : 'stop'
  if (cd.dataset.state !== discMode) cd.dataset.state = discMode
  if (playing && !reduced.matches) {
    const values = music.spectrum()
    bands.forEach((band, i) => {
      const frequency = Math.floor((i / (bands.length - 1)) ** 1.65 * 15)
      const level = Math.round((values[frequency] ?? 0) / 17)
      if (band.dataset.level !== String(level)) {
        band.dataset.level = String(level)
        band.style.setProperty('--level', String(.16 + level * .055))
      }
    })
  }
  if (arena) {
    setText(arenaStatus, results ? 'RESULTS' : loading ? 'LOADING' : playing ? clock < leadIn ? 'GET READY' : 'ON STAGE' : 'READY')
    const beat = playing && clock >= 0 && !reduced.matches ? String(Math.floor(clock / beatMs) % 4 + 1) : ''
    if (beatLamps.dataset.beat !== beat) beatLamps.dataset.beat = beat
    panels.forEach(({ panel, value, name, energy, judgement, result, totals, grade, combo, comboLabel }, i) => {
      const player = players[i]
      panel.hidden = !player
      if (!player) return
      const round = player.round
      const fresh = playing && round?.judgement && clock - round.judgement.shownAt < 625 ? round.judgement : undefined
      if (panel.style.getPropertyValue('--player') !== player.look.color) panel.style.setProperty('--player', player.look.color)
      setText(name, player.look.name)
      setText(value, String(round?.score ?? 0).padStart(7, '0'))
      energy.value = round?.energy ?? .67
      judgement.hidden = !fresh
      if (fresh) {
        if (judgement.dataset.grade !== fresh.judgement) judgement.dataset.grade = fresh.judgement
        setText(grade, fresh.judgement)
        comboLabel.hidden = !round?.combo
        setText(combo, String(round?.combo ?? ''))
        const stamp = String(fresh.shownAt)
        if (judgement.dataset.at !== stamp) {
          judgement.dataset.at = stamp
          if (!reduced.matches && typeof judgement.animate === 'function') {
            judgement.getAnimations().forEach(animation => animation.cancel())
            judgement.animate(
              [{ transform: 'scale(.78)', opacity: .5 }, { transform: 'scale(1.1)', opacity: 1, offset: .38 }, { transform: 'scale(1)', opacity: 1 }],
              { duration: 280, easing: 'cubic-bezier(.15,.8,.34,1)' },
            )
          }
        }
      } else if (judgement.dataset.at) {
        delete judgement.dataset.at
      }
      result.hidden = !results
      if (results && round) {
        const values = [round.counts.PERFECT, round.counts.GREAT, round.counts.BAD, round.best]
        totals.forEach((total, j) => setText(total, String(values[j])))
      }
    })
  }
}

cameraButton.addEventListener('click', () => {
  error.hidden = true
  if (screen !== 'home') { goHome(); cameraButton.focus(); return }
  workerReady = false
  show('connecting')
  void camera.open()
})
demoButton.addEventListener('click', () => {
  resetRound()
  resetTracking()
  error.hidden = true
  demo = true
  show('select')
  roster.querySelector('button')?.focus()
})
chooseButton.addEventListener('click', () => {
  show('select')
  roster.querySelector<HTMLButtonElement>('button[aria-pressed=true]')?.focus()
})
enterButton.addEventListener('click', () => {
  entryUntil = performance.now() + (reduced.matches ? 1_050 : 1_650)
  entry.hidden = false
  show('arena')
})
backButton.addEventListener('click', () => {
  resetRound()
  show(screen === 'arena' ? 'select' : 'camera')
  if (screen === 'select') roster.querySelector<HTMLButtonElement>('button[aria-pressed=true]')?.focus()
  else chooseButton.focus()
})
resetButton.addEventListener('click', () => { resetTracking(); report(music.clock) })
startButton.addEventListener('click', () => void startRound())
stopButton.addEventListener('click', () => { resetRound(); report(0); startButton.focus() })
fieldToggle.addEventListener('click', () => {
  styledFeed = !styledFeed
  updateField()
})
fieldSurface.addEventListener('pointermove', event => {
  if (screen === 'arena' && entry.hidden) swing.pointer = stage.aimAt(video, event.clientX, event.clientY)
})
fieldSurface.addEventListener('pointerleave', () => { swing.pointer = undefined })
for (const button of modePick.querySelectorAll('button')) {
  button.addEventListener('click', () => {
    const next = Number(button.dataset.count) === 2 ? 2 : 1
    if (next === count) return
    count = next
    players = allPlayers.slice(0, count)
    focusSlot = 0
    resetTracking()
    show(screen)
  })
}
for (const button of playerPick.querySelectorAll('button')) {
  button.addEventListener('click', () => { focusSlot = Number(button.dataset.slot); updatePick() })
}
function changeVolume() { music.volume(Number(volume.value) / 100, muted) }
volume.addEventListener('input', changeVolume)
muteButton.addEventListener('click', () => {
  muted = !muted
  muteButton.setAttribute('aria-pressed', String(muted))
  muteButton.title = muted ? '소리 켜기' : '음소거'
  changeVolume()
  report(music.clock)
})
video.addEventListener('resize', resetTracking)

const loop = new FrameLoop(now => {
  camera.capture(now, screen === 'arena' && entry.hidden === true)
  if (screen === 'home' || screen === 'connecting') return
  if (!entry.hidden && now >= entryUntil) {
    entry.hidden = true
    report(0)
    const button = startButton.disabled ? resetButton : startButton
    button.focus({ preventScroll: true })
  }
  if (!demo && now - freshAt > 440) {
    for (const player of players) {
      if (!player.track || (player.track.phase === 'searching' && !player.track.feet.length)) continue
      player.tracker.loseTrack()
      player.track = { phase: 'searching', floor: player.track.floor, feet: [], motion: 0, steps: [] }
      player.lastStep = undefined
    }
  }
  let clock = phase === 'results' ? duration : music.clock
  if (phase === 'playing') {
    for (const [index, player] of players.entries()) {
      const round = player.round!
      if (demo) {
        let note = round.chart[player.demoNote]
        while (note && clock >= note.at + 35) {
          if (player.demoNote % (index ? 11 : 13) !== 9) {
            showStep(player, note.direction, now)
            round.hit({ direction: note.direction, at: note.at + (player.demoNote % 5 === 4 ? 135 : 35) }, clock)
          }
          note = round.chart[++player.demoNote]
        }
      }
      round.advance(clock)
    }
    if (clock >= duration) { music.stop(); phase = 'results'; clock = duration }
  }
  if (cabinet.dataset.step && now >= lampUntil) cabinet.dataset.step = ''
  report(clock)
  reportFeet(now)
  if (screen === 'arena') stage.draw({ now, clock, demo, reduced: reduced.matches, active: phase === 'playing', count, players })
  if (screen === 'select') stage.drawPreview(players, focusSlot, now, demo && !reduced.matches)
  if (screen === 'camera') stage.drawPreview(players, focusSlot, now, false, false)
  if (screen === 'camera' || (screen === 'select' && !demo)) stage.drawField(video, players, 'guide', now, reduced.matches, swing)
  if (screen === 'arena' && !demo) stage.drawField(video, players, styledFeed ? 'style' : 'raw', now, reduced.matches, swing)
}, false)

document.addEventListener('visibilitychange', () => {
  camera.visibility()
  if (document.hidden) {
    if (phase === 'playing' || phase === 'loading') resetRound()
    resetTracking()
  }
})
window.addEventListener('pagehide', event => {
  goHome()
  if (!event.persisted) { music.close(); loop.close(); stage.close() }
})
show('home')
