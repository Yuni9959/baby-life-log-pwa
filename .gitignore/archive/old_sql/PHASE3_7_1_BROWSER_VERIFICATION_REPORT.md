# Phase 3.7.1 Browser/PWA Verification Report

## 1. 테스트 환경

- 대상 앱: 한국어 모바일 우선 아기 생활 기록 PWA
- 대상 Phase: 3.7.1
- 검증 기준일: 2026-05-24
- 우선 검증 환경: 브라우저/PWA DevTools Console 및 Supabase Dashboard

## 2. node --check 결과

Coder 정적 문법 검사 결과:

| 파일 | 결과 |
|---|---|
| `deliverables/cloud-config.js` | PASS |
| `deliverables/cloud-supabase.js` | PASS |
| `deliverables/service-worker.js` | PASS |
| `deliverables/sw.js` | PASS |

브라우저 전용 파일은 `node <file>`로 직접 실행하지 않았고, 문법 검사용 `node --check`만 사용했다.

## 3. Supabase SQL 실행 결과

실행 대상:

```text
deliverables/supabase_phase3_7_1_type_sync_fix.sql
```

Coder 단계에서는 Supabase Dashboard 접근 권한이 없어 SQL Editor 실행은 `NOT VERIFIED`다. Tester는 Supabase Dashboard > SQL Editor에서 실행 후 다음을 확인해야 한다.

- `records_type_check`가 `feeding`, `burp`, `diaper`, `sleep_start`, `sleep_end`, `wake`, `custom`, `test`를 허용한다.
- `records_subtype_check`가 `null`, `pee`, `poop`, `pee_poop`, `formula`, `breast`, `pumped`, `connection`을 허용한다.
- 기존 `records` row 삭제가 없다.

## 4. 브라우저/PWA 버전 확인

확인 기준:

- 화면 버전 표시: `v3.7.1 · 동기화 검증`
- `cloud-config.js`: `appVersion: "3.7.1"`
- `cloud-supabase.js`: `BABY_CLOUD_APP_VERSION = "3.7.1"`
- Service Worker 캐시: `baby-life-log-v3.7.1-*`

브라우저 직접 확인은 Tester 단계에서 수행한다.

## 5. 빠른 기록 서버 저장 검증

실제 메인 버튼으로 검증한다.

1. 수유 빠른 기록
2. 기저귀 빠른 기록
3. 트림 빠른 기록
4. 잠듦 빠른 기록
5. 깨어남 빠른 기록

각 기록은 localStorage에 즉시 저장되어야 하며 서버 저장 결과를 기다리지 않아야 한다.

## 6. 타입별 서버 저장 검증

| 액션 | local type | server type | subtype | amount_ml | Supabase 저장 | 결과 |
|---|---|---|---|---:|---|---|
| 수유 | feeding | feeding | null/formula | 100 | NOT VERIFIED | Tester 확인 필요 |
| 기저귀 | diaper | diaper | pee/poop/pee_poop | null | NOT VERIFIED | Tester 확인 필요 |
| 트림 | burp | burp | null | null | NOT VERIFIED | Tester 확인 필요 |
| 잠듦 | sleep/sleep_start | sleep_start | null | null | NOT VERIFIED | Tester 확인 필요 |
| 깨어남 | wake | wake | null | null | NOT VERIFIED | Tester 확인 필요 |

Console에서 확인할 로그:

- `[BabyCloud] saveRecord:start`
- `[BabyCloud] mapLocalRecordToServerRow`
- `[BabyCloud] saveRecord:row`
- `[BabyCloud] saveRecord:success`
- 실패 시 `[BabyCloud] saveRecord:error`

## 7. Supabase Table Editor 확인 결과

Tester는 Supabase Table Editor > `records`에서 다음을 확인한다.

- 트림: `type = burp`, `subtype is null`, `amount_ml is null`
- 잠듦: `type = sleep_start`, `subtype is null`, `amount_ml is null`
- 깨어남: `type = wake`, `subtype is null`, `amount_ml is null`
- 모든 row: `client_id`, `family_id`, `baby_id` 존재, `deleted_at is null`

## 8. test row 제외 검증

기존 `isTestRecord` / `isDiagnosticTestRecord` 경로를 유지했다. Tester는 일반 목록, 통계, 분석, CSV에서 `type = test`, `subtype = connection`, `is_sample = true`, `test_record_`, `diagnostic_record_` row가 제외되는지 확인한다.

## 9. 삭제/soft delete 검증

기존 `softDeleteRecord`는 유지했고, 삭제 row도 `mapLocalRecordToServerRow`를 통과한다. Tester는 삭제 후 Supabase `deleted_at`이 채워지고 일반 목록/통계에서 제외되는지 확인한다.

## 10. pending/error 재시도 검증

기존 `retryPendingRecords` 경로는 유지했다. Tester는 pending/error/local_only/deleted_pending/deleted_error 기록 재시도 시 일반 기록만 재시도되고 test row가 제외되는지 확인한다.

## 11. PWA 캐시 확인

캐시 이름을 v3.7.1로 갱신했고, 새 SQL/보고서 파일을 캐시 목록에 추가했다.

- `service-worker.js`: `baby-life-log-v3.7.1-20260524`
- `sw.js`: `baby-life-log-v3.7.1-legacy-20260524`

## 12. 결론

Coder 단계에서는 type/subtype/amount_ml 매핑과 디버깅 로그를 구현했고, SQL 및 검증 보고서 초안을 작성했다. Supabase SQL 실행과 실제 브라우저/PWA 서버 저장 성공 여부는 Tester가 Dashboard와 브라우저에서 최종 확인해야 한다.
