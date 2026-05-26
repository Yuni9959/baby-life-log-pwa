# 아기 생활 기록 앱 — Phase 3.0 서버 저장 구조 설계

## 1. 현재 앱 상태 요약

현재 앱은 한국어 모바일 우선 PWA이며, Phase 2.9 안정화 상태를 기준으로 한다.

- 데이터 저장: 브라우저 `localStorage`
- 데이터 스키마: `schemaVersion: 2`
- 핵심 UX: 수유, 기저귀, 트림, 잠듦, 깨어남을 한 손으로 빠르게 기록
- 배포 형태: GitHub Pages 같은 정적 호스팅을 전제로 한 PWA
- 보존 대상: `index.html`, `manifest.json`, `service-worker.js`, `sw.js`, 아이콘 파일 전체

Phase 3.0에서는 앱 실행 파일을 수정하지 않는다. 이번 산출물은 서버 저장 구조를 시작하기 위한 설계 문서다.

## 2. 서버 저장 도입 목표

Phase 3 전체의 첫 목표는 다음이다.

```text
내 기기의 데이터를 서버에 안전하게 백업하고,
필요할 때 다시 복원할 수 있다.
```

Phase 3 초반에는 실시간 동기화가 아니라 수동 백업/복원을 먼저 구현한다.

1. 기존 `localStorage` 데이터를 잃지 않는다.
2. 서버 기능 실패가 빠른 기록 실패로 이어지지 않는다.
3. 현재 `schemaVersion: 2` 데이터를 그대로 담을 수 있는 백업 단위를 만든다.
4. 나중에 기록 단위 저장, 다기기 사용, 가족 공유로 확장할 여지를 남긴다.

## 3. Phase 3에서 하지 않을 것

Phase 3.0에서는 다음을 구현하지 않는다.

- 실제 Supabase 연결
- 실제 Firebase 연결
- 실제 데이터 업로드
- 실제 데이터 다운로드
- 로그인 UI
- 회원가입 UI
- 가족 공유
- 실시간 동기화
- 자동 충돌 병합
- 결제
- AI 분석
- 의학적 판단

Phase 3.1에서도 실제 백업 업로드/복원은 하지 않고, 최소 서버 연결 상태 확인까지만 진행한다.

## 4. Supabase vs Firebase 비교

| 기준 | Supabase | Firebase | 메모 |
|---|---|---|---|
| GitHub Pages 정적 앱 호환성 | 가능. 브라우저에서 `supabase-js`와 publishable/anon key 사용 가능 | 가능. Web SDK config를 정적 앱에 포함 가능 | 둘 다 정적 PWA와 호환된다. 보안은 키가 아니라 접근 규칙이 결정한다. |
| 익명 인증 | Supabase Auth Anonymous Sign-ins 지원 | Firebase Auth Anonymous Sign-in 지원 | 둘 다 로그인 화면 없이 UID를 만들 수 있다. |
| 나중에 로그인 전환 | 이메일/소셜 계정 연결 가능 | `linkWithCredential` 계열로 계정 연결 가능 | 기존 익명 UID 유지 또는 데이터 이전 시나리오를 Phase 3.1 이후 검증해야 한다. |
| 현재 데이터 구조 저장 | `payload jsonb`에 `appData` 전체 저장이 자연스럽다 | Firestore 문서 필드에 `payload` 저장 가능 | 전체 백업 단위 저장은 둘 다 쉽다. |
| 보안 모델 | PostgreSQL RLS. `auth.uid() = user_id` 정책으로 소유권 제한 | Firestore Security Rules. `request.auth.uid == userId`로 소유권 제한 | Supabase는 SQL/RLS 이해가 필요하고, Firebase는 Rules 테스트가 중요하다. |
| 백업 단위 저장 | `cloud_backups` 테이블 + JSONB payload | `users/{userId}/cloudBackups/{backupId}` | Phase 3.2 수동 백업에는 둘 다 적합하다. |
| 기록 단위 확장 | 관계형 테이블 설계에 강함 | 문서형/실시간 동기화에 강함 | 가족/권한/통계 쿼리는 Supabase가 명확하고, 오프라인 캐시는 Firebase가 유리하다. |
| 가족 공유 확장 | 가족, 보호자, 권한 테이블을 RLS로 표현하기 좋음 | 문서 경로와 Rules 설계가 중요하며 비정규화가 필요할 수 있음 | 장기 권한 모델은 Supabase가 더 읽기 쉽다. |
| PWA 오프라인 지원 | 기본 내장 동기화는 약함. 외부 동기화 도구 검토 필요 | Firestore 오프라인 지속성 지원이 강점 | 현재 앱은 이미 localStorage 우선이므로 Phase 3 초반에는 큰 차이가 작다. |
| 무료 사용량 | 개인 프로젝트에는 대체로 충분하나 프로젝트 일시정지 등 운영 조건 확인 필요 | 개인 프로젝트에는 대체로 충분하나 읽기/쓰기 비용 예측이 중요 | 정확한 무료 한도는 Phase 3.1 시작 시 공식 가격 문서로 재확인한다. |
| 구현 난이도 | 중간. SQL, RLS, 인덱스 이해 필요 | 낮음~중간. SDK 시작은 쉽지만 Rules 설계가 중요 | 초보 개발자 기준으로 Firebase가 시작은 쉽다. |
| 실수 위험 | RLS 미활성화, service role key 노출, public schema 공개 | `allow read, write: if true`, UID 소유권 미검증, Admin SDK 키 노출 | 두 서비스 모두 인증만으로는 부족하고 권한 규칙이 필수다. |
| 최종 평가 | 장기 데이터 모델과 권한 확장에 유리 | PWA 오프라인/문서형 저장/빠른 시작에 유리 | Phase 3.0은 양쪽 초안을 유지하고, Phase 3.1에서 하나를 선택한다. |

참고한 공식 문서:

- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Anonymous Sign-ins: https://supabase.com/docs/guides/auth/auth-anonymous
- Firebase Anonymous Auth: https://firebase.google.com/docs/auth/web/anonymous-auth
- Firestore Security Rules: https://firebase.google.com/docs/firestore/security/get-started

## 5. 백엔드 선택 권장안

Phase 3.0의 권장안은 다음이다.

```text
설계 문서에는 Supabase와 Firebase 초안을 모두 남긴다.
Phase 3.1 시작 시 PM 또는 사용자가 하나를 선택한다.
```

단, 현재 앱의 장기 방향을 고려한 우선 후보는 Supabase다.

이유:

1. 아기 기록, 가족, 보호자, 권한, 감사 로그는 장기적으로 관계형 모델이 명확하다.
2. `cloud_backups`처럼 백업 단위를 테이블로 관리하기 쉽다.
3. RLS 정책을 데이터베이스 레벨에 둘 수 있어 소유권 규칙이 명시적이다.
4. 기록 단위 저장으로 확장할 때 `records`, `children`, `memberships` 같은 테이블로 나누기 쉽다.

다만 다음 조건을 더 중요하게 보면 Firebase가 더 적합할 수 있다.

- 브라우저 오프라인 캐시와 자동 큐잉을 우선한다.
- 문서형 데이터 저장이 더 익숙하다.
- 초기 설정과 SDK 사용 난이도를 낮추고 싶다.

## 6. 보안 원칙

1. 인증은 식별이고, 권한은 별도 규칙이다.
2. 클라이언트에 보이는 키가 있더라도 RLS 또는 Security Rules로 접근 범위를 제한한다.
3. 서버 백업은 항상 현재 사용자 UID에 종속된다.
4. 다른 사용자의 백업 목록, payload, 메타데이터를 읽을 수 없어야 한다.
5. 인증 없는 전체 read/write는 금지한다.
6. Supabase `service_role` 키와 Firebase Admin SDK 키는 브라우저에 절대 넣지 않는다.
7. 복원 전에는 현재 기기의 localStorage 안전 백업을 반드시 만든다.
8. 서버 오류, 인증 오류, 네트워크 오류는 기존 로컬 기록을 삭제하거나 차단하면 안 된다.
9. Phase 3.1에서 실제 프로젝트를 만들 때 보안 규칙을 먼저 적용하고 연결한다.

## 7. 클라이언트에 넣으면 안 되는 키

다음 값은 `index.html`, 정적 JS, GitHub Pages 배포물, GitHub 저장소에 넣지 않는다.

```text
Supabase service role key
Supabase database password
Supabase direct connection string
Firebase Admin SDK private key
Google Cloud service account JSON
서버 관리자 키
데이터베이스 root password
비공개 API secret
```

클라이언트에 들어갈 수 있는 값:

```text
Supabase publishable/anon key + Supabase Auth + RLS
Firebase Web SDK config + Firebase Auth + Firestore Security Rules
```

중요 원칙:

```text
클라이언트에 보이는 키 자체보다 더 중요한 것은
그 키로 접근 가능한 데이터 범위를 RLS 또는 Security Rules로 제한하는 것이다.
```

## 8. 현재 localStorage 데이터 구조

현재 앱의 기준 데이터는 다음 형태다.

```javascript
{
  schemaVersion: 2,
  profile: {
    babyName: "",
    birthDate: "",
    gender: "",
    createdAt: "",
    updatedAt: ""
  },
  settings: {
    defaultFeedingAmount: 100,
    quickFeedingAmounts: [60, 80, 100, 120],
    recordListLimit: 20,
    timeFormat: "24h",
    rememberLastFeedingAmount: true,
    rememberLastDiaperType: true,
    lastFeedingAmount: null,
    lastDiaperType: "",
    analysisRangeDays: 7,
    defaultAnalysisTab: "summary",
    notifications: {
      enabled: false,
      feedingReminderEnabled: false,
      feedingReminderMinutes: 180,
      diaperReminderEnabled: false,
      diaperReminderMinutes: 180,
      sleepRoutineEnabled: false,
      sleepRoutineStartTime: "21:00",
      sleepRoutineMessage: "수면 루틴을 시작할 시간이에요.",
      quietHoursEnabled: false,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00"
    },
    ui: {
      lifeReportExpandedByDefault: false,
      analysisExpandedByDefault: false
    }
  },
  records: [
    {
      id: "record_unique_id",
      type: "feeding",
      subtype: "formula",
      amount: 100,
      memo: "",
      isSample: false,
      createdAt: "2026-05-20T10:30:00.000Z",
      updatedAt: "2026-05-20T10:30:00.000Z"
    }
  ]
}
```

Phase 3.2의 첫 구현은 이 객체 전체를 서버 백업 `payload`로 저장하는 것이다.

## 9. 서버 백업 단위 데이터 모델

Phase 3 초반에는 기록을 개별 row/document로 실시간 저장하지 않는다. 먼저 `appData` 전체를 하나의 백업 단위로 저장한다.

공통 모델:

```javascript
{
  id: "backup_id",
  user_id: "auth_user_id_or_anonymous_user_id",
  device_id: "device_id",
  app_version: "2.9",
  schema_version: 2,
  backup_type: "manual",
  record_count: 128,
  first_record_at: "2026-05-01T00:00:00.000Z",
  last_record_at: "2026-05-20T17:45:00.000Z",
  baby_name: "튼튼이",
  payload: {
    schemaVersion: 2,
    profile: {},
    settings: {},
    records: []
  },
  created_at: "2026-05-20T17:45:00.000Z",
  updated_at: "2026-05-20T17:45:00.000Z"
}
```

Supabase 테이블 초안:

```sql
create table cloud_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  device_id text,
  app_version text not null,
  schema_version integer not null,
  backup_type text not null default 'manual',
  record_count integer not null default 0,
  first_record_at timestamptz,
  last_record_at timestamptz,
  baby_name text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cloud_backups_user_created_idx
on cloud_backups (user_id, created_at desc);
```

Supabase RLS 초안:

```sql
alter table cloud_backups enable row level security;

create policy "Users can select own backups"
on cloud_backups
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert own backups"
on cloud_backups
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own backups"
on cloud_backups
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own backups"
on cloud_backups
for delete
to authenticated
using ((select auth.uid()) = user_id);
```

Firebase 컬렉션 초안:

```text
users/{userId}/cloudBackups/{backupId}
```

Firestore 문서 예시:

```javascript
{
  deviceId: "device_...",
  appVersion: "2.9",
  schemaVersion: 2,
  backupType: "manual",
  recordCount: 128,
  firstRecordAt: "2026-05-01T00:00:00.000Z",
  lastRecordAt: "2026-05-20T17:45:00.000Z",
  babyName: "튼튼이",
  payload: {
    schemaVersion: 2,
    profile: {},
    settings: {},
    records: []
  },
  createdAt: "...",
  updatedAt: "..."
}
```

Firestore Security Rules 초안:

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/cloudBackups/{backupId} {
      allow read, write: if request.auth != null
        && request.auth.uid == userId;
    }
  }
}
```

## 10. 추후 기록 단위 저장 확장 모델

Phase 3.4 이후에 검토할 확장 모델이다. Phase 3.0~3.3에서는 구현하지 않는다.

Supabase 확장 초안:

```sql
create table baby_records (
  id text primary key,
  user_id uuid not null,
  child_id uuid,
  type text not null,
  subtype text,
  amount integer,
  memo text not null default '',
  is_sample boolean not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);

create index baby_records_user_created_idx
on baby_records (user_id, created_at desc);
```

Firebase 확장 초안:

```text
users/{userId}/records/{recordId}
users/{userId}/profile/current
users/{userId}/settings/current
```

기록 단위 확장 시 추가로 필요한 설계:

- 로컬 record ID와 서버 record ID 매핑
- 삭제 동기화를 위한 `deletedAt`
- 마지막 수정 시각 기반 충돌 감지
- 서버와 로컬의 schema migration
- 가족 공유 시 `userId` 단독 소유 모델에서 `familyId` 기반 모델로 전환

## 11. 익명 인증 또는 임시 사용자 전략

Phase 3 초반 권장 전략:

1. 클라우드 백업을 처음 열 때 익명 인증으로 UID를 만든다.
2. 백업 row/document는 이 UID에 귀속한다.
3. 사용자는 로그인 UI 없이 “이 기기의 클라우드 백업 준비됨” 상태를 본다.
4. 나중에 이메일/Google 로그인 기능을 추가하면 익명 계정을 정식 계정으로 연결한다.

검토 질문 답변:

| 질문 | 답변 |
|---|---|
| 익명 인증만으로 개인 백업 기능이 충분한가? | 같은 브라우저/기기에서 수동 백업을 보관하는 초기 목적에는 충분하다. 다만 기기 변경 복원에는 부족하다. |
| 로그인 없이 서버 백업을 제공할 때 안내가 필요한가? | 필요하다. 브라우저 데이터를 지우면 클라우드 백업 계정 연결이 끊길 수 있다는 짧은 안내가 필요하다. |
| 나중에 로그인으로 전환할 때 데이터 이전은? | 익명 UID를 이메일/소셜 계정에 연결하는 것을 우선 검토한다. 이미 존재하는 계정과 충돌하면 수동 마이그레이션 플로우가 필요하다. |
| 기기 변경 시 복원 기능은 어느 Phase인가? | Phase 3.3에서 같은 계정 기준 복원을 구현하고, 로그인 기반 다기기 복원은 Phase 3.5 이후로 미룬다. |

주의:

- 브라우저 데이터 삭제 시 익명 계정 연결이 끊길 수 있다.
- 익명 계정만으로는 새 기기에서 같은 백업에 접근하기 어렵다.
- 백업 목록에는 “현재 기기에서 만든 클라우드 백업”이라는 표현을 우선 사용한다.

## 12. 클라우드 백업 UI 위치 설계

후보 1:

```text
프로필 | 설정 | 데이터
```

장점:

- 기존 CSV, JSON 백업, 복원, 데이터 진단을 한 곳에 묶을 수 있다.
- 클라우드 백업도 “데이터 관리”의 하위 기능으로 자연스럽다.
- 메인 기록 화면을 복잡하게 만들지 않는다.

후보 2:

```text
프로필 | 설정 | CSV | 클라우드
```

장점:

- 클라우드 기능을 찾기 쉽다.

단점:

- 관리 탭이 늘어나고, 서버 기능이 실제보다 커 보인다.
- CSV와 JSON 백업이 분리되어 데이터 관리 흐름이 흩어진다.

최종 권장안:

```text
프로필 | 설정 | 데이터
```

데이터 탭 내부 구성:

```text
로컬 데이터
- CSV 내보내기
- JSON 백업
- JSON 복원
- 데이터 진단

클라우드 백업
- 서버 연결 상태
- 익명 사용자 상태
- 서버에 백업하기
- 서버 백업 목록 보기
- 서버 백업에서 복원하기
```

UI 원칙:

- 빠른 기록 버튼 위에 클라우드 기능을 배치하지 않는다.
- 서버 상태는 관리 탭 내부에만 조용히 표시한다.
- 서버 오류 배너가 메인 기록 UX를 가리지 않는다.

## 13. 백업 업로드 흐름 설계

Phase 3.2 구현 흐름:

1. 사용자가 관리 탭 > 데이터 > 클라우드 백업으로 이동한다.
2. 서버 연결 상태를 확인한다.
3. 익명 사용자 또는 임시 UID를 확인한다.
4. 현재 `localStorage` 데이터를 읽는다.
5. 데이터 진단을 실행한다.
6. 기록 개수, 기간, `schemaVersion`, 아기 이름을 표시한다.
7. 사용자가 “서버에 백업하기”를 누른다.
8. 서버에 `payload`와 메타데이터를 저장한다.
9. 성공 시 마지막 백업 시각을 표시한다.
10. 실패 시 로컬 데이터는 그대로 유지하고 오류를 안내한다.

백업 전 검증:

- `schemaVersion`이 존재하는가
- `schemaVersion`이 2인가
- `profile`이 객체인가
- `settings`가 객체인가
- `records`가 배열인가
- 각 record에 `id`, `type`, `createdAt`이 있는가
- `createdAt`이 유효한 날짜인가
- payload 크기가 과도하지 않은가

사용자 안내 예시:

```text
현재 기기의 기록 128개를 클라우드에 백업합니다. 로컬 기록은 그대로 유지됩니다.
```

## 14. 백업 복원 흐름 설계

Phase 3.3 구현 흐름:

1. 서버 백업 목록을 조회한다.
2. 백업 날짜, 기록 개수, 앱 버전, 기간, 아기 이름을 표시한다.
3. 사용자가 특정 백업을 선택한다.
4. 서버 백업 미리보기를 표시한다.
5. 현재 `localStorage` 자동 안전 백업을 생성한다.
6. 서버 백업 `payload`를 검증한다.
7. `schemaVersion: 2` 구조로 normalize한다.
8. 검증이 통과한 경우에만 `localStorage`에 복원한다.
9. UI 전체를 재렌더링한다.
10. 리포트, 분석, 알림 상태를 재계산한다.

복원 전 미리보기:

```text
서버 백업 미리보기

백업 날짜: 2026-05-20 17:45
앱 버전: v2.9
기록 개수: 128개
기간: 2026-05-01 ~ 2026-05-20
아기 이름: 튼튼이

복원 전 현재 기기의 데이터는 자동 안전 백업됩니다.
이 백업을 현재 기기에 복원할까요?
```

복원 차단 조건:

- payload가 없음
- records가 배열이 아님
- schemaVersion이 지원 범위 밖임
- 기록 데이터가 심하게 손상됨
- 소유자 UID가 현재 사용자와 다름
- 서버 응답이 불완전함
- record count와 실제 records 개수가 크게 불일치함

자동 보정 가능 조건:

- `updatedAt` 누락: `createdAt` 기준 보정
- `memo` 누락: 빈 문자열
- `isSample` 누락: `false`
- `settings.ui` 누락: 기본값 보정
- `settings.notifications` 누락: 기본값 보정

## 15. 오류/오프라인 처리 원칙

핵심 원칙:

```text
서버 연결 실패 ≠ 앱 사용 불가
인터넷 없음 ≠ 기록 불가
업로드 실패 ≠ 로컬 데이터 손상
복원 실패 ≠ 기존 데이터 삭제
인증 실패 ≠ 기존 localStorage 삭제
```

오류 처리:

- 서버 연결 실패: 관리 탭에만 짧게 표시한다.
- 업로드 실패: `localStorage`를 수정하지 않는다.
- 복원 실패: 기존 데이터를 유지하고 안전 백업도 보존한다.
- 인증 실패: 클라우드 기능만 비활성화하고 빠른 기록은 유지한다.
- 오프라인: 로컬 기록은 계속 저장하고, 클라우드 백업 버튼은 비활성 또는 안내 상태로 둔다.

사용자 안내 문구:

```text
지금은 서버에 연결할 수 없어요. 기록은 이 기기에 안전하게 저장되고 있어요.
```

```text
클라우드 백업에 실패했어요. 로컬 기록은 그대로 유지됩니다.
```

```text
이 백업은 데이터 형식이 맞지 않아 복원하지 않았어요.
```

## 16. Phase 3.1 구현 계획

Phase 3.1 제목:

```text
아기 생활 기록 앱 — Phase 3.1 서버 프로젝트 생성 및 최소 연결
```

목표:

```text
선택한 백엔드 프로젝트를 생성하고,
앱에서 안전하게 서버 연결 상태를 확인할 수 있는 최소 구조를 만든다.
```

구현할 것:

1. Supabase 또는 Firebase 중 하나를 선택한다.
2. 서버 프로젝트를 생성한다.
3. 공개 가능한 클라이언트 설정만 별도 파일 또는 설정 블록으로 분리한다.
4. 익명 사용자 생성 또는 확인 함수를 만든다.
5. 관리 탭 > 데이터 섹션에 클라우드 백업 영역을 추가한다.
6. 서버 연결 상태를 짧게 표시한다.
7. 서버 실패 시 로컬 모드가 유지되도록 한다.
8. 민감 키가 저장소에 들어가지 않았는지 확인한다.

구현하지 않을 것:

- 실제 백업 업로드
- 실제 백업 복원
- 실시간 동기화
- 가족 공유
- 로그인 UI
- 결제

완료 기준:

- 앱은 기존처럼 `localStorage` 기반으로 정상 작동한다.
- 빠른 기록 UX가 변경되지 않는다.
- 서버 연결 상태를 확인할 수 있다.
- 익명 사용자 또는 임시 UID를 확보할 수 있다.
- 서버 연결 실패 시에도 기록이 가능하다.
- PWA 파일이 유지된다.
- 민감 키가 커밋되지 않는다.

## 17. 최종 권장 결론

Phase 3.0에서는 실제 서버 연결을 하지 않는다.

최종 결론:

```text
Phase 3.0에서는 실제 서버 연결을 하지 않는다.
Phase 3.1에서 최소 연결을 시작한다.
Phase 3.2에서 수동 클라우드 백업 업로드를 구현한다.
Phase 3.3에서 서버 백업 복원을 구현한다.
완전 자동 실시간 동기화와 가족 공유는 이후 Phase로 미룬다.
```

백엔드는 Phase 3.1 시작 시 최종 선택한다. 현재 설계 기준의 우선 후보는 Supabase이지만, PWA 오프라인 내장 기능을 최우선하면 Firebase도 충분히 유효하다.

이번 Phase의 핵심은 다음이다.

```text
기존 빠른 기록 UX와 PWA 구조를 유지하면서,
서버 백업/복원으로 확장하기 위한 안전한 설계도를 완성한다.
```
