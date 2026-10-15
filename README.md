# 마블 룰렛 재구현

[원본 Marble Roulette](https://lazygyu.github.io/roulette/)을 REA로 분석하고, 공개 배포 소스맵에서 복원한 TypeScript와 Box2D WebAssembly로 구성한 웹앱입니다. 원본의 MIT 라이선스와 저작자 표기를 보존했습니다.

이 프로젝트는 **로컬 전용**입니다. 개발 서버와 미리보기 서버는 `localhost`에서만 실행하며, ChatGPT Sites를 포함한 클라우드에 자동 또는 수동으로 배포하지 않습니다.

## 실행

Node.js 20.19+ 또는 22.12+가 필요합니다. 이 작업에서는 Node.js 24로 검증했습니다.

```bash
npm ci
npm run dev
```

브라우저에서 **http://localhost:5173**을 여세요. 개발 서버는 5173 포트를 고정해서 사용합니다(`strictPort`). 이미 사용 중이면 다른 포트로 이동하지 않고 종료하므로, 해당 포트를 사용하는 기존 개발 서버를 종료한 뒤 다시 실행하세요.

로컬에서 빌드 결과를 확인하려면 다음과 같이 실행합니다.

```bash
npm run build
npm run preview
```

결과물은 `dist/`이며, 미리보기 주소는 **http://localhost:4173**입니다. 별도 백엔드 서버나 API 키가 필요하지 않으며 런타임 자산은 모두 로컬에서 제공합니다. `npm ci`로 의존성을 설치한 이후에는 게임 실행에 외부 서버 연결이 필요하지 않습니다.

## 구현한 기능

- 원본의 네온 캔버스, 과일 구슬, 왼쪽 미니맵, 오른쪽 실시간 순위와 설정 패널
- 기본 맵 4개: 운명의 수레바퀴, 버블팝, 욕망의 항아리, 밤을 달리다
- 동일한 Box2D 엔진과 맵 좌표, 충돌·회전 장애물·사라지는 장애물·스킬
- 스킬 발동 간격·확률·구슬당 최대 횟수·밀어내는 힘 조절과 설정 저장, 기본값 복원
- 쉼표/줄바꿈 이름 입력, `이름*수량`, `이름/스킬가중치`, 중복 병합과 섞기
- 첫번째·마지막·직접 지정 순위·여러명 범위 당첨과 결과 연출
- 결승 근처 카메라 확대와 슬로모션, 화면을 누르는 동안 2배속
- 미니맵 탐색, 순위 더블 클릭으로 결과 복사
- 밝은/어두운 테마와 모바일 설정 접기, 이름·테마·맵 저장
- 실제 경기 영상 녹화·다운로드, 경기 중 다시 준비와 Esc 초기화

예시: `수박*2,키위/3*2,귤`. `/3`은 스킬 가중치이며 정확한 당첨 확률을 보장하는 표기가 아닙니다. 입력은 구슬 500개, 이름 80자로 제한했습니다.

스킬 조절에서 발동 간격(0.5~10초), 확률(0~100%), 구슬당 최대 횟수(0~100회, 0은 무제한), 밀어내는 힘(0.25~3배)을 설정할 수 있습니다. 각 구슬은 간격마다 확률에 따라 발동하며, 성공한 발동만 횟수에 포함됩니다. 첫 대기 시간은 무작위이고, 이름에 지정한 스킬 가중치도 간격과 확률에 반영됩니다. 경기별 횟수는 다시 준비할 때 초기화됩니다. 스킬을 끄면 세부 조절도 비활성화됩니다.

## 검증

```bash
npm run typecheck
npm test
npm run test:dev
npm run build
```

입력 정규화의 11개 시나리오를 검증했습니다. 실제 Chrome에서는 네 맵을 각각 First / Last / Multiple / 임의 순위로 완주하여 골인 이벤트·당첨 인원·결과 안내·설정 복귀를 확인했습니다. 추가로 320–1440px 반응형, 테마, 맵 선택, 저장/복원, 빈 입력, 재시작, 녹화 중 즉시 초기화와 실제 WebM 다운로드를 검사했습니다.

`npm run test:dev`는 새 Vite 캐시를 사용하는 임시 로컬 개발 서버를 띄우고, SIMD 및 일반 WASM 로딩·설정 화면 준비·경기 시작·초기화를 검사합니다. Box2D는 WASM을 JS 파일의 상대 경로로 읽으므로 Vite의 사전 번들링에서 제외했습니다. 제외하지 않으면 개발 모드에서 존재하지 않는 `.vite/deps/Box2D.simd.wasm` 대신 HTML을 받아 초기화가 실패합니다.

브라우저 테스트용 `playwright-core`는 개발 의존성에 포함되어 있습니다. Chrome은 기본 `/usr/bin/google-chrome`을 사용하며, 다른 경로는 `CHROMIUM_EXECUTABLE`로 지정하세요. 브라우저를 자동 다운로드하지 않습니다.

```bash
CHROMIUM_EXECUTABLE=/absolute/path/to/chrome \
node tests/browser-smoke.mjs

CHROMIUM_EXECUTABLE=/absolute/path/to/chrome \
node tests/browser-controls.mjs
```

브라우저 테스트 전 `npm run preview -- --port 4173`을 실행하세요. 다른 주소는 `SMOKE_BASE_URL`로 지정할 수 있습니다.

스킬 UI와 실제 구슬 발동 횟수는 개발 서버를 켠 뒤 `node tests/skill-controls.mjs`로 검사할 수 있습니다. 스킬 타이밍·확률·횟수 한도·물리 충격량 배율 테스트는 `npm test`에 포함되어 있습니다.

## 분석 자료와 구현 범위

- [정적 분석 기록](research/static-analysis.md): REA Evidence, 소스맵, 물리 상수, 입력 규칙, 자산 출처
- [런타임 검증 기록](research/runtime-analysis.md): 원본/구현 비교와 검증 한계
- [골인 테스트 결과](research/browser-smoke/results.json)
- [추가 UI·녹화 테스트 결과](research/browser-controls/results.json)
- `research/original/`: 분석에 사용한 원본 배포물과 소스맵
- `src/`: 복원한 엔진과 새로 작성한 페이지 연결·입력 정규화 코드
- `public/assets/`: 보존한 이미지·아이콘·과일 스프라이트

원본의 광고/방문 통계 전송과 외부 커뮤니티 맵 설치 서버는 연결하지 않았습니다. `+`는 기본 네 맵의 미리보기를 엽니다. Shop과 공지 화면·버튼은 제거했고, 입력 방법은 이름 입력창 아래에 표시합니다. 원본처럼 난수를 사용하므로 매 경기의 구슬 경로와 당첨 결과는 달라집니다. 녹화는 브라우저가 지원하는 WebM 또는 MP4로 저장하며, 지원되지 않는 브라우저에서는 해당 토글이 비활성화됩니다.

원저작자: [LazyGyu](https://github.com/lazygyu/roulette). [MIT License](LICENSE).
