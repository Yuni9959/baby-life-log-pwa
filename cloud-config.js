// 아기 생활 기록 앱 - Phase 3.7.1 Supabase 설정
// 이 파일에는 service_role key, secret key, DB password를 절대 넣지 않는다.
// Publishable Key는 브라우저에서 사용할 수 있지만, 반드시 RLS와 함께 사용해야 한다.

window.BABY_APP_CLOUD_CONFIG = {
  provider: "supabase",

  // 이번 Phase에서는 서버 연결 테스트와 새 기록 서버 저장을 위해 true로 둔다.
  // 문제가 생기면 false로 바꾸면 앱은 로컬 모드로 작동해야 한다.
  enabled: true,

  supabaseUrl: "https://vburjgyfjhgtkulabrnf.supabase.co",

  // Supabase Publishable Key
  // service_role key 또는 secret key가 아니다.
  supabaseAnonKey: "sb_publishable_o1NUthUHmVjaH4f-j186ng_AbspdQwa",

  appVersion: "3.7.1",
  schemaVersion: 2,
  debug: true
};
