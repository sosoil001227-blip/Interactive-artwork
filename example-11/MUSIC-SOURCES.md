# Twinkle, Twinkle, Little Star · 음악 출처와 합성

확인일: 2026-11-19.

사용하는 곡은 **Twinkle, Twinkle, Little Star** 한 곡입니다. 전통 프랑스 선율 *Ah! vous dirai-je, maman*과 Jane Taylor의 1806년 시에서 알려진 곡입니다.

- [Noctave의 출처·악보·라이선스 설명](https://noctavepiano.com/en/sheet-music/trad-ah-vous-dirai-je-maman/)은 전통 선율을 퍼블릭 도메인으로 표시하며 C장조 42개 선율 음표, 4/4박자와 CC0 악보 제공을 확인할 수 있습니다.
- 프로젝트는 익숙한 원곡 선율을 `src/song.ts`에 직접 구성합니다. 원곡의 6개 악구, 42개 음표, 48박을 84 BPM(약 34.3초)으로 재생합니다.
- 반주는 이 프로젝트에서 만든 피아노풍 아르페지오·현악 패드·오르골 배음의 새 합성 편곡입니다. 특정 연주자의 녹음이나 현대 편곡을 다운로드하거나 재사용하지 않습니다.
- 보컬은 성대 배음·호흡·모음 공명·비브라토·약한 사이버 변조로 실시간 합성합니다. 음절에 대응한 모음 발성으로 선율을 부르며, 외부 가수 녹음이나 TTS 엔진은 사용하지 않습니다.

이전 Think of Me / Popular 공식 영상, YouTube API와 음원 업로드·피치 시프트 경로는 현재 공연에서 제거했습니다. 음원 파일이나 스트리밍 서비스 없이 작동합니다.

Web Audio의 [공식 시간·노드 명세](https://www.w3.org/TR/webaudio/)에 따라 같은 AudioContext 시계와 공연 상태에서 보컬·반주·립싱크·악보를 갱신합니다. 오른손 높이는 보컬 게인만 조절하고 선율의 주파수나 반주 게인을 바꾸지 않습니다.
