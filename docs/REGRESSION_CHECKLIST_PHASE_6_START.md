# Regression Checklist for Phase 6 Start

이 문서는 Phase 6 UI/UX 대개편을 시작하기 전에 수행할 회귀 테스트 체크리스트다. 직접 실행 증거가 없는 항목은 완료로 표시하지 않는다.

## 1. 기본 기록 테스트

- [ ] 수유 기록을 추가할 수 있다.
- [ ] 수유량 입력값이 저장되고 표시된다.
- [ ] 기저귀 기록을 추가할 수 있다.
- [ ] 기저귀 subtype을 선택하고 표시할 수 있다.
- [ ] 트림 기록을 추가할 수 있다.
- [ ] 잠듦 기록을 추가할 수 있다.
- [ ] 깨어남 기록을 추가할 수 있다.
- [ ] 최근 기록 목록이 갱신된다.
- [ ] 오늘 통계가 갱신된다.
- [ ] 기록 수정이 동작한다.
- [ ] 기록 삭제가 `deleted_at` soft delete 또는 기존 삭제 정책대로 동작한다.
- [ ] 선택 삭제가 동작한다.
- [ ] CSV 내보내기가 동작한다.

## 2. `localStorage` 테스트

- [ ] 새 기록 후 새로고침해도 기록이 복원된다.
- [ ] 현재 아기 context가 복원된다.
- [ ] offline 또는 Supabase unavailable 상태에서도 local fallback이 동작한다.
- [ ] 기존 `localStorage` key를 Phase 6 UI에서도 그대로 쓴다.

## 3. Supabase 테스트

- [ ] 안전한 테스트 계정 또는 테스트 family context로 `insert`를 확인한다.
- [ ] `select`로 cloud 기록을 불러온다.
- [ ] `update`로 기록 수정이 반영된다.
- [ ] `deleted_at` soft delete가 반영된다.
- [ ] cloud sync status가 성공/실패 상태를 표시한다.
- [ ] DB schema, RLS, RPC 변경 없이 테스트한다.

## 4. `family_id` / `baby_id` / `family_code` 테스트

- [ ] `family_id`가 데이터 소유 범위로 유지된다.
- [ ] `baby_id`가 현재 아기 context로 유지된다.
- [ ] `family_code` 가족 합류 흐름이 기존 방식대로 동작한다.
- [ ] 가족 context가 없을 때 안전한 fallback을 표시한다.
- [ ] 아기 context가 없을 때 분석/리포트가 실패하지 않는다.

## 5. Phase 5 분석 객체 생성 테스트

- [ ] `analysisSnapshot`이 생성된다.
- [ ] `preprocessing result`가 생성된다.
- [ ] `personalBaseline`이 생성되거나 데이터 부족 fallback이 표시된다.
- [ ] `sleepAnalysis`가 생성되거나 fallback이 표시된다.
- [ ] `feedingBurpAnalysis`가 생성되거나 fallback이 표시된다.
- [ ] `diaperAnalysis`가 생성되거나 fallback이 표시된다.
- [ ] `reportMessages`가 safety 기준에 맞게 생성된다.
- [ ] `rhythmScoreResult`가 참고 지표로만 표시된다.
- [ ] `parentReportBundle`의 일간/주간/월간 흐름이 유지된다.
- [ ] `missingDataInsights`가 기록 누락과 신뢰도 안내를 표시한다.
- [ ] `babyAgeToneAdjustment`가 월령별 톤을 적용한다.
- [ ] `doctorVisitSummary`가 상담 참고용으로 표시된다.

## 6. 리포트 허브 테스트

- [ ] report hub 진입점이 표시된다.
- [ ] daily report 진입점이 동작한다.
- [ ] weekly report 진입점이 동작한다.
- [ ] monthly report 진입점이 동작한다.
- [ ] doctor visit summary 진입점이 동작한다.
- [ ] premium preview와 report hub 상태가 충돌하지 않는다.
- [ ] `data-action`, `id`, event listener 연결이 유지된다.

## 7. 울어요 테스트

- [ ] 울어요 버튼이 동작한다.
- [ ] 안전 체크가 flow 초반에 유지된다.
- [ ] `cryReasonSuggestion`이 원인 후보를 참고용으로 표시한다.
- [ ] 방금 해본 것 체크가 저장/표시된다.
- [ ] `cryFeedbackLearningSummary`가 피드백 부족 fallback을 처리한다.
- [ ] `similarCrySituations`가 유사 상황 없음 fallback을 처리한다.
- [ ] 원인 확정, 진단, 응급 단정 문구가 없다.

## 8. 다음 이벤트 예측 / 선제 알림 테스트

- [ ] `nextEventPrediction`이 데이터 충분 시 표시된다.
- [ ] 데이터 부족 시 안전한 fallback을 표시한다.
- [ ] `predictiveAlertState` 기본값이 OFF다.
- [ ] Notification 권한을 자동 요청하지 않는다.
- [ ] 사용자가 명시적으로 켠 경우에만 알림 권한 flow가 시작된다.

## 9. 공유 이미지 / PDF / 인쇄 테스트

- [ ] 보호자 인수인계가 최근 기록 기반으로 생성된다.
- [ ] 가족 공유 리포트가 family context에서 생성된다.
- [ ] `shareImageState` preview가 표시된다.
- [ ] 공유 이미지에 불필요한 민감 정보가 없다.
- [ ] `printableReportState`가 print/PDF layout을 준비한다.
- [ ] 브라우저 인쇄가 실패해도 앱 기본 기능은 깨지지 않는다.
- [ ] 병원 상담용 요약은 공식 진단 자료나 진단서로 표현되지 않는다.

## 10. PWA / Service Worker 테스트

- [ ] `sw.js` 문법 오류가 없다.
- [ ] UI/JS/CSS/assets 변경 시 `CACHE_NAME` 갱신 필요 여부를 확인한다.
- [ ] `ASSETS_TO_CACHE` 모든 경로가 실제 존재한다.
- [ ] `ASSETS_TO_CACHE` MISSING 항목이 0개다.
- [ ] service worker install 실패 가능성이 없다.
- [ ] GitHub Pages 배포 후 최신 파일을 제공한다.
- [ ] Play 설치 앱/TWA에서 최신 PWA가 반영된다.
- [ ] 이전 버전이 보이면 hard reload, service worker update, Cache Storage 확인, 앱 재시작을 수행한다.

## 11. Android wrapper guard 테스트

- [ ] `app/` 변경 없음.
- [ ] `android/` 변경 없음.
- [ ] `gradle/` 변경 없음.
- [ ] `.gradle/` 변경 없음.
- [ ] `build.gradle` 변경 없음.
- [ ] `build.gradle.kts` 변경 없음.
- [ ] `settings.gradle` 변경 없음.
- [ ] `settings.gradle.kts` 변경 없음.
- [ ] `gradle.properties` 변경 없음.
- [ ] `local.properties` 변경 없음.
- [ ] `AndroidManifest.xml` 변경 없음.
- [ ] `MainActivity.kt` 변경 없음.
- [ ] `MainActivity.java` 변경 없음.
- [ ] TWA launcher 관련 native 파일 변경 없음.
- [ ] 새 AAB 빌드 요구 없음.
- [ ] Play Console 업로드 요구 없음.

## 12. 완료 기록 기준

각 항목은 직접 실행 증거가 있을 때만 완료로 표시한다. Play 설치 앱/TWA, Supabase smoke test, 브라우저 end-to-end smoke test는 Coder 문서 작성만으로 완료 처리하지 않는다.
