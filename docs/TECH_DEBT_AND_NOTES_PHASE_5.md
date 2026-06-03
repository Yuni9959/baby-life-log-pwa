# Tech Debt and Notes Phase 5

Baby Life Log PWA Phase 5 기술부채 / 주의사항

## 1. Phase 5에서 남긴 기술부채

- 분석, 리포트, 공유, 인쇄/PDF 흐름이 여러 Phase에 걸쳐 추가되었으므로 Phase 6에서 UI를 바꾸기 전에 function boundary를 다시 확인해야 한다.
- 비슷한 fallback 문구와 low-data 처리가 여러 리포트 surface에 중복되어 있을 수 있다.
- report hub, cry helper, premium preview, share image, printable report의 UI 진입점이 늘어나 selector 의존성이 커졌을 수 있다.
- Phase 5.27 릴리즈 검증 중 Play 설치 앱/TWA 반영, Supabase smoke test, 브라우저 end-to-end smoke test는 실제 실행 증거가 별도로 필요하다.

## 2. 나중에 정리할 수 있는 중복 함수

- 분석 객체 생성 전 `records` 필터링과 정렬 helper.
- low-data fallback 문구 생성 helper.
- 리포트 카드 렌더링 helper.
- 공유/인쇄용 summary mapping helper.
- cry helper와 next event prediction에서 최근 기록 window를 계산하는 helper.

정리는 Phase 6 UI 개편 중 기능 보존 테스트를 먼저 통과한 뒤 별도 refactor 범위로 진행한다.

## 3. 데이터 부족 fallback 개선 필요 항목

- `personalBaseline`: 기록 기간이 짧을 때 기준값 대신 기록 축적 안내 표시.
- `sleepAnalysis`: 잠듦/깨어남 pair가 부족할 때 수면 시간 단정 금지.
- `feedingBurpAnalysis`: 수유량 또는 트림 기록이 부족할 때 원인 추정 금지.
- `diaperAnalysis`: subtype이 부족할 때 건강 판단 금지.
- `cryReasonSuggestion`: 최근 이벤트가 부족할 때 확인 후보만 표시.
- `nextEventPrediction`: 예측 신뢰도가 낮을 때 알림/행동 지시 금지.
- `shareImageState` / `printableReportState`: 렌더 실패 시 사용자가 앱 기본 기능을 잃지 않도록 fallback 제공.

## 4. UI/UX 대개편 시 주의할 항목

- `data-action`, `id`, event listener, function 연결을 끊지 않는다.
- Supabase 관련 script load 순서를 유지한다.
- `cloud-config` / `cloud-supabase` 흐름을 유지한다.
- `family_id`, `baby_id`, `family_code` `localStorage` key를 임의 변경하지 않는다.
- `records` type 구조와 `deleted_at` soft delete 의미를 변경하지 않는다.
- 분석 객체 생성 순서를 바꾸지 않는다.
- 울어요 안전 체크와 선제 알림 기본 OFF를 유지한다.
- 프리미엄 기능은 결제 기능이 아니라 preview mode로 유지한다.

## 5. Service worker / cache 주의사항

- UI/JS/CSS/assets가 바뀌면 `sw.js` `CACHE_NAME` 갱신을 검토한다.
- `ASSETS_TO_CACHE`의 모든 경로가 실제 존재해야 한다.
- 존재하지 않는 파일을 precache에 넣으면 service worker install이 실패할 수 있다.
- GitHub Pages 배포 후 Play 설치 앱/TWA에서 이전 버전이 보이면 service worker cache를 우선 의심한다.
- 확인 절차는 hard reload, DevTools Service Workers update, Cache Storage 확인, 앱 재시작 순서로 진행한다.

## 6. Android wrapper를 건드리면 안 되는 이유

이 앱은 Play-distributed TWA/PWA 앱이다. 대부분의 제품 업데이트는 PWA repository와 GitHub Pages 배포로 반영된다. Android wrapper 수정은 새 AAB 빌드, Play Console 업로드, 심사/배포 risk를 만든다. Phase 5.28과 Phase 6 UI/UX 작업은 Android native 작업으로 명시되지 않았으므로 wrapper를 수정하지 않는다.

수정 금지 영역:

```text
Android wrapper project
app/
android/
gradle/
.gradle/
build.gradle
build.gradle.kts
settings.gradle
settings.gradle.kts
gradle.properties
local.properties
AndroidManifest.xml
MainActivity.kt
MainActivity.java
TWA launcher 관련 native 파일
Play Console용 AAB 빌드 설정
```

## 7. 향후 Play Billing 선행 조건

- Play Billing은 Phase 5.28 범위가 아니다.
- 결제 UI, 구독 검증, 권한 enforcement, 서버 검증 정책은 별도 Phase에서 정의해야 한다.
- 현재 프리미엄 후보 기능은 `premiumAccessState`와 `premiumPreviewState` 기반 preview mode로 유지한다.
- 결제 강요 문구를 금지한다.
- 상품 정책, 환불/구독 안내, entitlement source, server-side validation 계획을 먼저 확정해야 한다.

## 8. 문구 safety 기준

금지 표현:

```text
정상입니다
문제없습니다
비정상입니다
위험합니다
진단됩니다
반드시
늦었습니다
지금 해야 합니다
먹여야 합니다
재워야 합니다
기저귀 때문입니다
가스 때문입니다
배고파서 우는 것입니다
졸려서 우는 것입니다
병원에 가야 합니다
응급입니다
건강 점수
정상 점수
위험 점수
공식 진단 자료
진단서
의료 문서
지금 결제하세요
결제하지 않으면 사용할 수 없습니다
구매 필수
구독하지 않으면 제한됩니다
```

권장 표현:

```text
기록상으로는 ~로 남아 있어요.
~을 확인해볼 만해요.
참고용으로 봐주세요.
기록이 조금 더 쌓이면 더 자연스럽게 볼 수 있어요.
아기의 실제 신호를 먼저 확인해 주세요.
현재는 미리보기로 사용할 수 있어요.
```

## 9. Phase 6로 넘기는 미확정 항목

- Play 설치 앱/TWA 최신 반영 확인.
- Supabase CRUD smoke test.
- 브라우저 end-to-end smoke test.
- 공유 이미지와 PDF/인쇄 preview의 실제 렌더 확인.
- safety text 최종 화면 검수.
