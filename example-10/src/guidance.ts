import type { CornerHand, CornerRole, JellyState } from './gesture'

const directions = '왼손 ㄴ: 위·오른쪽 / 오른손 ㄱ: 아래·왼쪽'

function correction(hand: CornerHand, side: '왼손' | '오른손', role: CornerRole) {
  switch (hand.issue) {
    case 'confidence': return `${side} 전체가 잘 보이도록 카메라 쪽으로 돌려 주세요.`
    case 'index': return `${side} 검지를 조금 더 곧게 펴 주세요.`
    case 'thumb': return `${side} 엄지를 옆으로 펼쳐 주세요.`
    case 'fold': return `${side}의 중지·약지·새끼손가락을 접어 주세요.`
    case 'angle': return `${side} 엄지와 검지 사이를 직각에 가깝게 벌려 주세요.`
    case 'corner': return `${side} 엄지와 검지가 카메라에 함께 보이도록 해 주세요.`
  }
  return role === 'lower-left' ? '왼손의 두 손가락을 위쪽과 오른쪽으로 향해 주세요.'
    : '오른손의 두 손가락을 아래쪽과 왼쪽으로 향해 주세요.'
}

export function describeGesture(state: JellyState) {
  let guide = '왼손 ㄴ, 오른손 ㄱ으로 빈 공간을 만들어 주세요.'
  let detail = `${directions} · 나머지는 접어요`
  let status = `손 인식 ${state.hands.length}/2`
  if (state.active) return { guide: '손을 벌려 늘리고, 그대로 유지해 보세요.',
    detail: '젤리 충전 중 · 손을 풀면 우주가 뿅!', status: 'ㄴ · ㄱ 연결됨 · 말랑한 우주 안' }
  if (state.hands.length === 1) guide = '다른 손도 카메라 화면 안에 보여 주세요.'
  if (state.hands.length === 2) {
    const ordered = [...state.hands].sort((a, b) => a.corner.x - b.corner.x)
    const left = ordered[0]!, right = ordered[1]!
    const leftReady = left.valid && left.role === 'lower-left', rightReady = right.valid && right.role === 'upper-right'
    status = `손 인식 2/2 · 왼쪽 ㄴ ${leftReady ? '✓' : '—'} · 오른쪽 ㄱ ${rightReady ? '✓' : '—'}`
    if (!leftReady) guide = correction(left, '왼손', 'lower-left')
    else if (!rightReady) guide = correction(right, '오른손', 'upper-right')
    else if (state.reason === 'alignment') {
      guide = 'ㄴ은 왼쪽 아래, ㄱ은 오른쪽 위에서 같은 빈 공간을 감싸 주세요.'
      detail = '두 손의 세로 손가락이 서로 마주 보게 높이를 맞춰 주세요'
    }
  }
  if (state.reason === 'hold') {
    guide = '좋아요! 모양을 잠깐 유지해 주세요.'
    detail = '두 손 사이에 작은 우주가 열리고 있어요'
  }
  return { guide, detail, status }
}
