# DDR MACHINE

예제 8~13 상단의 **14 DDR MACHINE** 버튼으로 열 수 있습니다. 공용 서버 주소는 [예제 14](https://localhost:5174/example-14/)입니다.

## 사용 방법

**DDR 무대**를 넓게 펼치고 오른쪽에는 작은 **현실 공간** 중계창을 배치했습니다. **카메라 켜기**를 누르면 중계창에 웹캠 영상이 열립니다. 좁은 화면에서는 무대 아래에 중계창이 표시됩니다. **체험 시연**에서는 카메라 권한 없이 무대를 볼 수 있습니다.

1. **1인** 또는 **2인**을 고르고 머리부터 두 발까지 화면에 담습니다. 1인은 가운데, 2인은 왼쪽의 P1과 오른쪽의 P2로 나눠 섭니다. 각자 두 발을 나란히 두고 잠깐 멈추면 발 위치에 타일이 맞춰집니다. 중계창의 L/R은 감지한 왼발과 오른발 위치를 표시합니다. 게임 시작 전에도 한 칸씩 밟아 오른쪽 인식 상태와 무대 발판이 바뀌는지 볼 수 있습니다.
2. **캐릭터 선택**에서 네온 댄서 VOLT, ROXY, BIT, NOVA 중 하나를 고릅니다. 각 댄서는 헤어 실루엣과 의상이 다릅니다. 팔과 몸을 움직이면 무대 위 댄서가 동작을 따라 합니다. 2인 모드에서는 P1과 P2의 캐릭터를 각각 고릅니다. **무대로 이동**을 누르면 입장 화면에서 DDR 기기가 잠깐 크게 나타납니다.
3. 무대 화면 안쪽 왼쪽 아래의 보라색 CD 플레이어에서 **게임 시작**을 누르면 120 BPM 오리지널 음원 **CHROME STEPS**가 재생됩니다. 여덟 박자가 흐르는 동안 맞춰 둔 발 위치로 돌아오세요. 플레이어에서 재생 위치를 확인하고 볼륨과 음소거를 조절할 수 있습니다.
4. 노트가 위쪽 화살표 판정선에 닿는 순간 해당 방향으로 발을 내딛습니다. ←·→는 양옆, ↑는 카메라에서 멀어지는 쪽, ↓는 가까워지는 쪽입니다. 타이밍에 따라 **PERFECT** 또는 **GREAT**, 방향이 다르거나 노트를 놓치면 **BAD**가 표시됩니다. 성공을 이어가면 콤보가 증가하고 BAD에서 초기화됩니다.
5. 곡이 끝나면 플레이어별 점수와 최고 콤보를 확인하고 다시 도전할 수 있습니다. 카메라나 시작 위치를 옮겼다면 **발 위치 다시 맞추기**를 누릅니다.

게임 무대에는 네온 댄서와 크롬 구체, 청록색 유리 발판을 배치했습니다. 상단 표시등은 음악의 네 박자에 맞춰 켜지고, 바닥과 판정선의 방향 화살표는 실제 발 입력에 반응합니다. 노트와 입력이 맞으면 별도로 판정이 표시됩니다. 2인 모드의 발 위치, 에너지, 판정과 점수는 각각 표시됩니다.

오른쪽 영상은 방 배경과 사람을 원본 비율로 함께 보여 줍니다. 플레이 중 **캐릭터 스타일 보기**를 누르면 중계창에도 선택한 캐릭터의 색감이 적용됩니다. MediaPipe Pose Landmarker는 최대 두 사람의 관절 위치를 추적합니다. 2인 모드에서 플레이어 역할은 미러 화면의 왼쪽과 오른쪽으로 구분합니다.

입장 후 손목을 움직여 조준점을 옮기거나 중계창 위에서 마우스로 조준할 수 있습니다. 손을 빠르게 휘둘렀을 때 조준점이 인물 분할 마스크 안에 있으면 해당 인물의 영역만 짧게 붉어집니다. 카메라 영상과 마스크 처리는 브라우저 안에서 이뤄집니다.

## 검증 · 2026-11-23

- 예제 8~13의 메뉴 연결을 정적으로 확인했습니다. 루트와 예제 13 TypeScript 검사, 예제 14 동작 테스트 5개, 예제 14 진입점·포즈 Worker·포스터의 메모리 빌드를 통과했습니다.
- 실제 카메라에서의 양발 인식, 거리와 카메라 각도에 따른 앞뒤 타일 감도, 기기별 렌더링과 모바일 상단 메뉴는 최종 QA로 남겼습니다.
- 시작 화면과 중앙 무대의 전환을 추가한 뒤 예제 14 TypeScript 검사와 진입점의 메모리 빌드를 통과했습니다. 실제 브라우저에서의 권한 요청, 전환과 모바일 무대 배치는 최종 QA에 남겼습니다.
- 아케이드 캐비닛을 적용한 뒤 TypeScript 검사와 이미지·무대·조작 버튼의 메모리 빌드를 통과했습니다. 실제 카메라와 시연의 기기 조명 타이밍, 모바일에서의 화면 너비와 버튼 배치는 최종 QA에 남겼습니다.
- 인물 분리를 제거한 뒤 TypeScript 검사와 예제 14 및 포즈 Worker 메모리 빌드를 통과했습니다. 실제 웹캠 영상에서 방 배경과 무대 조명이 어우러지는 정도는 최종 QA에 남겼습니다.
- 캐릭터 선택과 리듬 라운드를 추가한 뒤 예제 14 TypeScript 검사, 발 트래킹·2인 좌표 분리·판정 테스트 7개, 진입점·포즈 Worker·음원의 메모리 빌드를 통과했습니다. 실제 웹캠의 두 사람 동시 인식과 겹침, 움직임에 따른 판정 지연, 브라우저별 음원 시작 및 모바일 화면은 최종 QA에 남겼습니다.
- 도형 아바타를 실시간 카메라 스타일로 바꾼 뒤 예제 14 TypeScript 검사와 메모리 빌드, 2인 영상 좌우 분기와 비율을 확인했습니다. 실제 웹캠 색감과 프레임 성능은 최종 QA에 남겼습니다.
- 아케이드 그래픽을 적용한 뒤 예제 14의 TypeScript와 이미지 포함 메모리 빌드, 1인·2인 판정 장면의 Canvas 호출을 확인했습니다. 실제 플레이에서 판정 글자의 가독성과 발판 효과, 모바일 화면은 최종 QA에 남겼습니다.
- 무대와 현실 공간을 두 채널로 배치한 뒤 TypeScript 검사, 네온 무대 이미지가 포함된 메모리 빌드, 무대와 카메라의 분리 렌더링을 확인했습니다. 실제 웹캠 전환, 권한 안내와 기기별 화면 배치는 최종 QA에 남겼습니다.
- 픽셀 댄서와 인물 분할 효과를 추가한 뒤 TypeScript와 메모리 빌드, 예제 14 동작 테스트 7개를 확인했습니다. 모의 입력으로 팔 관절이 캐릭터에 반영되는지, 조준점이 마스크 밖에 있거나 손을 천천히 움직일 때 붉은 효과가 생기지 않는지도 확인했습니다. 실제 웹캠에서의 경계 정밀도, 손동작 민감도, 두 사람의 겹침과 모바일 배치는 최종 QA에 남겼습니다.
- CD 플레이어를 무대 안으로 옮긴 뒤 TypeScript와 메모리 빌드를 통과했습니다. 넓은 화면과 좁은 화면에서 1인·2인 화살표 레인이 CD 위에서 끝나는지 모의 좌표로 확인했습니다. 실제 브라우저 배치와 모바일 조작은 최종 QA에 남겼습니다.
- CD 플레이어의 곡 정보와 조작부를 두 줄로 정리한 뒤 TypeScript와 메모리 빌드를 통과했습니다. 새 패널 높이를 적용한 넓은 무대와 좁은 무대에서 1인·2인 레인 여백을 모의 좌표로 확인했습니다. 실제 브라우저의 글자 배치와 모바일 슬라이더 조작은 최종 QA에 남겼습니다.
- 발 표시와 상태를 추가한 뒤 TypeScript, 메모리 빌드와 예제 14 동작 테스트 8개를 통과했습니다. 모의 입력으로 연습 타일 반응, 한 발 가림 뒤 입력과 좁은 무대의 CD 가림 보정을 확인했습니다. 실제 웹캠의 가림·카메라 각도별 발 인식과 모바일 가독성은 최종 QA에 남겼습니다.
- 네온 댄서의 실루엣과 의상을 다시 그린 뒤 TypeScript와 메모리 빌드를 통과했습니다. 의상 4종의 정지 이미지와 모의 관절 입력을 확인했습니다. 실제 웹캠에서 빠르게 움직일 때의 실루엣과 모바일 선택창 가독성은 최종 QA에 남겼습니다.

## 네온 무대 이미지

내장 이미지 생성 도구로 제작한 배경을 [neon-arena.webp](src/assets/neon-arena.webp)에 저장했습니다.

```text
Use case: stylized-concept. Generate an original widescreen 16:9 backdrop for the middle display of a retro rhythm arcade cabinet. The user's reference screenshots are mood references for Y2K music arcade graphics, neon dancer silhouettes, and old 3D chrome art; create an original environment. Very dark midnight cobalt vaulted hall, luminous electric-turquoise perspective glass dance floor in the lower half. Thin cyan and blue architectural linework and checker reflection. At far left and far right edges only, elegant cut-paper dancer silhouettes in contrasting magenta, cyan, and lime with subtle abstract ornamental flourishes, edge lighting, and vertical light curtains. At upper right and upper center, two small floating mirror-polished chrome balls reflecting the aqua checker floor, strong jewel reflections, and tiny star glints. Screen-printed grain and authentic early-2000s 3D render texture, physically glossy chrome, high contrast of turquoise lights against dark blue. Keep the center and upper band mostly open and dark for the app to draw playable HUD, and avoid high-contrast detail in central center-left. One continuous navy-and-aqua scene. Generate scenery art only. No interface elements, arrows, numbers, names, lettering, typography, logo, duplicate/replica of any existing software/game, no character taken from any reference.
```

## 포스터 이미지

내장 이미지 생성 도구로 만든 포스터를 [dance-posters.webp](src/assets/dance-posters.webp)에 저장했습니다. 생성 프롬프트는 아래와 같습니다.

```text
Create an original widescreen 16:9 illustrated backdrop for a Korean retro dance-arcade media artwork. Two separate vintage dance-ad posters occupy the far left and far right sides of a plum-black stage wall, with an open, nearly black center for a live dancer and overlays. Left poster: an adult woman in a confident full-body disco step, windswept dark hair, rose-pink and warm cream ink. Right poster: an adult dancer with arms extended in vivid cyan and acid-lime athletic clubwear. Use the attached poster references as mood only: late-1990s Korean pop advertising and screen-printed dance flyers, vivid magenta halftones, monochromatic ink shapes, cream starbursts, aged paper and photo-mechanical grain, dynamic contrasting poses. Electric violet and blue light leaks at the margins. Poster illustration only, no lettering, logos, existing characters, tiles, software graphics, or interface mockup. Genuinely dark clear middle, strong colorful side art.
```

## 아케이드 기기 이미지

내장 이미지 생성 도구로 만든 기기 이미지를 [cabinet.webp](src/assets/cabinet.webp)에 저장했습니다. 무대 입장 순간에 표시합니다. 생성 프롬프트는 아래와 같습니다.

```text
Create an original product-render asset of a retrofuturist dance arcade cabinet, isolated on a transparent background. Use the attached image only as inspiration for pearl-white molded hardware, cold white light and cyan rings, with subtle acid-lime and hot pink accents. Design a sophisticated new cabinet: straight-on centered front view, near-symmetrical, slight visible depth at the base, full cabinet visible, compact width-to-height ratio close to one. One large wide rectangular deep black glass display in the upper center, blank and free of reflections or gradients towards the middle so editable title text can be placed on it. Distinct polished silver metal bezel, beveled pearl-white body, two tall side speaker pods with electric blue concentric glow, a short empty translucent marquee with small cyan fixtures above the screen, and one integrated front dance platform with flush original geometric arrow foot tiles and a silver edge. Fine material realism, restrained Y2K industrial design with vertical perforations, tiny fasteners, glossy white enamel and ivory highlights. No people, no hands, no text, no logos, no existing product design or branded controls. Entire object centered and fully in frame with a very small clear margin. Transparent outside the machine, with no scene background.
```
