# 아기 생활 기록 앱 — Phase 3.1 서버 프로젝트 생성 및 최소 연결

## 0. 현재 프로젝트 상태

이 프로젝트는 한국어 모바일 우선 아기 생활 기록 PWA다.

현재 앱은 Phase 3.0에서 서버 저장 구조 설계를 마친 상태라고 가정한다. 기존 앱은 `localStorage` 기반 `schemaVersion: 2` 데이터를 사용하며, 빠른 기록 UX와 PWA 구조를 유지해야 한다.

현재 주요 작업 위치:

```text
C:\Users\tmddb\my-launchpad\deliverables
```

반드시 보존할 파일:

```text
deliverables/index.html
deliverables/manifest.json
deliverables/service-worker.js
deliverables/sw.js
deliverables/icon-192.svg
deliverables/icon-512.svg
deliverables/icons/icon-192.png
deliverables/icons/icon-512.png
```

## 1. Phase 3.1 목표

Phase 3.1의 목표는 실제 백업/복원이 아니다.

목표:

```text
선택한 백엔드 프로젝트를 생성하고,
앱에서 안전하게 서버 연결 상태를 확인할 수 있는 최소 구조를 만든다.
```

Phase 3.1이 끝나도 앱의 실제 기록 저장 방식은 여전히 `localStorage`가 기준이다.

## 2. Phase 3.1에서 구현할 것

1. Supabase 또는 Firebase 중 하나를 최종 선택한다.
2. 선택한 백엔드 프로젝트를 생성한다.
3. 공개 가능한 클라이언트 설정만 앱에 연결한다.
4. 익명 사용자 생성 또는 확인 흐름을 만든다.
5. 관리 탭에 `데이터` 섹션 또는 클라우드 백업 섹션을 추가한다.
6. 서버 연결 상태를 짧게 표시한다.
7. 서버 연결 실패 시 로컬 모드를 유지한다.
8. 민감 키가 저장소에 들어가지 않았는지 확인한다.

## 3. Phase 3.1에서 구현하지 않을 것

```text
실제 백업 업로드
실제 백업 복원
실시간 동기화
가족 공유
로그인 UI
회원가입 UI
결제
AI 분석
자동 충돌 병합
```

## 4. 백엔드 선택 지침

Phase 3.0 설계 기준:

- 장기 데이터 모델, 가족 공유, 권한 관리, SQL 기반 확장을 우선하면 Supabase를 선택한다.
- PWA 오프라인 내장 지원, 빠른 시작, 문서형 저장을 우선하면 Firebase를 선택한다.

Phase 3.1 시작 전 PM 또는 사용자가 다음 중 하나를 선택한다.

```text
1. Supabase 우선
2. Firebase 우선
3. 한 라운드 더 결정 유보
```

결정을 유보하더라도 Phase 3.1에서는 실제 연결 대상을 하나로 줄이는 편이 안전하다.

## 5. Supabase 선택 시 최소 작업

### 5.1 프로젝트 생성

Supabase Dashboard에서 새 프로젝트를 만든다.

확인할 항목:

- Project URL
- publishable/anon key
- Auth Anonymous Sign-ins 사용 가능 여부
- Database Table Editor 또는 SQL Editor 접근 가능 여부

### 5.2 보안 기본값

Phase 3.1에서는 실제 백업 테이블을 만들지 않아도 된다. 만들 경우에는 RLS를 먼저 켠 뒤 정책을 적용한다.

금지:

```text
service_role key를 index.html에 넣기
RLS 없이 public table 열기
익명/비로그인 전체 read/write 허용
```

### 5.3 클라이언트 설정 예시

실제 값은 Phase 3.1 작업자가 프로젝트 생성 후 입력한다.

```javascript
const CLOUD_CONFIG = {
  provider: "supabase",
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_PUBLISHABLE_OR_ANON_KEY"
};
```

주의:

```text
이 설정에는 service_role key가 절대 들어가면 안 된다.
```

### 5.4 최소 연결 완료 기준

- Supabase 클라이언트를 초기화할 수 있다.
- 익명 사용자 생성 또는 세션 확인을 시도할 수 있다.
- 성공/실패 상태를 관리 탭에 표시할 수 있다.
- 실패해도 빠른 기록 버튼은 그대로 작동한다.

## 6. Firebase 선택 시 최소 작업

### 6.1 프로젝트 생성

Firebase Console에서 새 프로젝트를 만든다.

확인할 항목:

- Web App config
- Firebase Authentication Anonymous provider
- Firestore Database 생성 여부
- Firestore Security Rules 배포 가능 여부

### 6.2 보안 기본값

Phase 3.1에서 Firestore를 만들 경우 최소 Rules는 사용자 UID 소유권을 기준으로 한다.

금지:

```text
allow read, write: if true;
request.auth != null만으로 모든 사용자 데이터 접근 허용
Firebase Admin SDK private key를 index.html에 넣기
service account JSON을 저장소에 커밋하기
```

### 6.3 클라이언트 설정 예시

```javascript
const CLOUD_CONFIG = {
  provider: "firebase",
  firebaseConfig: {
    apiKey: "YOUR_WEB_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    appId: "YOUR_APP_ID"
  }
};
```

주의:

```text
Firebase Web SDK config는 공개될 수 있지만,
Firestore Security Rules와 Firebase Auth 없이 안전하지 않다.
```

### 6.4 최소 연결 완료 기준

- Firebase 앱을 초기화할 수 있다.
- 익명 로그인 성공/실패를 확인할 수 있다.
- Firestore 접근은 Security Rules로 제한된다.
- 실패해도 빠른 기록 UX는 변경되지 않는다.

## 7. 앱 파일 변경 범위

Phase 3.1에서 변경 가능성이 있는 파일:

```text
deliverables/index.html
deliverables/service-worker.js
deliverables/sw.js
```

원칙:

- 가능하면 `index.html` 변경을 작게 유지한다.
- 빠른 기록 버튼 영역은 수정하지 않는다.
- 관리 탭 내부에만 클라우드 상태 UI를 추가한다.
- PWA 파일을 삭제하거나 이름을 바꾸지 않는다.
- Service Worker 캐시 목록에 새 파일을 추가할 때 기존 캐시 대상은 제거하지 않는다.

권장 UI 위치:

```text
관리 탭 > 데이터 > 클라우드 백업
```

## 8. 클라우드 상태 UI 초안

관리 탭 내부에만 표시한다.

```text
클라우드 백업

상태: 연결 확인 전
사용자: 이 기기 임시 사용자

[연결 확인]
```

상태 문구:

```text
연결됨
지금은 서버에 연결할 수 없어요. 기록은 이 기기에 안전하게 저장되고 있어요.
익명 사용자 준비됨
```

Phase 3.1에서는 다음 버튼을 비활성 또는 준비 중 상태로 둔다.

```text
서버에 백업하기
서버 백업에서 복원하기
```

## 9. 빠른 기록 UX 보존 원칙

다음 동작은 변경하지 않는다.

```text
수유 클릭 → 즉시 기록
기저귀 클릭 → 옵션 선택 후 즉시 기록
트림 클릭 → 즉시 기록
잠듦 클릭 → 즉시 기록
깨어남 클릭 → 즉시 기록
```

금지:

```text
기록 시 로그인 요구
기록 시 서버 연결 대기
기록 시 클라우드 오류 모달 표시
빠른 기록 버튼 아래로 밀어내기
서버 실패 시 기록 차단
```

## 10. 보안 체크리스트

Phase 3.1 완료 전 확인한다.

- Supabase `service_role` key가 클라이언트 파일에 없는가
- Firebase Admin SDK private key가 클라이언트 파일에 없는가
- Google Cloud service account JSON이 저장소에 없는가
- `.env` 또는 설정 파일에 민감 키가 커밋되지 않았는가
- RLS 또는 Security Rules 없이 데이터 접근을 열지 않았는가
- 인증된 UID와 데이터 소유자 UID를 비교하는가
- 브라우저 콘솔 오류가 빠른 기록 기능을 막지 않는가

검색 예시:

```powershell
Select-String -Path .\deliverables\* -Pattern "service_role","private_key","service_account","BEGIN PRIVATE KEY" -SimpleMatch
```

## 11. 테스트 시나리오

### 11.1 기본 동작

1. 앱을 연다.
2. 기존 빠른 기록 버튼으로 기록한다.
3. 새 기록이 즉시 목록에 표시되는지 확인한다.
4. 새로고침 후 기록이 유지되는지 확인한다.

### 11.2 서버 연결 성공

1. 관리 탭 > 데이터 > 클라우드 백업으로 이동한다.
2. 연결 확인을 실행한다.
3. 익명 사용자 또는 임시 UID가 준비되는지 확인한다.
4. 실제 백업 업로드 버튼은 동작하지 않거나 준비 중으로 표시되는지 확인한다.

### 11.3 서버 연결 실패

1. 네트워크를 끄거나 잘못된 설정으로 실행한다.
2. 관리 탭에 조용한 실패 문구가 표시되는지 확인한다.
3. 빠른 기록이 계속 가능한지 확인한다.
4. 기존 `localStorage` 데이터가 삭제되지 않았는지 확인한다.

### 11.4 PWA 파일 확인

```powershell
Test-Path .\deliverables\index.html
Test-Path .\deliverables\manifest.json
Test-Path .\deliverables\service-worker.js
Test-Path .\deliverables\sw.js
Test-Path .\deliverables\icon-192.svg
Test-Path .\deliverables\icon-512.svg
Test-Path .\deliverables\icons\icon-192.png
Test-Path .\deliverables\icons\icon-512.png
```

모두 `True`여야 한다.

## 12. 완료 기준

Phase 3.1 완료 기준:

```text
앱은 기존처럼 localStorage 기반으로 정상 작동한다.
서버 연결 상태를 확인할 수 있다.
익명 사용자 또는 임시 userId를 확보할 수 있다.
서버 연결 실패 시에도 빠른 기록이 정상 작동한다.
PWA 구조가 유지된다.
민감 키가 GitHub에 커밋되지 않는다.
실제 백업 업로드/복원은 아직 구현하지 않는다.
```

## 13. 다음 Phase 예고

Phase 3.2:

```text
현재 localStorage 전체 데이터를 서버에 수동 백업으로 업로드한다.
```

Phase 3.3:

```text
서버 백업 목록을 조회하고, 선택한 백업을 검증한 뒤 localStorage에 복원한다.
복원 전 현재 기기 데이터는 반드시 자동 안전 백업한다.
```

Phase 3.4 이후:

```text
수동 동기화, 여러 기기 사용, 기록 단위 저장, 가족 공유를 순차적으로 검토한다.
```
