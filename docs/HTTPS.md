# 로컬 네트워크 HTTPS 접속

`interactive_artwork`의 예제 8~14는 포트 **5174**의 HTTPS 개발 서버를 함께 사용합니다.

## 이 PC에서 실행

```sh
cd /Users/namsujin/Desktop/interactive_artwork
npm run https:trust
npm run dev
```

현재 인증서는 생성되어 있습니다. `https:trust`는 mkcert CA를 이 PC의 신뢰 저장소에 등록합니다. 자동 실행 환경에서는 관리자 암호를 입력할 수 없어 완료하지 못했으므로 **터미널에서 한 번 직접 실행**하세요. macOS 관리자 암호가 필요할 수 있습니다.

`npm run dev` 실행 후 Vite가 다음과 같은 주소를 표시합니다. 아래 IP는 예시입니다.

```text
Local:   https://localhost:5174/
Network: https://192.168.1.23:5174/
```

다른 PC와 휴대폰에는 터미널에 실제로 표시된 **Network** 주소를 공유하세요. 홈은 예제 10으로 이동하며 상단 버튼으로 예제를 전환할 수 있습니다. DDR MACHINE을 바로 열려면 Network 주소에 `/example-14/`를 붙입니다. HTTPS 인증서는 이 서버의 예제 전체에 적용됩니다.

## 접속 PC의 인증서 경고

접속하는 PC마다 이 개발 CA를 신뢰해야 합니다. 개발 PC에서 신뢰 등록해도 다른 PC에는 자동으로 적용되지 않습니다.

1. 개발 PC의 `.certs/rootCA.pem` **하나만** 접속 PC에 복사합니다. 이 파일은 CA의 공개 인증서입니다.
2. Mac에서는 키체인 접근으로 가져와 해당 인증서의 신뢰를 **항상 신뢰**로 설정합니다. Windows에서는 인증서 관리자의 **신뢰할 수 있는 루트 인증 기관**에 가져옵니다. Firefox가 별도의 인증서 저장소를 사용하면 Firefox 설정에서도 인증 기관으로 가져옵니다.
3. 브라우저를 완전히 종료한 뒤 다시 열고 HTTPS 주소로 접속합니다.

접속 PC에도 mkcert가 있다면, 공개 `rootCA.pem`만 들어 있는 폴더를 `CAROOT`로 지정하고 `mkcert -install`을 실행하는 공식 방법을 사용할 수 있습니다.

**`dev-key.pem` 또는 `rootCA-key.pem`은 전달하지 마세요.** 서버 인증서나 비밀키 대신 공개 CA 인증서만 전달합니다. `.certs` 파일을 public으로 이동하거나 개발 서버에서 다운로드하도록 노출하지 않습니다.

## iPhone에서 접속

1. Mac의 `.certs/rootCA.cer` 공개 인증서를 AirDrop 등으로 iPhone에 전달합니다. Finder의 폴더로 이동(Shift+Command+G)에 프로젝트의 `.certs` 경로를 입력하면 숨김 폴더를 열 수 있습니다.
2. iPhone 설정의 다운로드한 프로필 또는 **일반 → VPN 및 기기 관리**에서 해당 인증서 프로필을 설치합니다.
3. **설정 → 일반 → 정보 → 인증서 신뢰 설정**에서 해당 mkcert 루트 인증서의 완전한 신뢰를 켭니다. 프로필 설치만으로 SSL 신뢰가 자동 활성화되지는 않습니다.
4. 같은 Wi-Fi에 연결하고 Safari에서 서버가 표시한 **Network** 주소를 엽니다. 카메라 시작 버튼을 누르고 카메라 접근을 허용합니다.

Mac에서 `https:trust`를 실행해도 iPhone의 신뢰 설정은 별도로 필요합니다. [Apple의 수동 설치 인증서 신뢰 안내](https://support.apple.com/ko-kr/102390)를 참고하세요.

## 카메라가 차단되는 경우

- 인증서가 신뢰된 **HTTPS 주소**로 접속해야 합니다. 인증서 경고를 단순히 무시하는 방식에 의존하지 마세요.
- 주소창의 사이트 설정에서 **카메라 허용**을 선택하고 새로고침합니다. 이전에 차단했다면 해당 사이트의 권한을 초기화합니다.
- 접속 PC의 운영체제 개인정보 보호 설정에서 사용하는 브라우저의 카메라 권한도 허용합니다.
- 다른 앱이 카메라를 사용 중이면 종료하고, 화면의 카메라 시작 버튼을 다시 누릅니다. 사용되는 카메라는 접속 PC의 카메라입니다.

## 연결 자체가 안 되는 경우

두 PC를 같은 Wi-Fi 또는 LAN에 연결하고, 개발 PC의 방화벽에서 Node.js/5174번 포트의 수신 연결을 허용하세요. 게스트 Wi-Fi나 공유기의 단말 간 통신 차단 기능도 확인하세요. 공유기 포트 포워딩은 필요하지 않습니다.

## IP 변경 및 재설정

Wi-Fi 변경이나 DHCP로 IP가 바뀌면 서버를 종료한 상태에서 인증서를 다시 생성합니다.

```sh
npm run https:cert
npm run dev
```

localhost, IPv4/IPv6 루프백과 현재 PC의 외부 IPv4 주소들이 인증서 SAN에 포함됩니다. 현재 IP가 기존 인증서에 없거나 인증서가 만료되면 개발 설정이 재생성 방법을 안내합니다. Vite가 새로 출력하는 Network 주소를 공유하세요. 같은 CA를 사용하는 한 접속 PC의 CA를 다시 등록할 필요는 없습니다.

mkcert는 공식 v1.4.4 ARM64 바이너리를 `~/.local/bin/mkcert`에 설치했습니다. 프로젝트 도구가 이 경로와 PATH·Homebrew 설치 경로를 자동으로 찾습니다. 새 개발 PC에서는 먼저 [mkcert 설치 안내](https://github.com/FiloSottile/mkcert#installation)에 따라 mkcert를 설치하세요.

## 파일과 검증

- 인증서: `.certs/dev-cert.pem`
- 서버 비밀키: `.certs/dev-key.pem` (권한 0600)
- 공유 가능한 공개 CA: `.certs/rootCA.pem`
- iPhone 설치용 공개 CA: `.certs/rootCA.cer` (같은 CA의 DER 형식)
- CA 비밀키: mkcert의 사용자 전용 CA 저장소에 유지하며 프로젝트에 복사하지 않습니다.
- `.certs/`와 인증서·키 확장자를 `.gitignore`에 추가했으며, Vite `server.fs.deny`에서도 차단합니다.
- 개발 서버는 `::` 주소와 포트 `5174`에서 HTTPS를 사용합니다. IPv4와 IPv6를 함께 수신하는 macOS 기본 설정에서는 IPv4 LAN 주소로 접속할 수 있습니다.
- IP 변경 후 갱신한 인증서의 주소, 서명, 키 일치와 Vite 설정을 확인했습니다. 재시작 후 다른 기기에서의 HTTPS·카메라 접속은 최종 QA에 남겼습니다.
- 생성한 인증서의 SAN·서명·키 일치·파일 권한, Vite 설정, Git 제외, 기존 테스트와 빌드를 검증했습니다. 요청에 따라 개발 서버를 실행하거나 HTTPS 연결 테스트를 하지는 않았습니다.

공식 근거: [mkcert의 다른 PC 신뢰 등록](https://github.com/FiloSottile/mkcert#installing-the-ca-on-other-systems), [Vite HTTPS/host 설정](https://vite.dev/config/server-options), [카메라 API의 보안·권한 조건](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia#privacy_and_security).
