# Phase 6 Handoff

Baby Life Log PWA Phase 5.28 - Phase 6 UI/UX 대개편 인계 문서

## 1. Phase 6 목표

Phase 6의 목표는 Baby Life Log PWA의 UI/UX를 크게 개선하되 Phase 5에서 정리한 기록, 저장/동기화, 분석, 리포트, 울어요, 예측, 공유, PDF/인쇄, 프리미엄 preview 기능을 깨지 않는 것이다. Phase 6는 디자인 개편 단계이며 DB 구조, 로그인 구조, 가족 공유 구조, Android wrapper를 변경하는 단계가 아니다.

## 2. 반드시 보존해야 할 핵심 기능

### 기본 기록

- 수유 기록
- 기저귀 기록
- 트림 기록
- 잠듦 기록
- 깨어남 기록
- 수유량 입력
- 기저귀 subtype 선택
- 기록 수정
- 기록 삭제
- 선택 삭제
- 최근 기록
- 오늘 통계
- CSV 내보내기

### 저장/동기화

- `localStorage` 저장/복원
- Supabase `insert/select/update/soft delete`
- cloud sync status
- `family_id` 기반 데이터 소유 구조
- `baby_id` 기반 현재 아기 context
- `family_code` 가족 합류
- `deleted_at` soft delete 구조

### Phase 5 분석/리포트

- 분석 snapshot 생성
- 수면 분석
- 수유/트림 분석
- 기저귀 분석
- 리포트 문구
- 리듬 참고 지표
- 부모 리포트
- 기록 누락 감지
- 월령별 톤 조정
- 병원 상담용 요약
- 리포트 허브

### 울어요/예측/알림

- 울어요 버튼
- 안전 체크
- 원인 확인 우선순위
- 방금 해본 것
- 피드백 학습
- 비슷한 상황 다시 보기
- 다음 이벤트 예측
- 선제 알림 기본 OFF
- Notification 자동 요청 금지

### 공유/프리미엄 후보

- 보호자 인수인계
- 가족 공유 리포트
- 프리미엄 미리보기
- 공유 이미지
- PDF/인쇄용 리포트

## 3. 변경 가능한 UI 영역

- 레이아웃, 색상, 간격, 타이포그래피, 내비게이션 배치.
- 리포트 허브 카드 배치와 시각적 hierarchy.
- 기록 입력 form의 시각 구조.
- 공유 이미지와 인쇄 preview의 visual polish.
- 문구 safety 기준을 지키는 범위 안의 마이크로카피.

## 4. 변경하면 위험한 영역

- 기존 `data-action` 값.
- 기존 `id` 기반 selector.
- button event listener 흐름.
- Supabase script load 순서와 `cloud-config` / `cloud-supabase` 흐름.
- `family_id`, `baby_id`, `family_code` `localStorage` key.
- `records` type 구조.
- `deleted_at` soft delete 구조.
- 분석 객체 생성 순서.
- 리포트 허브와 각 리포트 진입점.
- 울어요 기능의 안전 체크.
- 선제 알림 기본값 OFF.
- 프리미엄 preview mode.

## 5. DOM/event/data-action/id/function 보존 기준

- UI markup을 교체해도 기존 `data-action`은 동일하게 유지한다.
- button의 semantic action은 기존 event listener가 찾을 수 있는 형태로 유지한다.
- `id`가 script selector로 쓰이면 새 UI에서도 같은 `id`를 제공하거나 명시적인 adapter layer를 둔다.
- function 이름과 호출 순서는 기능 변경 Phase가 아니면 바꾸지 않는다.
- 이벤트 위임을 사용하는 영역은 ancestor 구조 변경 전에 bubbling 경로를 확인한다.
- report hub, cry helper, share image, printable report 진입점은 자동화 테스트 대상으로 남긴다.

## 6. Supabase/family/baby context 보존 기준

- `cloud-config.js`와 `cloud-supabase.js` 로드 흐름을 유지한다.
- Supabase URL, publishable key, auth behavior는 별도 명시 없이 변경하지 않는다.
- `family_id`는 데이터 소유 범위 기준으로 유지한다.
- `baby_id`는 현재 아기 context 기준으로 유지한다.
- `family_code`는 가족 합류 흐름 기준으로 유지한다.
- `records` row의 type, timestamp, subtype, amount, note, `deleted_at` 의미를 바꾸지 않는다.
- RLS, RPC, DB schema 변경은 Phase 6 UI 작업과 분리한다.

## 7. Phase 5 분석 객체 보존 기준

다음 객체는 Phase 6에서 UI가 바뀌어도 생성 가능해야 한다.

`analysisSnapshot`, `preprocessing result`, `personalBaseline`, `sleepAnalysis`, `feedingBurpAnalysis`, `diaperAnalysis`, `reportMessages`, `rhythmScoreResult`, `parentReportBundle`, `missingDataInsights`, `babyAgeToneAdjustment`, `doctorVisitSummary`, `cryReasonSuggestion`, `cryAttemptState`, `cryFeedbackLearningSummary`, `similarCrySituations`, `nextEventPrediction`, `predictiveAlertState`, `caregiverHandoffSummary`, `familyShareReport`, `reportHubState`, `premiumAccessState`, `premiumPreviewState`, `shareImageState`, `printableReportState`, `phase526QaState`, `phase527ReleaseState`.

## 8. PWA/TWA 배포 기준

이 앱은 Play-distributed TWA/PWA 앱이다. 대부분의 제품 업데이트는 PWA repository에서 진행한다. 대부분의 제품 업데이트는 GitHub Pages 배포로 반영된다. Android wrapper는 기본적으로 수정하지 않는다. 새 AAB는 기본적으로 필요하지 않다.

Android wrapper를 수정할 수 있는 경우는 앱 아이콘, 앱 이름, `manifest`, native permission, target SDK, TWA URL, Android native code 변경이 명시 작업으로 승인된 경우뿐이다. Phase 6 UI/UX 개편만으로 Android wrapper 수정, 새 AAB 빌드, Play Console 업로드를 요구하지 않는다.

## 9. Service Worker / Cache 기준

- UI/JS/CSS/assets가 바뀌면 `sw.js` cache version 갱신을 검토한다.
- `ASSETS_TO_CACHE`의 모든 경로가 실제 존재해야 한다.
- 존재하지 않는 파일을 precache에 넣으면 service worker install이 실패할 수 있다.
- GitHub Pages 배포 후 Play 설치 앱/TWA에서 이전 버전이 보이면 service worker cache를 먼저 의심한다.
- 확인 절차는 hard reload, DevTools Application > Service Workers update, Cache Storage 확인, Play 설치 앱 재시작 순서로 진행한다.

## 10. 문구 safety 기준

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

## 11. Phase 6 시작 전 필수 회귀 테스트

Phase 6 시작 전 `REGRESSION_CHECKLIST_PHASE_6_START.md`의 전체 항목을 실행한다. Play 설치 앱/TWA 반영, Supabase smoke test, browser smoke test는 실제 실행 증거가 있어야 하며 문서 작성만으로 완료 처리하지 않는다.
