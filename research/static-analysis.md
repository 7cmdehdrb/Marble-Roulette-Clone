# Marble Roulette 정적 역공학 기록

분석 대상: https://lazygyu.github.io/roulette/  
확인일: 2026-10-15 (Asia/Seoul)

## 근거와 범위

- 배포 HTML `original/index.html`, JS `original/roulette.5457fdf0.js`, CSS `original/roulette.e144bd5e.css`를 원본 URL에서 확보했다.
- 배포 JS가 명시한 공개 소스맵 `roulette.5457fdf0.js.map`에는 41개 source 항목과 `sourcesContent`가 있다. 이를 실행하지 않고 JSON으로 파싱하여 `original/recovered/`에 원래 basename과 순번으로 저장했다. 복원한 TS는 배포 소스맵의 원문이며 추측으로 작성한 디컴파일 결과가 아니다.
- REA `analyze_javascript_application` parent Evidence: `ev_98e13adadc6837affa5ac0be23094edbb582751c416edb0e70028d312b0afe5c`. Summary Evidence: `ev_0ae8608827af8e9c911fa9f9aafd22a4f4ca53b154152a9d1c5cd79132089693`. 전달받은 전체 summary는 `rea-static-summary.json`에 저장했다.
- REA는 HTML과 JS를 inert text로 분석했으며 JS bootstrap을 실행하지 않았다. HTML inline body 한 개는 REA 분석 범위에서 누락됐고 직접 읽었다. 정적 graph는 partial이고 semantic unknown이 남는다. 아래 동작 설명은 소스에서 관찰한 구현이며 실제 브라우저 실행 결과를 주장하지 않는다. 런타임 검증은 별도 root 작업이다.

## 주요 기능

| 기능 | 소스에서 관찰한 규칙 |
| --- | --- |
| 이름 입력 | 쉼표, CR, LF로 분리하고 공백·빈 항목 제거. 기본값 `수박*2,키위*2,귤*2`. |
| 수량 | `이름*N`은 같은 이름 구슬 N개를 생성한다. `이름/N`은 스킬 가중치다. 두 표기를 함께 쓸 수 있다. |
| 입력 정리 | blur 시 동일 이름과 동일 가중치 항목을 합쳐 `이름*수량`으로 정리한다. |
| 보존 | `mbr_names` localStorage에 입력 목록을 보존하고 URL `?names=`가 있으면 먼저 적용한다. |
| 섞기 | 전체 라운드와 맵을 초기화하고 생성 순서를 Fisher–Yates 방식으로 다시 섞는다. |
| 당첨 순위 | First, Last, 숫자 한 개, Multiple의 시작~끝 범위. 내부는 0-based inclusive이고 구슬 개수에 맞춰 잘린다. |
| 시작/종료 | 시작하면 설정 패널을 숨긴다. 목표 범위 끝 순위까지 확정되면 goal 이벤트를 발행하고 3초 뒤 패널을 표시한다. |
| 끝 순위 최적화 | 모든 구슬 중 하나만 남아 마지막 순위가 확실하면 실제 goal 통과 전 결과를 확정할 수 있다. |
| 결과 | 한 명은 아래 Winner 영역, 여러 명은 중앙 결과 팝업과 왼쪽 상단 확정 당첨자 목록. |
| 순위 복사 | 순위 UI 더블 클릭 시 `Rank\tName\tWinner` TSV를 클립보드에 저장하고 당첨자는 ☆ 표시한다. |
| 배속 | canvas를 누르고 있는 동안 2배속. 버튼 영역 제한 없이 pointerup/cancel로 해제한다. |
| 미니맵 | 왼쪽 세로 맵 위로 포인터를 옮기면 해당 월드 좌표로 카메라를 잠근다. 밖으로 이동하면 자동 추적 복귀한다. |
| 녹화 | canvas.captureStream + MediaRecorder, 6 Mbps. 라운드 종료 1초 뒤 stop, 날짜를 붙인 mp4 이름으로 다운로드한다. |
| 맵 공유 | 기본 4개 외 다운로드 맵 localStorage 최대 30개, 공유마당 목록·검색·설치·업데이트·삭제 UI가 있다. 원격 서비스는 별도 의존성이다. |

## 맵과 물리 규칙

`map-data.json`은 `009-maps.ts`의 객체 literal을 문자열/키/trailing comma만 변환해 만든 구조화 데이터다. 원본 코드는 실행하지 않았다.

| 맵 | 한국어 제목 | 엔티티 수 | goalY | zoomY |
| --- | --- | ---: | ---: | ---: |
| Wheel of fortune | 운명의 수레바퀴 | 46 | 111 | 106.75 |
| BubblePop | 버블팝 | 59 | 83 | 78 |
| Pot of greed | 욕망의 항아리 | 32 | 91 | 92.5 |
| Yoru ni Kakeru | 밤을 달리다 (by item4) | 288 | 248 | 234.5 |

- 원본 엔진은 `box2d-wasm ^7.0.0`, 중력 `(0,10)`, 고정 tick 10 ms, `world.Step(deltaSeconds,6,2)`를 쓴다.
- 구슬 반지름은 0.25, fixture density는 `1 + Math.random()`이다. 생성 시 asleep/disabled이고 시작하면 활성화한다.
- 엔티티는 static/kinematic body와 box/circle/polyline shape다. box width/height는 **Box2D half extent**로 전달되므로 화면에서도 2배 길이로 그린다. 각 box의 shape.rotation과 body angularVelocity를 함께 적용한다.
- `life > 0` 엔티티는 접촉이 생기면 다음 tick에 제거된다. BubblePop의 소멸 장애물에 사용된다.
- 생성은 한 줄 최대 10개, x=`10.25+(order%10)*0.6`, y는 행 수에 따른 역순이다. 색 hue=`360/총수*order`.
- `/N`은 승률 추첨 가중치가 아니라 스킬 cooldown/발동 확률에 영향을 준다. 입력 weight 범위를 0.1~1.1로 선형 정규화한다. cooldown=`1000+(1-weight)*4000`, 발동 확률=`0.2*weight`이며 발동 시 주변 구슬을 밀친다.
- 5초간 거의 움직이지 않는 활성 구슬은 랜덤 impulse로 흔든다.
- goal은 `marble.y > stage.goalY`. 도착한 구슬은 winner 배열에 들어가고 500 ms 뒤 물리 body가 제거된다.
- 순위는 단순 y 정렬이 아니라 `ProgressMap`의 결승까지 거리로 계산한다. 0.4초 EMA와 0.25 월드 단위 여유로 순위 떨림을 줄인다.
- 카메라는 목표 순위와 경쟁 구슬을 추적한다. 결승 근처에서는 확대 및 최소 0.2배 slow motion을 적용한다. 맵의 zoomZones/cameraZones가 별도 연출을 정의할 수 있다.

## 화면 규칙

- fullscreen fixed canvas. 기본 검정 배경, 네온 cyan box, 노랑 circle, 흰 polyline + cyan bloom(blur 15). 밝은 테마 배경은 `#eee`다.
- 내부 scene width는 `max(CSS width/2,640)`이고 동일 종횡비 height. 최종 display canvas는 width 1920까지다. 기본 zoom은 월드 단위당 30px에 camera zoom을 곱한다.
- 미니맵은 내부 canvas 좌표 `(10,10)`에서 시작하고 기본 폭은 104, 맵 월드 x는 0~26. 높이가 화면을 넘으면 scale을 줄인다. 배경 `#333`, 바깥선 green, viewport white.
- 순위는 오른쪽 끝 정렬, 10pt sans-serif. 확정 구슬은 bold 11pt, ☆/✔와 `#순위`를 표시한다. 여러 당첨 범위는 반투명 금색 띠다.
- desktop 설정 패널은 left/bottom 1rem, radius10, 배경 `#666`, padding10, 최소폭50%. 이름 입력은 `#999`, 14pt, 최소높이115px. 버튼은 `#222`, 글자 `#fefefe`. 좌측 입력/액션, 우측 옵션.
- width<=750px면 bottom60px, width=화면-2rem, stacked 설정. Settings 접기 버튼, textarea 11pt·높이2.5rem, 테마 행 숨김.
- 토글은 50×25, 선택 배경 `#00baff`, 흰 knob. Notice는 중앙 500px 폭, 흰 반투명 바탕, 상단 mint `#58c9af`, 최초 방문 localStorage `lastViewedNotification` 값으로 표시한다.
- 번역은 기본 영어 원문과 한국어 사전이다. 정확한 한국어 문구는 `005-languages.ts`에 있다.

## 자산과 라이선스

- 공개 저장소: https://github.com/lazygyu/roulette
- 라이선스: https://raw.githubusercontent.com/lazygyu/roulette/master/LICENSE — MIT, Copyright (c) 2022 LazyGyu. 확보 사본 `original/LICENSE`. 공개 package.json도 MIT를 선언한다.
- `original/asset-downloads.json`에 원본 URL→로컬 파일 매핑을 기록했다. `public/assets/images/`에 챔루·쿠빈·꽉변·주누피·왈도쿤 PNG 5개와 ff.svg를 저장했다. `public/assets/icons/`에는 UI SVG 11개를 저장했다.
- 기본 과일은 외부 KeywordService sprites다. 원본 API는 Origin/Referer가 필요했다. `https://marblerouletteshop.com/api/external/keywords.json`에 원본 페이지 헤더를 붙여 받은 JSON은 `original/keywords-with-origin.json` 및 `public/assets/keywords.json`에 있다.
- 현재 keyword 3개: 귤 sprite0 `(0,0,100,100)`, 수박 `(100,0,100,100)`, 키위 `(200,0,100,100)`. 시트는 `public/assets/sprites/0.png`(1000×100), 단일 crop은 images의 `mandarin.png`, `watermelon.png`, `kiwi.png`. generated_at은 2026-10-14이고 expires_at은 2027-02-21이다.
- 원격 광고·통계·맵 API와 keyword 만료는 외부 상태다. 로컬 재현 시 네트워크 없이 보존한 자산을 쓰는 선택은 원본의 온라인 업데이트 동작과 구분해야 한다.

## 확인 상태

입력 형식, 맵 4개, 물리 상수, 스킬·순위·카메라·녹화 구현, CSS, 기본 자산, 소스맵, MIT 라이선스는 정적 근거로 확인했다. 원격 맵/광고 서비스의 현재 전체 데이터와 실제 브라우저 결과·다운로드 동작은 이 독립 정적 분석의 검증 범위 밖이다.

## 로컬 재현 범위와 충실도 한계

로컬 구현은 배포된 소스맵의 `sourcesContent`에서 복원한 TypeScript와 동일 Box2D 엔진을 기반으로 한다. 기본 4개 맵, 과일 스프라이트 및 UI 아이콘을 로컬에 보존하여 외부 API 없이 실행하도록 구성한다. 원본의 커뮤니티 맵 목록/설치 API, 상업 광고 연동, 방문·플레이 통계 전송은 로컬 재현 범위에서 제외한다.

원본 자체가 `Math.random()`으로 생성 순서, density, 스킬, 정지 탈출 impulse를 결정하므로 실행마다 결과와 경로가 달라진다. 같은 이름과 같은 맵을 넣었다는 사실만으로 두 실행의 당첨자나 구슬 좌표가 동일해지지는 않는다. 소스맵 복원은 원본 로직에 대한 높은 충실도의 근거지만 모든 브라우저의 녹화 codec, GPU/canvas 렌더링, 폰트와 원격 서비스의 동일성까지 보장하지 않는다.
