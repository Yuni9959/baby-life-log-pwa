# Feature Map Phase 5

Baby Life Log PWA Phase 5 기능 지도

## 1. 기본 기록

| 기능 | source object | UI 진입점 | fallback 조건 | 주의사항 |
|---|---|---|---|---|
| 수유 기록 | `records` type feeding | 기록 입력 영역 | 수유량 미입력 | amount optional 처리 |
| 기저귀 기록 | `records` type diaper | 기록 입력 영역 | subtype 미선택 | subtype 선택 보존 |
| 트림 기록 | `records` type burp | 기록 입력 영역 | 최근 수유 없음 | 수유 원인 확정 금지 |
| 잠듦 기록 | `records` type sleep | 기록 입력 영역 | 깨어남 pair 없음 | pair 분석 fallback |
| 깨어남 기록 | `records` type wake | 기록 입력 영역 | 잠듦 pair 없음 | pair 분석 fallback |
| 수정/삭제/선택 삭제 | `records`, `deleted_at` | 최근 기록 목록 | cloud offline | soft delete 유지 |
| 오늘 통계/최근 기록 | `records` filtered by date | 홈 summary | 기록 없음 | 빈 상태 문구 표시 |
| CSV 내보내기 | `records` export view | export action | 기록 없음 | 개인정보 포함 여부 확인 |

## 2. 저장/동기화

| 기능 | source object | UI 진입점 | fallback 조건 | 주의사항 |
|---|---|---|---|---|
| `localStorage` 저장/복원 | local records cache | app load/save | storage unavailable | key 이름 임의 변경 금지 |
| Supabase insert/select/update | `cloud-supabase.js` | sync action/app lifecycle | offline/auth 없음 | DB schema/RLS 변경 금지 |
| Supabase soft delete | `deleted_at` | delete action | sync 실패 | hard delete 금지 |
| cloud sync status | sync result | status indicator | network failure | 사용자 탓 문구 금지 |
| `family_id` | family context | account/family flow | no family | 데이터 소유 기준 유지 |
| `baby_id` | current baby context | baby switch/current profile | no selected baby | 분석 context 유지 |
| `family_code` | join flow | family join UI | invalid code | 가족 공유 구조 변경 금지 |

## 3. 분석 엔진

| 기능 | source object | UI 진입점 | fallback 조건 | 주의사항 |
|---|---|---|---|---|
| 공통 snapshot | `analysisSnapshot` | report/prediction entry | 기록 부족 | 생성 순서 보존 |
| 전처리 | `preprocessing result` | analysis internal | invalid record | ad hoc parsing 금지 |
| 개인 기준선 | `personalBaseline` | report engine | 누적 데이터 부족 | 진단/정상 표현 금지 |
| 수면 분석 | `sleepAnalysis` | report hub | pair 부족 | 참고용 표현 |
| 수유·트림 분석 | `feedingBurpAnalysis` | report hub | amount/burp 부족 | 원인 확정 금지 |
| 기저귀 분석 | `diaperAnalysis` | report hub | subtype 부족 | 의료 판단 금지 |

## 4. 리포트

| 기능 | source object | UI 진입점 | fallback 조건 | 주의사항 |
|---|---|---|---|---|
| 문구 엔진 | `reportMessages` | daily/weekly/monthly reports | 분석 신뢰도 낮음 | safety text 필터 |
| 리듬 참고 지표 | `rhythmScoreResult` | parent report | 기록 부족 | 건강 점수 금지 |
| 부모 리포트 | `parentReportBundle` | report hub | 일부 섹션 없음 | 빈 섹션 fallback |
| 누락 감지 | `missingDataInsights` | report footer | 기간 부족 | blame tone 금지 |
| 월령별 톤 | `babyAgeToneAdjustment` | report text | birth data 없음 | 나이 추정 단정 금지 |
| 병원 상담 요약 | `doctorVisitSummary` | printable/report | 기록 부족 | 의료 문서/진단서 표현 금지 |
| 통합 허브 | `reportHubState` | report hub UI | 일부 reports unavailable | `data-action` 유지 |

## 5. 울어요

| 기능 | source object | UI 진입점 | fallback 조건 | 주의사항 |
|---|---|---|---|---|
| 원인 후보 | `cryReasonSuggestion` | 울어요 버튼 | 최근 기록 부족 | 원인 확정 금지 |
| 안전 체크 | `cryAttemptState` | 울어요 flow | 체크 없음 | flow 초반 유지 |
| 방금 해본 것 | `cryAttemptState` | attempt checklist | user input 없음 | 상태 저장 확인 |
| 피드백 학습 | `cryFeedbackLearningSummary` | cry result | feedback 부족 | 참고 표현 |
| 비슷한 상황 | `similarCrySituations` | cry helper | similar 없음 | 과거 동일시 금지 |

## 6. 예측/알림

| 기능 | source object | UI 진입점 | fallback 조건 | 주의사항 |
|---|---|---|---|---|
| 다음 이벤트 예측 | `nextEventPrediction` | home/report | 기록 부족 | 지시형 문구 금지 |
| 선제 알림 | `predictiveAlertState` | settings/home | OFF/permission 없음 | 기본 OFF 유지 |
| Notification 권한 | browser permission | user explicit action | permission denied | 자동 요청 금지 |

## 7. 공유/인수인계/PDF

| 기능 | source object | UI 진입점 | fallback 조건 | 주의사항 |
|---|---|---|---|---|
| 보호자 인수인계 | `caregiverHandoffSummary` | handoff/share | 기록 부족 | 민감 정보 확인 |
| 가족 공유 리포트 | `familyShareReport` | family share | family context 없음 | `family_id` 보존 |
| 공유 이미지 | `shareImageState` | share image preview | render 실패 | 개인정보/캐시 확인 |
| PDF/인쇄 | `printableReportState` | print/PDF action | browser print 제한 | 서버 PDF 아님 |

## 8. 프리미엄 후보

| 기능 | source object | UI 진입점 | fallback 조건 | 주의사항 |
|---|---|---|---|---|
| 권한 가드 | `premiumAccessState` | premium surfaces | entitlement 없음 | 결제 기능 아님 |
| 미리보기 | `premiumPreviewState` | premium preview UI | unavailable | preview mode 유지 |
| 공유 이미지 preview | `shareImageState` | premium preview/share | render 실패 | 결제 강요 금지 |
| 인쇄/PDF preview | `printableReportState` | print preview | unsupported browser | 구매 필수 표현 금지 |

## 9. 릴리즈 QA 객체

| 객체 | 목적 | fallback 조건 | 주의사항 |
|---|---|---|---|
| `phase526QaState` | 통합 안정화 / 릴리즈 후보 QA 상태 | 수동 테스트 미완료 | 완료 오인 금지 |
| `phase527ReleaseState` | 릴리즈 패키징 / GitHub Pages 배포 검증 상태 | TWA/Supabase 미검증 | Phase 5.28 closure와 구분 |
