// 아기 생활 기록 앱 - Phase 3.1 Supabase records 저장
// service_role key, secret key, DB password는 절대 클라이언트에 넣지 않는다.

(function () {
  "use strict";

  const STATUS_EVENT = "baby-cloud-status-change";
  const PLACEHOLDER_URL = "https://YOUR_PROJECT_REF.supabase.co";
  const PLACEHOLDER_KEY = "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY";

  let supabaseClient = null;

  const BabyCloud = {
    provider: "supabase",
    enabled: false,
    ready: false,
    mode: "local",
    status: "not_configured",
    userId: null,
    lastCheckedAt: null,
    lastSavedAt: null,
    lastError: null,

    init: init,
    ensureUser: ensureUser,
    checkConnection: checkConnection,
    testSaveRecord: testSaveRecord,
    testFetchRecords: testFetchRecords,
    saveRecord: saveRecord,
    getSafeStatus: getSafeStatus
  };

  window.BabyCloud = BabyCloud;

  function getConfig() {
    return window.BABY_APP_CLOUD_CONFIG || null;
  }

  function isPlaceholderConfig(config) {
    if (!config) return true;
    return !config.supabaseUrl ||
      !config.supabaseAnonKey ||
      config.supabaseUrl === PLACEHOLDER_URL ||
      config.supabaseAnonKey === PLACEHOLDER_KEY ||
      String(config.supabaseUrl).indexOf("YOUR_PROJECT_REF") !== -1 ||
      String(config.supabaseAnonKey).indexOf("YOUR_SUPABASE") !== -1;
  }

  function normalizeError(error) {
    if (!error) return null;
    return {
      message: error.message || String(error),
      name: error.name || "Error",
      code: error.code || error.status || null
    };
  }

  function errorMessage(error) {
    return (error && error.message) || String(error || "server_save_failed");
  }

  function emitStatus() {
    try {
      window.dispatchEvent(new CustomEvent(STATUS_EVENT, { detail: getSafeStatus() }));
    } catch (error) {
      console.warn("BabyCloud status event failed", error);
    }
  }

  function setState(patch) {
    Object.assign(BabyCloud, patch || {});
    emitStatus();
  }

  function getSafeStatus() {
    return {
      provider: BabyCloud.provider,
      enabled: BabyCloud.enabled,
      ready: BabyCloud.ready,
      mode: BabyCloud.mode,
      status: BabyCloud.status,
      userId: BabyCloud.userId,
      lastCheckedAt: BabyCloud.lastCheckedAt,
      lastSavedAt: BabyCloud.lastSavedAt,
      lastError: BabyCloud.lastError
    };
  }

  function getSupabaseFactory() {
    if (window.supabase && typeof window.supabase.createClient === "function") {
      return window.supabase.createClient;
    }
    return null;
  }

  function getClient() {
    const config = getConfig();
    if (!config || config.provider !== "supabase" || !config.enabled) {
      setState({ enabled: false, ready: false, mode: "local", status: "local_mode", lastError: null });
      return null;
    }
    if (isPlaceholderConfig(config)) {
      setState({
        enabled: true,
        ready: false,
        mode: "local",
        status: "not_configured",
        lastError: { message: "Supabase 설정을 확인해 주세요.", name: "ConfigError", code: "not_configured" }
      });
      return null;
    }
    if (supabaseClient) return supabaseClient;

    const createClient = getSupabaseFactory();
    if (!createClient) {
      setState({
        enabled: true,
        ready: false,
        mode: "local",
        status: "error",
        lastError: { message: "Supabase 클라이언트를 불러오지 못했습니다.", name: "SupabaseClientError", code: "client_missing" }
      });
      return null;
    }

    supabaseClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });
    setState({ enabled: true, mode: "local", status: "checking", lastError: null });
    return supabaseClient;
  }

  async function init() {
    const config = getConfig();
    if (!config || config.provider !== "supabase") {
      setState({ enabled: false, ready: false, mode: "local", status: "not_configured", lastError: null });
      return getSafeStatus();
    }
    if (!config.enabled) {
      setState({ enabled: false, ready: false, mode: "local", status: "local_mode", lastError: null });
      return getSafeStatus();
    }
    if (!getClient()) return getSafeStatus();
    setState({ enabled: true, ready: false, mode: "local", status: "anonymous_ready", lastError: null });
    return getSafeStatus();
  }

  async function ensureUser() {
    const client = getClient();
    if (!client) return null;

    try {
      const sessionResult = await client.auth.getSession();
      if (sessionResult.error) throw sessionResult.error;
      const sessionUser = sessionResult.data && sessionResult.data.session && sessionResult.data.session.user;
      if (sessionUser && sessionUser.id) {
        setState({ enabled: true, userId: sessionUser.id, status: "anonymous_ready", lastError: null });
        return sessionUser;
      }

      const signInResult = await client.auth.signInAnonymously();
      if (signInResult.error) throw signInResult.error;
      const user = signInResult.data && signInResult.data.user;
      if (!user || !user.id) throw new Error("익명 사용자 ID를 확인하지 못했습니다.");
      setState({ enabled: true, userId: user.id, status: "anonymous_ready", lastError: null });
      return user;
    } catch (error) {
      console.warn("BabyCloud anonymous auth failed", error);
      setState({
        ready: false,
        mode: "local",
        status: navigator.onLine === false ? "offline" : "error",
        lastError: normalizeError(error)
      });
      return null;
    }
  }

  async function checkConnection() {
    setState({ status: "checking", ready: false, lastCheckedAt: new Date().toISOString(), lastError: null });
    const client = getClient();
    if (!client) return getSafeStatus();

    const user = await ensureUser();
    if (!user) return getSafeStatus();

    setState({
      enabled: true,
      ready: true,
      mode: "cloud_ready",
      status: "connected",
      userId: user.id,
      lastCheckedAt: new Date().toISOString(),
      lastError: null
    });
    return getSafeStatus();
  }

  function mapRecordToRow(record, userId) {
    if (!record || typeof record !== "object") throw new Error("record is required");
    if (!record.id) throw new Error("record.id is required");
    if (!record.type) throw new Error("record.type is required");
    const createdAt = record.createdAt || new Date().toISOString();
    const updatedAt = record.updatedAt || createdAt;
    const hasAmount = record.amount !== null && record.amount !== undefined && record.amount !== "";
    const amountNumber = hasAmount ? Number(record.amount) : null;

    return {
      record_id: String(record.id),
      user_id: userId,
      family_id: null,
      baby_id: null,
      type: String(record.type),
      subtype: record.subtype ? String(record.subtype) : null,
      amount: Number.isFinite(amountNumber) ? amountNumber : null,
      memo: record.memo ? String(record.memo) : "",
      is_sample: Boolean(record.isSample),
      app_version: (getConfig() && getConfig().appVersion) || "3.1",
      schema_version: Number((getConfig() && getConfig().schemaVersion) || 2),
      payload: record,
      record_created_at: createdAt,
      record_updated_at: updatedAt,
      deleted_at: null
    };
  }

  async function saveRecord(record) {
    const recordId = record && record.id ? record.id : null;
    const config = getConfig();
    if (!config || !config.enabled) {
      setState({ enabled: false, ready: false, mode: "local", status: "local_mode", lastError: null });
      return { ok: false, status: "local_only", recordId: recordId, error: "" };
    }

    try {
      const client = getClient();
      if (!client) return { ok: false, status: "local_only", recordId: recordId, error: "supabase_client_unavailable" };

      const user = BabyCloud.userId ? { id: BabyCloud.userId } : await ensureUser();
      if (!user || !user.id) {
        return { ok: false, status: "error", recordId: recordId, error: "anonymous_auth_failed" };
      }

      const row = mapRecordToRow(record, user.id);
      const result = await client
        .from("records")
        .upsert(row, { onConflict: "user_id,record_id" })
        .select("id,record_id,user_id,record_updated_at")
        .single();

      if (result.error) throw result.error;

      const syncedAt = new Date().toISOString();
      setState({
        enabled: true,
        ready: true,
        mode: "cloud_ready",
        status: "synced",
        userId: user.id,
        lastSavedAt: syncedAt,
        lastError: null
      });
      return { ok: true, status: "synced", recordId: record.id, syncedAt: syncedAt };
    } catch (error) {
      console.warn("BabyCloud record save failed", error);
      setState({
        ready: false,
        mode: "local",
        status: navigator.onLine === false ? "offline" : "save_failed",
        lastError: normalizeError(error)
      });
      return { ok: false, status: "error", recordId: recordId, error: errorMessage(error) };
    }
  }

  async function testSaveRecord() {
    const now = new Date().toISOString();
    const record = {
      id: "test_record_" + Date.now(),
      type: "test",
      subtype: "connection",
      amount: null,
      memo: "Phase 3.1 서버 테스트 저장",
      isSample: true,
      createdAt: now,
      updatedAt: now
    };
    const result = await saveRecord(record);
    if (result.ok) setState({ status: "test_saved", lastSavedAt: result.syncedAt, lastError: null });
    return result;
  }

  async function testFetchRecords() {
    const client = getClient();
    if (!client) return { ok: false, status: "local_only", count: 0, records: [], error: "supabase_client_unavailable" };

    try {
      const user = BabyCloud.userId ? { id: BabyCloud.userId } : await ensureUser();
      if (!user || !user.id) return { ok: false, status: "error", count: 0, records: [], error: "anonymous_auth_failed" };

      const result = await client
        .from("records")
        .select("record_id,type,subtype,memo,is_sample,record_created_at")
        .eq("user_id", user.id)
        .eq("type", "test")
        .order("record_created_at", { ascending: false })
        .limit(5);

      if (result.error) throw result.error;
      setState({ ready: true, mode: "cloud_ready", status: "test_fetched", userId: user.id, lastError: null });
      return { ok: true, status: "test_fetched", count: result.data.length, records: result.data };
    } catch (error) {
      console.warn("BabyCloud test fetch failed", error);
      setState({ ready: false, mode: "local", status: "error", lastError: normalizeError(error) });
      return { ok: false, status: "error", count: 0, records: [], error: errorMessage(error) };
    }
  }

  init();
})();
