import { createRoot } from 'react-dom/client'
import { useArtwork } from './useArtwork.ts'
import { paintParts } from './shinchanGesture.ts'
import type { CrayonTool } from './shinchanGesture.ts'
import type { MaskKind } from './rig.ts'
import './style.css'

const examples = [
  [8, 'WaterTouch'], [9, 'magic'], [10, 'Jelly Black Hole'],
  [11, 'PUPPET SHOW'], [12, '고무 인간'], [13, 'masks'], [14, 'DDR MACHINE'],
] as const
const options = [
  ['iron-man', '아이언맨'], ['no-face', '가오나시와 보'], ['mario', '슈퍼 마리오'],
  ['conan', '코난'], ['shinchan', '짱구'], ['coraline', '코렐라인'],
] as const
const cameraText = { preview: '카메라 켜기', connecting: '연결 취소', loading: '연결 취소', live: '카메라 끄기' }
const usage: Record<MaskKind, readonly { action: string; detail: string }[]> = {
  'iron-man': [
    { action: '고개 끄덕이기', detail: '고개를 내렸다가 정면을 보면 헬멧이 장착돼요.' },
    { action: '손 돌리기', detail: '손등을 보여 준 뒤 손바닥이 보이게 돌리면 건틀릿이 장착돼요.' },
    { action: '손바닥 내밀기', detail: '손바닥을 카메라로 향하면 빛이 발사돼요.' },
  ],
  'no-face': [
    { action: '고개 끄덕이기', detail: '정면을 잠깐 본 뒤 고개를 내렸다 들면 가면이 생겨요.' },
    { action: '입 벌리기', detail: '입을 벌리면 금이 쏟아지고, 다물면 멈춰요.' },
  ],
  bo: [
    { action: '편하게 정면 보기', detail: '입을 다물고 볼에 힘을 뺀 채 정면을 잠깐 봐요.' },
    { action: '양 볼 부풀리기', detail: '양 볼에 공기를 채워 약 3초 버티면 보로 변신해요.' },
  ],
  mario: [
    { action: '고개 끄덕이기', detail: '고개를 내렸다가 정면을 보면 마리오 모자가 생겨요.' },
    { action: '양손 펴기', detail: '얼굴 양옆에서 열 손가락을 펴면 장갑을 껴요.' },
    { action: '고개 좌우로 흔들기', detail: '왼쪽 → 오른쪽 → 왼쪽으로 흔들면 벽돌이 내려와요.' },
    { action: '벽돌 아래에서 치기', detail: '물음표 벽돌을 아래에서 위로 쳐서 동전을 모아요.' },
  ],
  conan: [
    { action: '안경 올리는 시늉', detail: '눈 사이에 손가락을 대고 위로 밀면 안경이 생겨요.' },
    { action: '목 아래 옷깃 잡기', detail: '목 아래 매무새를 잠깐 만지면 리본과 재킷이 입혀져요.' },
    { action: '왼손 검지로 가리키기', detail: '왼손 검지만 펴서 카메라를 가리키면 번개와 대사가 나와요.' },
  ],
  shinchan: [
    { action: '크레용 받기', detail: '짱구가 크레용을 들면 왼쪽 아래 점선 원에 한 손을 가져가요.' },
    { action: '색을 골라 칠하기', detail: '색을 고르고 엄지와 검지를 모은 채 가이드 안을 문질러요. 손가락을 벌리면 멈춰요.' },
  ],
  coraline: [
    { action: '고개 끄덕이기', detail: '고개를 내렸다가 정면을 보면 노란 우비가 입혀져요.' },
    { action: '두 눈에 O자 맞추기', detail: '양손의 엄지와 검지로 O자를 만들어요. 눈마다 하나씩 대고 잠깐 유지하면 단추 눈이 생겨요.' },
  ],
}
const canvasLabel: Record<MaskKind, string> = {
  'iron-man': '얼굴과 손을 따라 움직이는 아이언맨 헬멧과 건틀릿',
  'no-face': '얼굴을 따라 움직이는 가오나시 가면과 입에서 쏟아지는 금',
  bo: '볼을 부풀리면 보로 바뀌고 빨간 소용돌이가 나타나는 화면',
  mario: '얼굴과 손을 따라 움직이는 마리오 모자와 장갑, 동전 벽돌',
  conan: '사용자에 맞춰 나타나는 코난 안경과 재킷, 번개 효과',
  shinchan: '짱구가 건넨 크레용으로 얼굴과 옷을 그리는 화면',
  coraline: '노란 우비와 단추 눈, 소용돌이 위로 단추와 인형이 떨어지는 화면',
}
const handText = {
  loading: '손 추적을 준비하고 있어요.',
  unavailable: '손 추적을 시작하지 못했어요. 카메라를 다시 켜 주세요.',
  'show-back': '손등을 보여 준 뒤 손바닥을 카메라로 돌려 주세요.',
  turn: '손바닥을 카메라 쪽으로 돌려 주세요.',
  assembling: '건틀릿을 장착하고 있어요.',
  equipped: '손바닥을 카메라로 향하면 빛이 발사돼요.',
}
const marioText = {
  spread: '양손을 얼굴 양옆에 들고 열 손가락을 펴 주세요.',
  gloving: '장갑을 착용하고 있어요. 손을 잠깐 유지해 주세요.',
  shake: '고개를 왼쪽·오른쪽·왼쪽으로 흔들어 주세요.',
  dropping: '물음표 벽돌 아래로 손을 가져가세요.',
  play: '물음표 벽돌을 아래에서 위로 쳐 보세요.',
}
const conanText = {
  glasses: '눈 사이에 손가락을 대고 안경을 올리듯 위로 밀어 보세요.',
  collar: '목 아래 매무새를 잠깐 만져 보세요.',
  point: '왼손 검지만 펴서 카메라를 가리켜 보세요.',
  reveal: '장면이 끝난 뒤 손을 내렸다가 다시 가리키면 반복할 수 있어요.',
}
const shinchanText = {
  arriving: '왼쪽 아래에서 짱구가 나와요.',
  lifting: '짱구가 화면 귀퉁이를 들추고 있어요.',
  searching: '짱구가 크레용을 찾고 있어요.',
  offering: '왼쪽 아래 점선 원에 손을 가져가 잠깐 기다려 주세요.',
  drawing: '엄지와 검지를 모아 가이드 안을 문질러 보세요.',
}
const crayonTools: { id: CrayonTool; name: string; hint: string }[] = [
  { id: 'peach', name: '살구색', hint: '얼굴' }, { id: 'ink', name: '검정', hint: '머리·표정' }, { id: 'red', name: '빨강', hint: '옷' },
]

function activeStep({ kind, mask, handStatus, mario, conan, shinchan, coraline, bo }: ReturnType<typeof useArtwork>) {
  switch (kind) {
    case 'iron-man': return mask !== 'locked' ? 0 : handStatus === 'equipped' ? 2 : 1
    case 'no-face': return mask === 'locked' ? 1 : 0
    case 'bo': return bo.stage === 'calibrating' ? 0 : bo.stage === 'bo' ? usage.bo.length : 1
    case 'mario':
      if (mask !== 'locked') return 0
      if (mario.stage === 'spread' || mario.stage === 'gloving') return 1
      return mario.stage === 'shake' ? 2 : 3
    case 'conan': return !conan.glasses ? 0 : !conan.suit ? 1 : 2
    case 'shinchan': return !shinchan.holding ? 0 : shinchan.painted === paintParts.length ? usage.shinchan.length : 1
    case 'coraline': return coraline.stage === 'buttons' ? usage.coraline.length : coraline.stage === 'rings' ? 1 : 0
  }
}

function instructionFor({ kind, camera, mask, status, handStatus, mario, conan, shinchan, coraline, bo }: ReturnType<typeof useArtwork>) {
  if (camera === 'preview') return
  if (camera === 'connecting') return '카메라 접근을 허용해 주세요.'
  if (camera === 'loading') return '추적 기능을 준비하고 있어요.'

  const showFace = '얼굴을 화면 중앙에 보여 주세요.'
  const showBody = '얼굴과 양쪽 어깨가 화면에 보이도록 해 주세요.'
  const bodyUnavailable = '몸 추적을 시작하지 못했어요. 카메라를 다시 켜 주세요.'
  const nod = status.nod === 'calibrating' ? '정면을 잠깐 바라봐 주세요.'
    : status.nod === 'return' ? '고개를 들어 다시 정면을 바라봐 주세요.' : '고개를 내렸다가 정면을 바라봐 주세요.'
  const handLoading = handStatus === 'loading' || handStatus === 'unavailable'

  if (kind === 'bo') {
    if (bo.stage === 'bo') return '보로 변신했어요.'
    if (!bo.tracked) return showFace
    if (bo.stage === 'calibrating') return '입을 다물고 힘을 뺀 채 정면을 잠깐 바라봐 주세요.'
    if (!bo.frontal) return '정면에서 양 볼을 부풀려 주세요.'
    if (bo.stage === 'blushing' || bo.stage === 'transforming') return '그대로 볼을 부풀려 주세요.'
    return '입을 다문 채 양 볼을 약 3초 부풀려 보세요.'
  }
  if (kind === 'coraline') {
    if (coraline.stage === 'buttons') return '단추 눈으로 변신했어요.'
    if (!status.tracked) return showBody
    if (coraline.stage === 'nod') return nod
    if (coraline.stage === 'outfit') return '노란 우비가 입혀지고 있어요.'
    if (coraline.hands !== 'ready') return handText[coraline.hands]
    return coraline.rings === 2 ? 'O자를 잠깐 유지해 주세요.' : '양손으로 O자를 만들어 두 눈에 하나씩 대 보세요.'
  }
  if (kind === 'shinchan') {
    if (!shinchan.holding && shinchan.stage !== 'offering') return shinchanText[shinchan.stage]
    if (handLoading) return handText[handStatus]
    if (!shinchan.holding) return shinchanText.offering
    if (shinchan.painted === paintParts.length) return '짱구 그림을 완성했어요.'
    if (shinchan.tool !== 'red' && !shinchan.face) return showFace
    if (shinchan.tool === 'red') {
      if (shinchan.body === 'unavailable') return bodyUnavailable
      if (shinchan.body !== 'ready') return showBody
    }
    return shinchanText.drawing
  }
  if (kind === 'conan') {
    if (handLoading) return handText[handStatus]
    if (conan.body === 'unavailable') return bodyUnavailable
    if (!status.tracked || conan.body !== 'ready') return showBody
    return conanText[conan.stage]
  }
  if (!status.tracked) return kind === 'mario' && mask === 'locked' ? '얼굴과 양손을 화면에 보여 주세요.' : showFace
  if (mask === 'assembling') return '마스크를 장착하고 있어요.'
  if (mask === 'releasing') return '마스크를 해제하고 있어요.'
  if (mask !== 'locked') return nod
  if (kind === 'iron-man') return handText[handStatus]
  if (kind === 'mario') return handLoading ? handText[handStatus] : marioText[mario.stage]
  return '입을 벌리면 금이 쏟아져요.'
}

function App() {
  const artwork = useArtwork()
  const { canvas, controls, camera, cameraAspect, mask, kind, status, error, mario, sound, conan, shinchan, coraline, bo } = artwork
  const preview = camera === 'preview', live = camera === 'live'
  const option = kind === 'bo' ? 'no-face' : kind
  const title = kind === 'shinchan' ? '짱구의 크레용' : options.find(([id]) => id === option)![1]
  const manual = kind === 'iron-man' || kind === 'no-face' || kind === 'mario'
  const busy = manual && (mask === 'assembling' || mask === 'releasing')
  const handsOnly = kind === 'shinchan' && !shinchan.holding
  const tracked = live && (handsOnly ? shinchan.hands > 0 : status.tracked)
  const trackingText = preview ? '미리보기' : camera === 'connecting' ? '카메라 연결 중' : camera === 'loading' ? '추적 준비 중'
    : handsOnly ? tracked ? '손 추적 중' : '손을 찾는 중' : tracked ? '얼굴 추적 중' : '얼굴을 찾는 중'
  const fillCameraViewport = !preview && !!cameraAspect
  const step = live ? activeStep(artwork) : undefined
  const instruction = instructionFor(artwork)
  const checkingPuff = bo.stage === 'ready' && bo.progress === 0
  const boProgress = checkingPuff ? bo.puff : bo.progress
  const maskToggle = manual && (
    <button type="button" className="secondary" onClick={() => controls.current?.toggleMask()}
      disabled={busy || (mask === 'off' && !preview && !status.tracked)}>
      {mask === 'locked' || mask === 'releasing' ? '해제' : '장착'}
    </button>
  )
  const resetButton = <button type="button" className="secondary" onClick={() => controls.current?.reset()}>초기화</button>

  return (
    <main className="exhibit" data-mask={kind}>
      <header className="topbar">
        <h1 lang="en">masks</h1>
        {import.meta.env.VITE_EXAMPLE_HUB === true && (
          <nav className="example-menu" aria-label="예제 선택">
            {examples.map(([number, name]) => (
              <a key={number} href={`${import.meta.env.BASE_URL}example-${number}/`} aria-label={`${number} ${name}`} aria-current={number === 13 ? 'page' : undefined}>
                {String(number).padStart(2, '0')} <span>{name}</span>
              </a>
            ))}
          </nav>
        )}
      </header>

      <div className="mask-picker" role="group" aria-label="캐릭터 선택">
        {options.map(([id, label], index) => (
          <button type="button" key={id} aria-pressed={id === option} aria-label={`${index + 1} ${label}`}
            onClick={() => controls.current?.select(id === 'no-face' && kind === 'bo' ? 'bo' : id)}>
            <span className="option-number">{index + 1}</span>{label}
          </button>
        ))}
      </div>

      <div className="installation">
        <section className="panel" aria-labelledby="option-title">
          <h2 id="option-title">{title}</h2>
          {option === 'no-face' && <div className="spirit-picker" role="group" aria-label="옵션 2 캐릭터 선택">
            <button type="button" aria-pressed={kind === 'no-face'} onClick={() => controls.current?.select('no-face')}>가오나시</button>
            <button type="button" aria-pressed={kind === 'bo'} onClick={() => controls.current?.select('bo')}>보</button>
          </div>}
          <div className="primary-actions">
            <button className="camera" type="button" onClick={() => controls.current?.camera()}>
              <i className="camera-icon" aria-hidden="true" />{cameraText[camera]}
            </button>
            {preview && <button type="button" className="secondary" onClick={() => controls.current?.replay()} disabled={busy}>체험 시연</button>}
            {live && maskToggle}
            {live && resetButton}
          </div>
          {error && <p className="error" role="alert">{error}</p>}

          <section className="gesture-guide" aria-labelledby="guide-title">
            <h3 id="guide-title">사용 방법</h3>
            {instruction && <p className="instruction" role="status">{instruction}</p>}
            <ol className="gesture-steps" role="list">
              {usage[kind].map(({ action, detail }, index) => {
                const current = step === index
                const done = live && kind === 'conan' && index === 1 ? conan.suit : step !== undefined && index < step
                return <li key={action} aria-current={current ? 'step' : undefined} data-done={done}>
                  <span className="step-number" role={done ? 'img' : undefined}
                    aria-label={done ? '완료' : undefined} aria-hidden={!done}>{done ? '✓' : index + 1}</span>
                  <div><strong>{action}</strong>{!live && <p>{detail}</p>}</div>
                </li>
              })}
            </ol>
          </section>

          {live && kind === 'bo' && bo.tracked && bo.stage !== 'calibrating' && bo.stage !== 'bo' &&
            <div className="progress-line">
              <label htmlFor="bo-progress">{checkingPuff ? '볼 부풀림' : '변신 진행률'} <strong>{boProgress}%</strong></label>
              <progress id="bo-progress" max="100" value={boProgress} />
            </div>}
          {live && kind === 'coraline' && coraline.stage === 'rings' && coraline.hands === 'ready' &&
            <div className="progress-line">
              <label htmlFor="coraline-progress">눈에 맞춘 O자 <strong>{coraline.rings}/2</strong></label>
              <progress id="coraline-progress" max="100" value={coraline.progress} />
            </div>}

          {live && kind === 'shinchan' && shinchan.holding && <div className="crayon-controls">
            <div className="crayon-palette" role="group" aria-label="크레용 색 선택">
              {crayonTools.map(tool => <button type="button" key={tool.id} data-color={tool.id} aria-pressed={shinchan.tool === tool.id}
                onClick={() => controls.current?.selectCrayon(tool.id)}>
                <i aria-hidden="true" />{tool.name}<small>{tool.hint}</small>
              </button>)}
            </div>
            <div className="aux-actions">
              <span role="status">{shinchan.drawing ? '그리는 중' : '완성'} {shinchan.painted}/{paintParts.length}</span>
              <button type="button" onClick={() => controls.current?.clearDrawing()}>그림 지우기</button>
            </div>
          </div>}

          {(kind === 'mario' || kind === 'conan') && <div className="aux-actions">
            <button type="button" aria-pressed={sound} onClick={() => controls.current?.toggleSound()}>
              {kind === 'mario' ? '효과음' : '나레이션'} {sound ? '켜짐' : '꺼짐'}
            </button>
            {kind === 'conan' && live && conan.glasses && conan.suit &&
              <button type="button" onClick={() => controls.current?.conanReveal()} disabled={conan.stage === 'reveal'}>번개·대사 보기</button>}
            {kind === 'mario' && live && mask === 'locked' && mario.stage === 'spread' &&
              <span>펼친 손가락 {mario.fingers}/10</span>}
          </div>}

          {preview && <details className="preview-options">
            <summary>미리보기 조작</summary>
            <div className="primary-actions">{maskToggle}{resetButton}</div>
          </details>}
        </section>

        <figure className="artwork">
          <div className="viewport" data-camera-ratio={fillCameraViewport || undefined}
            style={fillCameraViewport ? { aspectRatio: cameraAspect } : undefined}>
            <canvas ref={canvas} aria-label={canvasLabel[kind]} />
            <span className="tracking" data-active={tracked}>{trackingText}</span>
          </div>
        </figure>
      </div>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
