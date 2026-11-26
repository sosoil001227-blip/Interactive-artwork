# Interactive Artwork

예제 8~14는 하나의 개발 서버에서 실행합니다. 8~13번 상단의 **14 DDR MACHINE** 버튼으로 예제 14를 열 수 있습니다.

```sh
npm install  # 최초 설치 시에만
npm run https:cert  # 최초 설정 또는 IP 변경 시
npm run https:trust # 이 PC의 CA 신뢰 등록, 관리자 암호가 필요할 수 있음
npm run dev
```

- 기본 주소: **https://localhost:5174/** → Jelly Black Hole로 이동
- 예제 8: **https://localhost:5174/example-8/**
- 예제 9: **https://localhost:5174/example-9/**
- 예제 10: **https://localhost:5174/example-10/**
- 예제 11: **https://localhost:5174/example-11/**
- 예제 12: **https://localhost:5174/example-12/**
- 예제 13: **https://localhost:5174/example-13/**
- 예제 14: **https://localhost:5174/example-14/**

개발 서버를 실행하면 HTTPS Local 및 Network 주소가 표시됩니다. 두 예제를 위해 서버를 추가 실행할 필요가 없습니다. 예제를 바꾸면 이전 예제의 카메라 트랙을 종료합니다. 전환한 화면에서 카메라 켜기를 눌러 사용하세요.

같은 네트워크에서 공유할 주소는 개발 서버가 출력하는 **Network** 주소를 사용하세요. Wi-Fi가 바뀌어 IP가 변경되면 서버를 종료하고 `npm run https:cert`로 인증서를 갱신한 뒤 `npm run dev`로 다시 실행하세요. 이 Mac에서는 IP 변경과 관계없이 **https://localhost:5174/**를 사용합니다. HTTPS 설정은 홈과 예제 8~14 전체에 적용됩니다. 접속 PC와 iPhone의 인증서 신뢰 및 카메라 권한 설정은 [HTTPS 접속 안내](docs/HTTPS.md)를 참고하세요.

## Example 08 · WaterTouch

MediaPipe로 양손 열 손가락의 끝을 추적하고, 움직인 경로를 따라 파동과 실제 카메라 영상의 굴절을 만듭니다. 물결 세기, 손끝 표시, 물결 지우기를 화면 하단에서 조절할 수 있습니다.

## Example 09 · magic

손바닥을 서로 마주 보면 마법진이 생기며 짧고 신비로운 생성 효과음이 한 번 재생됩니다. 양손을 좌우로 벌려 크기를 키우고, 펼친 두 손바닥을 카메라 쪽으로 돌리면 앞으로 뻗어나갑니다. 넓힌 상태에서 손가락을 움직이면 형광빛 마법진이 떨리며 낮은 웅웅 소리가 나고, 멈추면 서서히 가라앉습니다. 소리 ON/OFF, 손 추적 표시와 마법진 초기화도 지원합니다. 자세한 제스처 설명은 [example-9/README.md](example-9/README.md)를 참고하세요.

## Example 14 · DDR MACHINE

웹캠의 전신 추적으로 발이 닿는 방향 타일과 몸의 움직임에 반응하는 네온 댄스 무대입니다. 자세한 사용 방법은 [예제 14](example-14/README.md)를 참고하세요.

## 개발 및 검증

```sh
npm test
npm run build
npm run preview
```

루트 Vite 설정에서 각 예제의 HTML 진입점을 빌드하며, 결과물은 루트 **dist/**입니다. 각 예제는 별도의 문서로 열립니다. `npm run dev:example13`도 같은 5174 서버에서 13번을 바로 여는 별칭입니다.

MediaPipe WASM, 손 인식 모델, 폰트는 설치 후 루트 public/에 준비하며 두 예제가 함께 사용합니다. 카메라 영상은 저장하거나 전송하지 않습니다. 카메라 접근에는 localhost 또는 HTTPS가 필요합니다. 기존 interactive_coding 아카이브의 두 폴더 링크도 이 서버의 각 예제로 연결됩니다.

손 인식은 지원 환경에서 별도 Worker로 처리하며, Worker나 GPU 초기화가 실패하면 메인 스레드 또는 CPU로 전환합니다. 화면 렌더링은 최대 60fps, 손 인식은 최대 30fps로 수행하고 숨겨진 탭에서는 영상·렌더링·오디오 작업을 중지합니다. 효과의 해상도, 물결 셰이더, 마법진 구성과 입자 수는 유지합니다.

`npm run build`는 원본과 함께 무손실 `.br`·`.gz` 압축 파일을 생성합니다. 배포 서버가 압축 파일을 협상해서 제공해야 전송량이 줄어듭니다. [최적화와 배포 안내](docs/PERFORMANCE.md)에 검증 범위와 설정 조건을 정리했습니다. Worker 소스를 변경한 뒤 개발 모드에서 확인하려면 `npm run build:worker`로 Worker를 다시 빌드하세요. 설치 및 프로덕션 빌드에서는 자동으로 준비합니다.

개발 서버는 HTTPS와 LAN 접속을 사용하며, 기존 `npm run preview`는 빌드 결과 확인용 HTTP localhost 설정을 유지합니다. 인증서는 빌드에 포함하지 않습니다.
