# 아기 생활 기록 앱 - Phase 3.1 Supabase 설정 가이드

## 1. 현재 Supabase 프로젝트 정보

- Project URL: `https://vburjgyfjhgtkulabrnf.supabase.co`
- Publishable Key: `sb_publishable_o1NUthUHmVjaH4f-j186ng_AbspdQwa`
- Project Ref: `vburjgyfjhgtkulabrnf`

## 2. 이번 Phase 목표

새 기록은 localStorage에 즉시 저장하고, Supabase가 준비되어 있으면 같은 기록을 백그라운드에서 `records` 테이블에 저장합니다. 서버 실패는 기록 실패가 아니며, 앱은 계속 로컬 모드로 동작해야 합니다.

## 3. 사용하면 되는 값

- Supabase Project URL
- Supabase Publishable Key 또는 anon key
- Supabase Auth의 익명 사용자 `user.id`

## 4. 사용하면 안 되는 값

Direct connection string은 클라이언트 앱에서 사용하지 않습니다.
DB password는 GitHub에 커밋하지 않습니다.
Secret key와 service_role key는 절대 `index.html`, `cloud-config.js`, GitHub Pages에 넣지 않습니다.

## 5. Anonymous Auth 활성화 확인

Supabase Dashboard에서 `Authentication` 설정을 열고 Anonymous sign-ins가 활성화되어 있는지 확인합니다. 이번 Phase는 로그인 UI 없이 익명 사용자로 서버 저장을 준비합니다.

현재는 익명 사용자로 서버 저장을 준비하고 있어요.
나중에 로그인 기능이 추가되면 여러 기기에서 더 안전하게 사용할 수 있어요.

## 6. SQL Editor에서 records 테이블 생성

Supabase Dashboard > SQL Editor에서 `deliverables/supabase_phase3_1_records.sql` 내용을 실행합니다.

이 SQL은 다음을 생성합니다.

- `public.records` 테이블
- `unique(user_id, record_id)` 중복 방지 제약
- `type`, `amount` 체크 제약
- RLS 정책
- 조회용 인덱스
- `updated_at` 자동 갱신 트리거

## 7. RLS 정책 확인

Table Editor 또는 Authentication > Policies에서 `records` 테이블의 RLS가 활성화되어 있는지 확인합니다.

정책은 `authenticated` 사용자가 `(select auth.uid()) = user_id`인 자기 row만 select/insert/update/delete 하도록 제한합니다.

## 8. cloud-config.js 설정

`deliverables/cloud-config.js`에는 Project URL과 Publishable Key만 들어갑니다.

문제가 생기면 `enabled: false`로 바꾸면 앱은 서버 저장을 시도하지 않고 로컬 모드로 동작합니다.

## 9. 앱에서 서버 연결 확인

1. 브라우저에서 앱을 엽니다.
2. `관리` > `데이터` 영역을 엽니다.
3. `서버 저장` 섹션에서 `서버 연결 확인`을 누릅니다.
4. 익명 사용자가 준비되고 상태가 서버 준비됨으로 바뀌는지 확인합니다.

## 10. 서버 테스트 저장

`서버 테스트 저장`을 누르면 localStorage에는 넣지 않고 Supabase `records` 테이블에만 `type = test`, `is_sample = true` record를 저장합니다.

성공하면 "서버 테스트 저장에 성공했어요." 문구가 표시됩니다.

## 11. 새 기록 서버 저장 확인

수유/기저귀/트림/잠듦/깨어남을 기록하면 다음 순서로 동작해야 합니다.

1. localStorage에 즉시 저장
2. UI 즉시 반영
3. 백그라운드에서 `BabyCloud.saveRecord(record)` 실행
4. 성공 시 `record.cloud.status = "synced"`
5. 실패 시 `record.cloud.status = "error"` 또는 서버 비활성 시 `"local_only"`

## 12. 실패 시 점검 항목

- Anonymous sign-ins가 활성화되어 있는가
- `supabase_phase3_1_records.sql` 실행이 성공했는가
- `records` 테이블 RLS가 활성화되어 있는가
- 정책이 `authenticated`와 `(select auth.uid()) = user_id` 기준인가
- Project URL과 Publishable Key가 정확한가
- CDN 또는 네트워크가 차단되어 있지 않은가

실패해도 기존 기록, CSV 내보내기, JSON 백업/복원은 계속 동작해야 합니다.

## 13. Phase 3.2로 넘어가기 전 체크리스트

- `records` 테이블이 있다.
- RLS가 활성화되어 있다.
- 익명 사용자 ID를 확보할 수 있다.
- 서버 테스트 저장이 된다.
- 서버 테스트 조회가 된다.
- 새 기록이 localStorage에 즉시 저장된다.
- 새 기록이 백그라운드로 서버 저장된다.
- 서버 실패 시 localStorage 기록이 유지된다.
- service_role key, secret key, DB password가 클라이언트 파일에 없다.
