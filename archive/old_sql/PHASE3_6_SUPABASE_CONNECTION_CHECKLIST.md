# 아기 생활 기록 앱 - Phase 3.6 Supabase 실제 연결 체크리스트

## 1. 이번 Phase 목표

UI 버튼 반응이 아니라 Supabase Auth와 DB row 기준으로 실제 연결을 확인합니다. Anonymous Auth user, families, family_members, babies, records row가 실제 생성, 조회, 수정, soft delete 되는지가 완료 기준입니다.

버튼이 눌린다고 해서 서버 연결이 완료된 것은 아닙니다.
Supabase Auth Users와 Table Editor에서 실제 row가 생성되는지 확인해야 합니다.

## 2. 현재 Supabase 프로젝트 정보

- Project URL: `https://vburjgyfjhgtkulabrnf.supabase.co`
- Publishable Key: `sb_publishable_o1NUthUHmVjaH4f-j186ng_AbspdQwa`
- Project Ref: `vburjgyfjhgtkulabrnf`

## 3. 절대 사용하면 안 되는 정보

클라이언트 파일에는 Direct connection string, DB password, service_role key, secret key, private key를 넣지 않습니다.

## 4. Dashboard에서 확인할 항목

- Authentication 설정에서 Anonymous sign-ins 활성화
- Table Editor에서 `families`, `family_members`, `babies`, `records`, `cloud_diagnostics` 존재 확인
- 각 테이블 RLS 활성화 확인
- Phase 3.3, 3.5, 3.6 SQL 실행 여부 확인

## 5. Anonymous Auth 활성화 확인

Supabase Dashboard > Authentication 설정에서 Anonymous sign-ins를 켭니다. 꺼져 있으면 앱이 userId를 만들 수 없고 RLS 정책 때문에 DB 접근이 실패할 수 있습니다.

## 6. SQL Editor 실행 순서

1. 기존 Phase 3.3 family/baby sync SQL 실행 여부 확인
2. 기존 Phase 3.5 hardening SQL 실행 여부 확인
3. `deliverables/supabase_phase3_6_connection_diagnostics.sql` 실행

## 7. 앱에서 확인할 항목

관리 > Supabase 실제 연결 진단에서 `전체 서버 연결 진단 실행`을 누릅니다. cloud-config, enabled, Supabase 라이브러리, client, 네트워크, 익명 userId, diagnostics insert/select, family/baby, records insert/select/update/soft delete가 단계별로 표시되어야 합니다.

## 8. Supabase Table Editor에서 확인할 row

- Auth > Users: anonymous user 생성
- `cloud_diagnostics`: 현재 user_id row 생성
- `families`: 기본 가족 row 생성
- `family_members`: user_id와 family_id 연결 row 생성
- `babies`: 기본 아기 row 생성
- `records`: `type = test`, `is_sample = true` 테스트 row 생성 및 `deleted_at` 채워짐

## 9. 브라우저 콘솔에서 확인할 로그

- `[BabyCloud] saveRecord start`
- `[BabyCloud] saveRecord success`
- `[BabyCloud] saveRecord failed`
- `[BabyCloud] updateRecord start/success/failed`
- `[BabyCloud] softDeleteRecord start/success/failed`

## 10. 자주 발생하는 오류와 원인

- `cloud-config.js` 없음: 파일 배포 또는 캐시 문제
- `enabled = false`: 서버 저장 비활성화
- Supabase 라이브러리 없음: CDN 로드 실패 또는 네트워크 문제
- Anonymous Auth 실패: Dashboard에서 Anonymous sign-ins 비활성화 가능성
- 테이블 없음: SQL Editor에서 Phase 3.3~3.6 SQL 미실행 가능성

## 11. RLS 오류 확인법

오류 코드가 `42501`이거나 메시지에 row-level security, permission denied, policy가 있으면 RLS 정책 문제로 봅니다. `family_members` row가 없으면 families, babies, records 접근이 막힐 수 있습니다.

## 12. PWA 캐시 문제 해결법

앱 표시 버전, cloud-config 버전, BabyCloud 버전이 모두 3.6인지 확인합니다. 다르면 브라우저 새로고침, 앱 재설치, 사이트 데이터 삭제, service worker 업데이트를 확인합니다.

## 13. 실제 연결 완료 기준

진단 UI가 성공이고, Supabase Dashboard에서도 Auth user와 `cloud_diagnostics`, `families`, `family_members`, `babies`, `records` row가 실제로 보여야 합니다.

## 14. Phase 3.7로 넘어가기 전 체크리스트

- Anonymous Auth user 생성 확인
- family/baby/member row 생성 확인
- records insert/select/update/soft delete 확인
- 실제 수유 기록이 records에 저장되는지 확인
- 수정 시 records row update 확인
- 삭제 시 `deleted_at` update 확인
# Phase 3.6 Live Connection Verification - 2026-05-22

Verified from Codex using only the project URL and publishable key.

- `cloud-config.js`: `enabled: true`, `appVersion: "3.6"`.
- `index.html`: Supabase CDN is loaded before `cloud-config.js`, and `cloud-config.js` is loaded before `cloud-supabase.js`.
- Supabase CDN: HTTP 200 from `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`.
- Anonymous Auth: direct REST signup succeeded and created anonymous users.
- DB REST tables: `families`, `family_members`, `babies`, `records`, and `cloud_diagnostics` returned 404.

Conclusion: the URL/key and Anonymous Auth are valid. The current blocker is that the required public tables are missing from the Supabase API schema, or the Phase 3.3-3.6 SQL has not been applied/refreshed in this Supabase project. Run `deliverables/supabase_phase3_6_connection_diagnostics.sql` in the Supabase SQL Editor, then reload the app and run "전체 서버 연결 진단 실행" again.
