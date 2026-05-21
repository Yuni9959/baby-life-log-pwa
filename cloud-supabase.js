// Baby life log - Phase 3.6 Supabase sync helpers.
// Client-safe only: never put service_role keys, DB passwords, or direct DB URLs here.

(function () {
  "use strict";

  const STATUS_EVENT = "baby-cloud-status-change";
  const CLOUD_CONTEXT_KEY = "babyAppCloudContext";
  const DEVICE_ID_KEY = "babyAppDeviceId";
  const APP_STORAGE_KEY = "baby_life_log_app_v2";
  const LAST_SYNC_DIAGNOSIS_KEY = "babyAppLastSyncDiagnosis";
  const LAST_FULL_CONNECTION_DIAGNOSTIC_KEY = "babyAppLastFullConnectionDiagnostic";
  const LAST_SYNC_SUMMARY_KEY = "babyAppLastSyncSummary";
  const LAST_RETRY_RESULT_KEY = "babyAppLastRetryResult";
  const BABY_CLOUD_APP_VERSION = "3.6";
  const PLACEHOLDER_URL = "https://YOUR_PROJECT_REF.supabase.co";
  const PLACEHOLDER_KEY = "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY";
  const CLOUD_STATUSES = [
    "local_only",
    "pending",
    "synced",
    "error",
    "deleted_pending",
    "deleted_synced",
    "deleted_error"
  ];
  const RETRY_STATUSES = ["pending", "error", "deleted_pending", "deleted_error"];

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
    lastUpdatedAt: null,
    lastDeletedAt: null,
    lastSetupAt: null,
    lastError: null,

    init: init,
    ensureUser: ensureUser,
    checkConnection: checkConnection,
    testSaveRecord: testSaveRecord,
    testFetchRecords: testFetchRecords,
    saveRecord: saveRecord,
    fetchRecords: fetchRecords,
    normalizeServerRecord: normalizeServerRowToLocalRecord,
    buildMergePreview: buildMergePreview,
    mergeServerRecordsIntoLocal: mergeServerRecordsIntoLocal,
    getSafeStatus: getSafeStatus,

    getOrCreateDeviceId: getOrCreateDeviceId,
    ensureDefaultFamilyAndBaby: ensureDefaultFamilyAndBaby,
    getCloudContext: getCloudContext,
    saveCloudContext: saveCloudContext,
    fetchCurrentBaby: fetchCurrentBaby,
    syncLocalProfileToBaby: syncLocalProfileToBaby,
    buildProfileSyncPreview: buildProfileSyncPreview,
    assignExistingRecordsToCurrentFamilyBaby: assignExistingRecordsToCurrentFamilyBaby,
    repairLocalRecordsCloudContext: repairLocalRecordsCloudContext,
    diagnoseFamilyBabyStructure: diagnoseFamilyBabyStructure,
    mapLocalRecordToServerRow: mapLocalRecordToServerRow,
    normalizeServerRowToLocalRecord: normalizeServerRowToLocalRecord,
    updateRecord: updateRecord,
    softDeleteRecord: softDeleteRecord,
    softDeleteRecords: softDeleteRecords,
    retryPendingMutations: retryPendingMutations,
    getRecordCloudStatus: getRecordCloudStatus,
    getSyncSummary: getSyncSummary,
    updateRecordCloudStatus: updateRecordCloudStatus,
    diagnoseConnection: diagnoseConnection,
    runFullConnectionDiagnostic: runFullConnectionDiagnostic,
    testAuthConnection: testAuthConnection,
    testDiagnosticsInsertSelect: testDiagnosticsInsertSelect,
    testFamilyBabyInsertSelect: testFamilyBabyInsertSelect,
    testRecordInsertSelectUpdateDelete: testRecordInsertSelectUpdateDelete,
    getLastDiagnosticResult: getLastDiagnosticResult,
    renderDiagnosticResult: renderDiagnosticResult,
    retryPendingRecords: retryPendingRecords,
    retryRecordSync: retryRecordSync,
    getHumanStatusMessage: getHumanStatusMessage
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

  function isObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function safeIso(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  function normalizeRecordCloud(record) {
    const cloud = record && isObject(record.cloud) ? record.cloud : {};
    let status = CLOUD_STATUSES.includes(cloud.status) ? cloud.status : "local_only";
    if (record && record.deletedAt) {
      if (status === "synced") status = "deleted_synced";
      else if (status === "error") status = "deleted_error";
      else if (status === "pending") status = "deleted_pending";
      else if (!["deleted_pending", "deleted_synced", "deleted_error"].includes(status)) status = "deleted_pending";
    } else if (status.indexOf("deleted_") === 0) {
      status = "local_only";
    }
    return {
      status: status,
      syncedAt: safeIso(cloud.syncedAt),
      error: cloud.error ? String(cloud.error).slice(0, 300) : "",
      familyId: cloud.familyId || null,
      babyId: cloud.babyId || null,
      lastAttemptAt: safeIso(cloud.lastAttemptAt),
      retryCount: Math.max(0, Math.round(Number(cloud.retryCount) || 0))
    };
  }

  function getRecordCloudStatus(record) {
    const cloud = normalizeRecordCloud(record || {});
    const meta = {
      local_only: { label: "로컬 전용", tone: "local" },
      pending: { label: "동기화 대기", tone: "waiting" },
      synced: { label: "서버 저장됨", tone: "ok" },
      error: { label: "서버 오류", tone: "error" },
      deleted_pending: { label: "삭제 동기화 중", tone: "deleted" },
      deleted_synced: { label: "삭제 반영됨", tone: "deleted" },
      deleted_error: { label: "삭제 서버 오류", tone: "error" }
    }[cloud.status] || { label: "로컬 전용", tone: "local" };
    return Object.assign({}, cloud, meta);
  }

  function getSyncSummary(records) {
    const list = Array.isArray(records) ? records : [];
    const summary = {
      total: list.length,
      visibleTotal: 0,
      deletedTotal: 0,
      synced: 0,
      pending: 0,
      error: 0,
      localOnly: 0,
      deletedPending: 0,
      deletedSynced: 0,
      deletedError: 0,
      needsRetry: 0,
      lastSyncedAt: null,
      hasServerError: false
    };
    list.forEach(function (record) {
      const state = getRecordCloudStatus(record);
      const deleted = !!(record && record.deletedAt);
      if (deleted) summary.deletedTotal += 1;
      else summary.visibleTotal += 1;

      if (state.status === "synced") summary.synced += 1;
      else if (state.status === "pending") summary.pending += 1;
      else if (state.status === "error") summary.error += 1;
      else if (state.status === "local_only") summary.localOnly += 1;
      else if (state.status === "deleted_pending") summary.deletedPending += 1;
      else if (state.status === "deleted_synced") summary.deletedSynced += 1;
      else if (state.status === "deleted_error") summary.deletedError += 1;

      if (RETRY_STATUSES.includes(state.status)) summary.needsRetry += 1;
      if (state.status === "error" || state.status === "deleted_error") summary.hasServerError = true;
      if (state.syncedAt && (!summary.lastSyncedAt || new Date(state.syncedAt) > new Date(summary.lastSyncedAt))) {
        summary.lastSyncedAt = state.syncedAt;
      }
    });
    try {
      window.localStorage.setItem(LAST_SYNC_SUMMARY_KEY, JSON.stringify(Object.assign({ createdAt: nowIso() }, summary)));
    } catch (error) {
      console.warn("BabyCloud sync summary storage failed", error);
    }
    return summary;
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
    return (error && error.message) || String(error || "server_sync_failed");
  }

  function classifyCloudError(error) {
    const message = errorMessage(error);
    const code = error && (error.code || error.status || error.name);
    const lower = String(message || "").toLowerCase();
    let kind = "unknown";
    let userMessage = message;

    if (code === "42501" || lower.indexOf("row-level security") !== -1 || lower.indexOf("permission denied") !== -1 || lower.indexOf("policy") !== -1) {
      kind = "rls";
      userMessage = "DB 보안 정책 때문에 요청이 거부된 것 같아요. RLS 정책을 확인해 주세요.";
    } else if (lower.indexOf("relation") !== -1 && lower.indexOf("does not exist") !== -1) {
      kind = "missing_table";
      userMessage = "필요한 테이블을 찾지 못했어요. SQL Editor에서 Phase 3.3~3.6 SQL을 실행했는지 확인해 주세요.";
    } else if (lower.indexOf("failed to fetch") !== -1 || lower.indexOf("network") !== -1 || lower.indexOf("load failed") !== -1) {
      kind = "network";
      userMessage = "네트워크 또는 Supabase CDN 연결을 확인해 주세요.";
    } else if (lower.indexOf("anonymous") !== -1 || lower.indexOf("signup") !== -1 || lower.indexOf("auth") !== -1) {
      kind = "auth";
      userMessage = "익명 사용자 연결에 실패했어요. Supabase Dashboard에서 Anonymous sign-ins가 켜져 있는지 확인해 주세요.";
    }

    return { kind: kind, code: code || null, message: message, userMessage: userMessage };
  }

  function getConfigAppVersion() {
    return (getConfig() && getConfig().appVersion) || BABY_CLOUD_APP_VERSION;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function getOrCreateDeviceId() {
    try {
      const existing = window.localStorage.getItem(DEVICE_ID_KEY);
      if (existing && /^device_\d+_[a-z0-9]+$/i.test(existing)) return existing;
      const random = Math.random().toString(36).slice(2, 10);
      const next = "device_" + Date.now() + "_" + random;
      window.localStorage.setItem(DEVICE_ID_KEY, next);
      return next;
    } catch (error) {
      return "device_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
    }
  }

  function normalizeGender(value) {
    const raw = String(value || "").trim().toLowerCase();
    const map = {
      male: "male",
      boy: "male",
      "남아": "male",
      female: "female",
      girl: "female",
      "여아": "female",
      unknown: "unknown",
      "선택 안 함": "unknown",
      unspecified: "unspecified"
    };
    return map[raw] || "unknown";
  }

  function normalizeProfileSnapshot(profile) {
    const source = isObject(profile) ? profile : {};
    return {
      babyName: String(source.babyName || source.name || "").trim() || "아기",
      birthDate: /^\d{4}-\d{2}-\d{2}$/.test(String(source.birthDate || "")) ? String(source.birthDate) : null,
      gender: normalizeGender(source.gender)
    };
  }

  function isValidDate(value) {
    return !!value && !Number.isNaN(new Date(value).getTime());
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
    const context = getCloudContext();
    return {
      provider: BabyCloud.provider,
      enabled: BabyCloud.enabled,
      ready: BabyCloud.ready,
      mode: BabyCloud.mode,
      status: BabyCloud.status,
      userId: BabyCloud.userId || context.currentUserId || null,
      currentFamilyId: context.currentFamilyId || null,
      currentBabyId: context.currentBabyId || null,
      deviceId: context.deviceId || null,
      familyName: context.familyName || null,
      babyName: context.babyName || null,
      babyBirthDate: context.babyBirthDate || null,
      babyGender: context.babyGender || null,
      lastCheckedAt: BabyCloud.lastCheckedAt,
      lastSavedAt: BabyCloud.lastSavedAt,
      lastUpdatedAt: BabyCloud.lastUpdatedAt,
      lastDeletedAt: BabyCloud.lastDeletedAt,
      lastSetupAt: BabyCloud.lastSetupAt || context.lastSetupAt || null,
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
        lastError: { message: "Supabase config is not set.", name: "ConfigError", code: "not_configured" }
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
        lastError: { message: "Supabase client is not loaded.", name: "SupabaseClientError", code: "client_missing" }
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
      if (!user || !user.id) throw new Error("anonymous_auth_failed");
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
    setState({ status: "checking", ready: false, lastCheckedAt: nowIso(), lastError: null });
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
      lastCheckedAt: nowIso(),
      lastError: null
    });
    return getSafeStatus();
  }

  function readStoredAppData() {
    try {
      const raw = window.localStorage.getItem(APP_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.warn("BabyCloud app data read failed", error);
      return null;
    }
  }

  function writeStoredAppData(appData) {
    try {
      window.localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(appData));
      return true;
    } catch (error) {
      console.warn("BabyCloud app data write failed", error);
      return false;
    }
  }

  function getCloudContext() {
    let context = {};
    const appData = readStoredAppData();
    if (appData && isObject(appData.cloud)) {
      context = Object.assign({}, appData.cloud);
    }
    try {
      const raw = window.localStorage.getItem(CLOUD_CONTEXT_KEY);
      context = Object.assign({}, context, raw ? JSON.parse(raw) : {});
    } catch (error) {
      context = context || {};
    }
    return {
      provider: "supabase",
      currentFamilyId: context.currentFamilyId || null,
      currentBabyId: context.currentBabyId || null,
      currentUserId: context.currentUserId || BabyCloud.userId || null,
      deviceId: context.deviceId || getOrCreateDeviceId(),
      familyName: context.familyName || "우리 가족",
      babyName: context.babyName || "아기",
      babyBirthDate: context.babyBirthDate || null,
      babyGender: context.babyGender || "unknown",
      lastSetupAt: context.lastSetupAt || null,
      lastProfileSyncAt: context.lastProfileSyncAt || null,
      lastError: context.lastError || "",
      lastSyncAt: context.lastSyncAt || null,
      lastUpdateSyncAt: context.lastUpdateSyncAt || null,
      lastDeleteSyncAt: context.lastDeleteSyncAt || null
    };
  }

  function saveCloudContext(context) {
    const source = context || {};
    const current = getCloudContext();
    const next = Object.assign({}, getCloudContext(), {
      provider: "supabase",
      currentFamilyId: source.currentFamilyId || source.familyId || current.currentFamilyId || null,
      currentBabyId: source.currentBabyId || source.babyId || current.currentBabyId || null,
      currentUserId: source.currentUserId || source.userId || BabyCloud.userId || current.currentUserId || null,
      deviceId: source.deviceId || current.deviceId || getOrCreateDeviceId(),
      familyName: source.familyName || current.familyName || "우리 가족",
      babyName: source.babyName || current.babyName || "아기",
      babyBirthDate: source.babyBirthDate !== undefined ? source.babyBirthDate : (current.babyBirthDate || null),
      babyGender: source.babyGender || current.babyGender || "unknown",
      lastSetupAt: source.lastSetupAt || current.lastSetupAt || nowIso(),
      lastProfileSyncAt: source.lastProfileSyncAt || current.lastProfileSyncAt || null,
      lastError: source.lastError !== undefined ? String(source.lastError || "").slice(0, 300) : (current.lastError || ""),
      lastSyncAt: source.lastSyncAt || current.lastSyncAt || null,
      lastUpdateSyncAt: source.lastUpdateSyncAt || current.lastUpdateSyncAt || null,
      lastDeleteSyncAt: source.lastDeleteSyncAt || current.lastDeleteSyncAt || null
    });
    try {
      window.localStorage.setItem(CLOUD_CONTEXT_KEY, JSON.stringify(next));
    } catch (error) {
      console.warn("BabyCloud cloud context storage failed", error);
    }
    const appData = readStoredAppData();
    if (appData && isObject(appData)) {
      appData.cloud = next;
      writeStoredAppData(appData);
    }
    setState({
      userId: next.currentUserId,
      lastSetupAt: next.lastSetupAt,
      lastUpdatedAt: next.lastUpdateSyncAt || BabyCloud.lastUpdatedAt,
      lastDeletedAt: next.lastDeleteSyncAt || BabyCloud.lastDeletedAt
    });
    return next;
  }

  function profileDefaults() {
    const appData = readStoredAppData();
    const profile = appData && isObject(appData.profile) ? appData.profile : {};
    return normalizeProfileSnapshot(profile);
  }

  async function ensureDefaultFamilyAndBaby() {
    const client = getClient();
    if (!client) return null;

    try {
      setState({ status: "checking", lastError: null });
      const user = await ensureUser();
      if (!user || !user.id) throw new Error("anonymous_auth_failed");

      const deviceId = getOrCreateDeviceId();
      let context = getCloudContext();
      if (context.currentFamilyId && context.currentBabyId) {
        const babyCheck = await client
          .from("babies")
          .select("id,family_id,name,birth_date,gender")
          .eq("id", context.currentBabyId)
          .eq("family_id", context.currentFamilyId)
          .maybeSingle();
        if (!babyCheck.error && babyCheck.data) {
          context = saveCloudContext(Object.assign({}, context, {
            currentUserId: user.id,
            deviceId: deviceId,
            babyName: babyCheck.data.name || context.babyName || "아기",
            babyBirthDate: babyCheck.data.birth_date || null,
            babyGender: babyCheck.data.gender || "unknown",
            lastSetupAt: nowIso()
          }));
          setState({ ready: true, mode: "cloud_ready", status: "family_ready", userId: user.id, lastError: null });
          return context;
        }
      }

      const membershipResult = await client
        .from("family_members")
        .select("family_id,role,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (membershipResult.error) throw membershipResult.error;

      let familyId = membershipResult.data && membershipResult.data.family_id;
      if (!familyId) {
        const familyResult = await client
          .from("families")
          .insert({ name: "우리 가족" })
          .select("id")
          .single();
        if (familyResult.error) throw familyResult.error;
        familyId = familyResult.data && familyResult.data.id;
        if (!familyId) throw new Error("family_create_failed");

        const memberResult = await client
          .from("family_members")
          .insert({ family_id: familyId, user_id: user.id, role: "owner" })
          .select("id")
          .single();
        if (memberResult.error) throw memberResult.error;
      }

      const babyResult = await client
        .from("babies")
        .select("id,family_id,name,birth_date,gender")
        .eq("family_id", familyId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (babyResult.error) throw babyResult.error;

      let babyId = babyResult.data && babyResult.data.id;
      if (!babyId) {
        const defaults = profileDefaults();
        const createBabyResult = await client
          .from("babies")
          .insert({ family_id: familyId, name: defaults.babyName, birth_date: defaults.birthDate, gender: defaults.gender })
          .select("id,family_id,name,birth_date,gender")
          .single();
        if (createBabyResult.error) throw createBabyResult.error;
        babyResult.data = createBabyResult.data;
        babyId = createBabyResult.data && createBabyResult.data.id;
      }

      if (!familyId || !babyId) throw new Error("family_or_baby_missing");
      context = saveCloudContext({
        currentFamilyId: familyId,
        currentBabyId: babyId,
        currentUserId: user.id,
        deviceId: deviceId,
        familyName: "우리 가족",
        babyName: (babyResult.data && babyResult.data.name) || "아기",
        babyBirthDate: (babyResult.data && babyResult.data.birth_date) || null,
        babyGender: (babyResult.data && babyResult.data.gender) || "unknown",
        lastSetupAt: nowIso()
      });
      setState({
        enabled: true,
        ready: true,
        mode: "cloud_ready",
        status: "family_ready",
        userId: user.id,
        lastCheckedAt: nowIso(),
        lastError: null
      });
      return context;
    } catch (error) {
      console.warn("BabyCloud family/baby setup failed", error);
      setState({
        ready: false,
        mode: "local",
        status: navigator.onLine === false ? "offline" : "error",
        lastError: normalizeError(error)
      });
      return null;
    }
  }

  async function fetchCurrentBaby() {
    const client = getClient();
    if (!client) return { ok: false, error: "supabase_client_unavailable", baby: null };
    const context = await ensureDefaultFamilyAndBaby();
    if (!context || !context.currentFamilyId || !context.currentBabyId) {
      return { ok: false, error: "family_baby_context_missing", baby: null };
    }
    try {
      const result = await client
        .from("babies")
        .select("id,family_id,name,birth_date,gender,created_at,updated_at")
        .eq("id", context.currentBabyId)
        .eq("family_id", context.currentFamilyId)
        .maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) return { ok: false, error: "baby_not_found", baby: null };
      saveCloudContext(Object.assign({}, context, {
        babyName: result.data.name || "아기",
        babyBirthDate: result.data.birth_date || null,
        babyGender: result.data.gender || "unknown"
      }));
      return { ok: true, baby: result.data, context: getCloudContext() };
    } catch (error) {
      saveCloudContext(Object.assign({}, context, { lastError: errorMessage(error) }));
      return { ok: false, error: errorMessage(error), baby: null, context: context };
    }
  }

  async function syncLocalProfileToBaby(profile) {
    const client = getClient();
    if (!client) return { ok: false, error: "supabase_client_unavailable" };
    const context = await ensureDefaultFamilyAndBaby();
    if (!context || !context.currentFamilyId || !context.currentBabyId) {
      return { ok: false, error: "family_baby_context_missing" };
    }
    const snapshot = normalizeProfileSnapshot(profile || (readStoredAppData() || {}).profile || {});
    try {
      const result = await client
        .from("babies")
        .update({
          name: snapshot.babyName || "아기",
          birth_date: snapshot.birthDate || null,
          gender: snapshot.gender,
          updated_at: nowIso()
        })
        .eq("id", context.currentBabyId)
        .eq("family_id", context.currentFamilyId)
        .select("id,family_id,name,birth_date,gender,updated_at")
        .maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) throw new Error("baby_update_not_applied");
      const syncedAt = result.data.updated_at || nowIso();
      const nextContext = saveCloudContext(Object.assign({}, context, {
        babyName: result.data.name || snapshot.babyName,
        babyBirthDate: result.data.birth_date || null,
        babyGender: result.data.gender || snapshot.gender,
        lastProfileSyncAt: syncedAt,
        lastError: ""
      }));
      return { ok: true, syncedAt: syncedAt, baby: result.data, context: nextContext };
    } catch (error) {
      saveCloudContext(Object.assign({}, context, { lastError: errorMessage(error) }));
      return { ok: false, error: errorMessage(error), message: "프로필은 이 기기에 저장됐어요. 서버 반영은 나중에 다시 시도할 수 있어요." };
    }
  }

  async function buildProfileSyncPreview(localProfile) {
    const local = normalizeProfileSnapshot(localProfile || (readStoredAppData() || {}).profile || {});
    const result = await fetchCurrentBaby();
    if (!result.ok) {
      return { ok: false, local: local, server: null, differences: [], hasDifferences: false, error: result.error };
    }
    const baby = result.baby || {};
    const server = {
      babyName: baby.name || "아기",
      birthDate: baby.birth_date || null,
      gender: baby.gender || "unknown"
    };
    const differences = [];
    [
      ["babyName", local.babyName, server.babyName],
      ["birthDate", local.birthDate, server.birthDate],
      ["gender", local.gender, server.gender]
    ].forEach(function (item) {
      if (String(item[1] || "") !== String(item[2] || "")) {
        differences.push({ field: item[0], localValue: item[1], serverValue: item[2] });
      }
    });
    return { ok: true, local: local, server: server, differences: differences, hasDifferences: differences.length > 0 };
  }

  async function assignExistingRecordsToCurrentFamilyBaby() {
    const client = getClient();
    if (!client) return { ok: false, scanned: 0, repaired: 0, skipped: 0, failed: 0, error: "supabase_client_unavailable" };
    const context = await ensureDefaultFamilyAndBaby();
    if (!context || !context.currentUserId || !context.currentFamilyId || !context.currentBabyId) {
      return { ok: false, scanned: 0, repaired: 0, skipped: 0, failed: 0, error: "family_baby_context_missing" };
    }
    try {
      const rowsResult = await client
        .from("records")
        .select("id,client_id,family_id,baby_id,device_id")
        .eq("user_id", context.currentUserId)
        .or("family_id.is.null,baby_id.is.null")
        .limit(500);
      if (rowsResult.error) throw rowsResult.error;
      const rows = Array.isArray(rowsResult.data) ? rowsResult.data : [];
      let repaired = 0;
      let failed = 0;
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const patch = {
          family_id: row.family_id || context.currentFamilyId,
          baby_id: row.baby_id || context.currentBabyId,
          device_id: row.device_id || context.deviceId || getOrCreateDeviceId()
        };
        const update = await client
          .from("records")
          .update(patch)
          .eq("id", row.id)
          .eq("user_id", context.currentUserId)
          .select("id")
          .maybeSingle();
        if (update.error || !update.data) failed += 1;
        else repaired += 1;
      }
      return { ok: failed === 0, scanned: rows.length, repaired: repaired, skipped: 0, failed: failed };
    } catch (error) {
      return { ok: false, scanned: 0, repaired: 0, skipped: 0, failed: 1, error: errorMessage(error) };
    }
  }

  function repairLocalRecordsCloudContext(appData) {
    const shouldPersist = !(appData && isObject(appData));
    const target = shouldPersist ? readStoredAppData() : appData;
    const context = getCloudContext();
    if (!target || !Array.isArray(target.records)) {
      return { ok: false, scanned: 0, repaired: 0, skipped: 0, error: "invalid_app_data" };
    }
    let repaired = 0;
    target.records.forEach(function (record) {
      if (!record || !isObject(record)) return;
      const before = JSON.stringify(record.cloud || {});
      const normalized = normalizeRecordCloud(record);
      record.cloud = Object.assign({}, normalized, {
        familyId: normalized.familyId || context.currentFamilyId || null,
        babyId: normalized.babyId || context.currentBabyId || null
      });
      if (JSON.stringify(record.cloud || {}) !== before) repaired += 1;
    });
    if (shouldPersist) writeStoredAppData(target);
    return { ok: true, scanned: target.records.length, repaired: repaired, skipped: target.records.length - repaired, context: context };
  }

  async function diagnoseFamilyBabyStructure() {
    const diagnosis = {
      ok: false,
      checkedAt: nowIso(),
      userId: null,
      familyId: null,
      babyId: null,
      deviceId: getOrCreateDeviceId(),
      familyName: "",
      babyName: "",
      babyBirthDate: null,
      babyGender: "unknown",
      profileMatchesBaby: false,
      serverRecordsMissingFamilyId: 0,
      serverRecordsMissingBabyId: 0,
      localRecordsNeedingCloudContext: 0,
      error: ""
    };
    try {
      const client = getClient();
      if (!client) throw new Error("supabase_client_unavailable");
      const context = await ensureDefaultFamilyAndBaby();
      if (!context) throw new Error("family_baby_context_missing");
      diagnosis.userId = context.currentUserId;
      diagnosis.familyId = context.currentFamilyId;
      diagnosis.babyId = context.currentBabyId;
      diagnosis.deviceId = context.deviceId || diagnosis.deviceId;

      const familyResult = await client.from("families").select("id,name").eq("id", context.currentFamilyId).maybeSingle();
      if (!familyResult.error && familyResult.data) diagnosis.familyName = familyResult.data.name || "우리 가족";
      const babyResult = await fetchCurrentBaby();
      if (babyResult.ok && babyResult.baby) {
        diagnosis.babyName = babyResult.baby.name || "아기";
        diagnosis.babyBirthDate = babyResult.baby.birth_date || null;
        diagnosis.babyGender = babyResult.baby.gender || "unknown";
      }
      const preview = await buildProfileSyncPreview((readStoredAppData() || {}).profile || {});
      diagnosis.profileMatchesBaby = !!(preview.ok && !preview.hasDifferences);

      const missingFamily = await client.from("records").select("id", { count: "exact", head: true }).eq("user_id", context.currentUserId).is("family_id", null);
      const missingBaby = await client.from("records").select("id", { count: "exact", head: true }).eq("user_id", context.currentUserId).is("baby_id", null);
      diagnosis.serverRecordsMissingFamilyId = missingFamily.error ? 0 : (missingFamily.count || 0);
      diagnosis.serverRecordsMissingBabyId = missingBaby.error ? 0 : (missingBaby.count || 0);

      const appData = readStoredAppData();
      const records = appData && Array.isArray(appData.records) ? appData.records : [];
      diagnosis.localRecordsNeedingCloudContext = records.filter(function (record) {
        return record && (!record.cloud || !record.cloud.familyId || !record.cloud.babyId);
      }).length;
      diagnosis.ok = !!(diagnosis.userId && diagnosis.familyId && diagnosis.babyId && diagnosis.deviceId);
      return diagnosis;
    } catch (error) {
      diagnosis.error = errorMessage(error);
      return diagnosis;
    }
  }

  function mapRecordType(type) {
    const value = String(type || "");
    const map = {
      feeding: "feeding",
      burp: "burp",
      diaper: "diaper",
      sleep: "sleep_start",
      sleep_start: "sleep_start",
      sleep_end: "sleep_end",
      wake: "wake",
      custom: "custom",
      test: "test"
    };
    return map[value] || "custom";
  }

  function mapServerTypeToLocalType(type) {
    const value = String(type || "");
    if (value === "sleep_start") return "sleep";
    return value || "custom";
  }

  function mapRecordSubtype(record) {
    const type = mapRecordType(record && record.type);
    const subtype = String((record && record.subtype) || "").trim();
    if (type === "diaper") {
      const diaperMap = {
        pee: "pee",
        poop: "poop",
        pee_poop: "pee_poop",
        wet: "pee",
        dirty: "poop",
        mixed: "pee_poop",
        urine: "pee",
        stool: "poop",
        both: "pee_poop",
        "소변": "pee",
        "대변": "poop",
        "소변+대변": "pee_poop"
      };
      return diaperMap[subtype] || null;
    }
    if (type === "feeding") {
      const feedingMap = {
        formula: "formula",
        breast: "breast",
        pumped: "pumped",
        "분유": "formula",
        "모유": "breast",
        "유축": "pumped"
      };
      return feedingMap[subtype] || null;
    }
    if (type === "test" && subtype === "connection") return "connection";
    return null;
  }

  function mapServerSubtypeToLocalSubtype(type, subtype) {
    const serverType = String(type || "");
    const value = String(subtype || "");
    if (serverType === "diaper") {
      if (value === "pee") return "urine";
      if (value === "poop") return "stool";
      if (value === "pee_poop") return "both";
    }
    return value;
  }

  function getRecordAmountMl(record) {
    if (!record || mapRecordType(record.type) !== "feeding") return null;
    if (record.amount === null || record.amount === undefined || record.amount === "") return null;
    const amount = Math.round(Number(record.amount));
    return Number.isFinite(amount) && amount >= 0 ? amount : null;
  }

  function mapLocalRecordToServerRow(record, context) {
    if (!record || typeof record !== "object") throw new Error("record is required");
    if (!record.id) throw new Error("record.id is required");
    const ctx = context || getCloudContext();
    if (!ctx.currentFamilyId) throw new Error("family_id is required");
    if (!ctx.currentBabyId) throw new Error("baby_id is required");
    const createdAt = isValidDate(record.createdAt) ? new Date(record.createdAt).toISOString() : nowIso();
    const updatedAt = isValidDate(record.updatedAt) ? new Date(record.updatedAt).toISOString() : createdAt;
    const amountMl = getRecordAmountMl(record);
    const note = record.memo ? String(record.memo) : "";
    const payload = Object.assign({}, record, {
      updatedAt: updatedAt,
      deletedAt: record.deletedAt || null
    });
    return {
      family_id: ctx.currentFamilyId || null,
      baby_id: ctx.currentBabyId || null,
      user_id: ctx.currentUserId || BabyCloud.userId || null,
      client_id: String(record.id),
      record_id: String(record.id),
      device_id: ctx.deviceId || getOrCreateDeviceId(),
      type: mapRecordType(record.type),
      subtype: mapRecordSubtype(record),
      amount_ml: amountMl,
      note: note,
      recorded_at: createdAt,
      deleted_at: record.deletedAt || null,
      amount: amountMl,
      memo: note,
      is_sample: Boolean(record.isSample),
      app_version: getConfigAppVersion(),
      schema_version: Number((getConfig() && getConfig().schemaVersion) || 2),
      payload: payload
    };
  }

  function normalizeAmount(value) {
    if (value === null || value === undefined || value === "") return null;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  function normalizeServerRowToLocalRecord(row) {
    if (!isObject(row)) return { ok: false, reason: "row_not_object", row: row };
    const clientId = row.client_id || row.record_id;
    if (!clientId) return { ok: false, reason: "missing_client_id", row: row };
    const payload = isObject(row.payload) ? row.payload : {};
    const createdAt = payload.createdAt || row.recorded_at || row.record_created_at || row.created_at;
    const updatedAt = payload.updatedAt || row.record_updated_at || row.updated_at || row.recorded_at || row.created_at;
    if (!isValidDate(createdAt) || !isValidDate(updatedAt)) return { ok: false, reason: "invalid_date", row: row };

    const localType = payload.type || mapServerTypeToLocalType(row.type);
    const record = {
      id: String(clientId),
      type: String(localType || "custom"),
      subtype: payload.subtype || mapServerSubtypeToLocalSubtype(row.type, row.subtype) || "",
      amount: normalizeAmount(payload.amount !== undefined ? payload.amount : (row.amount_ml !== undefined ? row.amount_ml : row.amount)),
      memo: payload.memo !== undefined ? String(payload.memo || "") : String(row.note !== undefined ? row.note || "" : row.memo || ""),
      isSample: Boolean(payload.isSample !== undefined ? payload.isSample : row.is_sample),
      createdAt: new Date(createdAt).toISOString(),
      updatedAt: new Date(updatedAt).toISOString(),
      deletedAt: row.deleted_at || payload.deletedAt || null,
      cloud: {
        status: "synced",
        syncedAt: row.updated_at || row.created_at || nowIso(),
        error: "",
        familyId: row.family_id || null,
        babyId: row.baby_id || null
      }
    };
    return { ok: true, record: record, row: row };
  }

  function updateStoredRecordCloud(recordId, cloudPatch) {
    const appData = readStoredAppData();
    if (!appData || !Array.isArray(appData.records)) return false;
    let changed = false;
    appData.records = appData.records.map(function (record) {
      if (!record || String(record.id) !== String(recordId)) return record;
      changed = true;
      const currentCloud = normalizeRecordCloud(record);
      return Object.assign({}, record, {
        cloud: normalizeRecordCloud(Object.assign({}, record, { cloud: Object.assign({}, currentCloud, cloudPatch || {}) }))
      });
    });
    return changed ? writeStoredAppData(appData) : false;
  }

  function updateRecordCloudStatus(recordId, nextCloud) {
    return updateStoredRecordCloud(recordId, nextCloud);
  }

  async function saveRecord(record) {
    const recordId = record && record.id ? record.id : null;
    if (getConfig() && getConfig().debug) console.log("[BabyCloud] saveRecord start", recordId, record && record.type);
    const config = getConfig();
    if (!config || !config.enabled) {
      setState({ enabled: false, ready: false, mode: "local", status: "local_mode", lastError: null });
      return { ok: false, status: "local_only", recordId: recordId, error: "" };
    }

    try {
      const client = getClient();
      if (!client) return { ok: false, status: "local_only", recordId: recordId, error: "supabase_client_unavailable" };
      const context = await ensureDefaultFamilyAndBaby();
      if (!context || !context.currentFamilyId || !context.currentBabyId) {
        return { ok: false, status: "error", recordId: recordId, error: "family_baby_setup_failed" };
      }

      const row = mapLocalRecordToServerRow(record, context);
      const updateResult = await client
        .from("records")
        .update(row)
        .eq("family_id", context.currentFamilyId)
        .eq("baby_id", context.currentBabyId)
        .eq("client_id", String(record.id))
        .select("id,client_id,updated_at")
        .maybeSingle();
      if (updateResult.error) throw updateResult.error;

      let savedRow = updateResult.data;
      if (!savedRow) {
        const insertResult = await client
          .from("records")
          .insert(row)
          .select("id,client_id,updated_at")
          .single();
        if (insertResult.error) {
          if (insertResult.error.code === "23505") {
            const retryResult = await client
              .from("records")
              .update(row)
              .eq("family_id", context.currentFamilyId)
              .eq("baby_id", context.currentBabyId)
              .eq("client_id", String(record.id))
              .select("id,client_id,updated_at")
              .single();
            if (retryResult.error) throw retryResult.error;
            savedRow = retryResult.data;
          } else {
            throw insertResult.error;
          }
        } else {
          savedRow = insertResult.data;
        }
      }

      const syncedAt = (savedRow && savedRow.updated_at) || nowIso();
      const nextContext = saveCloudContext(Object.assign({}, context, { lastSyncAt: syncedAt }));
      setState({
        enabled: true,
        ready: true,
        mode: "cloud_ready",
        status: "synced",
        userId: nextContext.currentUserId,
        lastSavedAt: syncedAt,
        lastError: null
      });
      if (getConfig() && getConfig().debug) console.log("[BabyCloud] saveRecord success", { recordId: record.id, syncedAt: syncedAt });
      return { ok: true, status: "synced", recordId: record.id, syncedAt: syncedAt };
    } catch (error) {
      if (getConfig() && getConfig().debug) console.warn("[BabyCloud] saveRecord failed", error);
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

  async function updateRecord(record) {
    const recordId = record && record.id ? record.id : null;
    if (getConfig() && getConfig().debug) console.log("[BabyCloud] updateRecord start", recordId, record && record.type);
    try {
      const client = getClient();
      if (!client) return { ok: false, status: "local_only", recordId: recordId, error: "supabase_client_unavailable" };
      const context = await ensureDefaultFamilyAndBaby();
      if (!context || !context.currentFamilyId || !context.currentBabyId) return { ok: false, status: "error", recordId: recordId, error: "family_baby_context_missing" };
      const row = mapLocalRecordToServerRow(record, context);
      const result = await client
        .from("records")
        .update(row)
        .eq("family_id", context.currentFamilyId)
        .eq("baby_id", context.currentBabyId)
        .eq("client_id", String(record.id))
        .select("id,client_id,updated_at")
        .maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) return saveRecord(record);
      const syncedAt = result.data.updated_at || nowIso();
      saveCloudContext(Object.assign({}, context, { lastSyncAt: syncedAt, lastUpdateSyncAt: syncedAt }));
      setState({ ready: true, mode: "cloud_ready", status: "synced", lastUpdatedAt: syncedAt, lastError: null });
      if (getConfig() && getConfig().debug) console.log("[BabyCloud] updateRecord success", { recordId: record.id, syncedAt: syncedAt });
      return { ok: true, status: "synced", recordId: record.id, syncedAt: syncedAt };
    } catch (error) {
      if (getConfig() && getConfig().debug) console.warn("[BabyCloud] updateRecord failed", error);
      console.warn("BabyCloud record update failed", error);
      setState({ ready: false, mode: "local", status: navigator.onLine === false ? "offline" : "save_failed", lastError: normalizeError(error) });
      return { ok: false, status: "error", recordId: recordId, error: errorMessage(error) };
    }
  }

  async function softDeleteRecord(record) {
    const recordId = record && record.id ? record.id : null;
    if (getConfig() && getConfig().debug) console.log("[BabyCloud] softDeleteRecord start", recordId, record && record.type);
    try {
      const client = getClient();
      if (!client) return { ok: false, status: "local_only", recordId: recordId, error: "supabase_client_unavailable" };
      const context = await ensureDefaultFamilyAndBaby();
      if (!context || !context.currentFamilyId || !context.currentBabyId) return { ok: false, status: "error", recordId: recordId, error: "family_baby_context_missing" };
      const deletedAt = record.deletedAt || nowIso();
      const row = mapLocalRecordToServerRow(Object.assign({}, record, { deletedAt: deletedAt }), context);
      const result = await client
        .from("records")
        .update(row)
        .eq("family_id", context.currentFamilyId)
        .eq("baby_id", context.currentBabyId)
        .eq("client_id", String(record.id))
        .select("id,client_id,updated_at,deleted_at")
        .maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) {
        const saveResult = await saveRecord(Object.assign({}, record, { deletedAt: deletedAt }));
        if (!saveResult.ok) return saveResult;
      }
      const syncedAt = (result.data && (result.data.updated_at || result.data.deleted_at)) || nowIso();
      saveCloudContext(Object.assign({}, context, { lastSyncAt: syncedAt, lastDeleteSyncAt: syncedAt }));
      setState({ ready: true, mode: "cloud_ready", status: "synced", lastDeletedAt: syncedAt, lastError: null });
      if (getConfig() && getConfig().debug) console.log("[BabyCloud] softDeleteRecord success", { recordId: record.id, syncedAt: syncedAt, deletedAt: deletedAt });
      return { ok: true, status: "synced", recordId: record.id, syncedAt: syncedAt, deletedAt: deletedAt };
    } catch (error) {
      if (getConfig() && getConfig().debug) console.warn("[BabyCloud] softDeleteRecord failed", error);
      console.warn("BabyCloud record soft delete failed", error);
      setState({ ready: false, mode: "local", status: navigator.onLine === false ? "offline" : "save_failed", lastError: normalizeError(error) });
      return { ok: false, status: "error", recordId: recordId, error: errorMessage(error) };
    }
  }

  async function softDeleteRecords(records) {
    const list = Array.isArray(records) ? records : [];
    const results = [];
    for (let i = 0; i < list.length; i += 1) {
      results.push(await softDeleteRecord(list[i]));
    }
    const okCount = results.filter(function (result) { return result && result.ok; }).length;
    return { ok: okCount === list.length, count: list.length, okCount: okCount, results: results };
  }

  async function retryPendingMutations(records) {
    return retryPendingRecords({ records: Array.isArray(records) ? records : ((readStoredAppData() || {}).records || []) });
  }

  async function retryRecordSync(record) {
    const startedAt = nowIso();
    const state = getRecordCloudStatus(record);
    updateStoredRecordCloud(record && record.id, {
      status: state.status,
      lastAttemptAt: startedAt,
      retryCount: state.retryCount
    });
    try {
      let result;
      if (record && record.deletedAt) {
        result = await softDeleteRecord(record);
      } else if (state.status === "local_only") {
        result = await saveRecord(record);
      } else if (state.status === "pending" || state.status === "error") {
        result = await updateRecord(record);
      } else {
        return { ok: true, status: "skipped", recordId: record && record.id, skipped: true };
      }

      if (result && result.ok) {
        const syncedAt = result.syncedAt || nowIso();
        const nextStatus = record && record.deletedAt ? "deleted_synced" : "synced";
        updateStoredRecordCloud(record.id, {
          status: nextStatus,
          syncedAt: syncedAt,
          error: "",
          lastAttemptAt: startedAt,
          familyId: (getCloudContext() || {}).currentFamilyId || state.familyId || null,
          babyId: (getCloudContext() || {}).currentBabyId || state.babyId || null
        });
        return Object.assign({}, result, { ok: true, status: nextStatus, syncedAt: syncedAt });
      }

      throw new Error((result && result.error) || "sync_failed");
    } catch (error) {
      const nextStatus = record && record.deletedAt ? "deleted_error" : "error";
      const retryCount = (state.retryCount || 0) + 1;
      updateStoredRecordCloud(record && record.id, {
        status: nextStatus,
        syncedAt: null,
        error: errorMessage(error),
        lastAttemptAt: startedAt,
        retryCount: retryCount
      });
      return { ok: false, status: nextStatus, recordId: record && record.id, error: errorMessage(error) };
    }
  }

  async function retryPendingRecords(appData, options) {
    const opts = options || {};
    const target = appData && Array.isArray(appData.records) ? appData : readStoredAppData();
    const records = target && Array.isArray(target.records) ? target.records : [];
    const statuses = Array.isArray(opts.statuses) && opts.statuses.length ? opts.statuses : RETRY_STATUSES.slice();
    if (opts.includeLocalOnly && !statuses.includes("local_only")) statuses.push("local_only");
    const targets = records.filter(function (record) {
      return record && statuses.includes(getRecordCloudStatus(record).status);
    });
    const summary = {
      ok: true,
      attempted: targets.length,
      succeeded: 0,
      failed: 0,
      skipped: records.length - targets.length,
      finishedAt: null,
      results: []
    };
    for (let i = 0; i < targets.length; i += 1) {
      const result = await retryRecordSync(targets[i]);
      summary.results.push(result);
      if (result && result.ok) summary.succeeded += 1;
      else summary.failed += 1;
      await new Promise(function (resolve) { setTimeout(resolve, 0); });
    }
    summary.ok = summary.failed === 0;
    summary.finishedAt = nowIso();
    const refreshed = readStoredAppData();
    if (appData && Array.isArray(appData.records) && refreshed && Array.isArray(refreshed.records)) {
      appData.records = refreshed.records;
      appData.cloud = refreshed.cloud || appData.cloud;
    }
    try {
      window.localStorage.setItem(LAST_RETRY_RESULT_KEY, JSON.stringify(summary));
    } catch (error) {
      console.warn("BabyCloud retry result storage failed", error);
    }
    return summary;
  }

  function createFullDiagnosticSkeleton() {
    return {
      ok: false,
      checkedAt: nowIso(),
      appVersion: BABY_CLOUD_APP_VERSION,
      configAppVersion: getConfigAppVersion(),
      babyCloudAppVersion: BABY_CLOUD_APP_VERSION,
      checks: {
        configExists: false,
        enabled: false,
        supabaseLibraryLoaded: false,
        clientCreated: false,
        online: typeof navigator === "undefined" ? true : navigator.onLine !== false,
        authSession: false,
        userId: false,
        diagnosticsInsert: false,
        diagnosticsSelect: false,
        familyReady: false,
        babyReady: false,
        familyMemberReady: false,
        recordsInsert: false,
        recordsSelect: false,
        recordsUpdate: false,
        recordsSoftDelete: false
      },
      ids: {},
      errors: []
    };
  }

  function addDiagnosticError(result, step, error) {
    const classified = classifyCloudError(error);
    result.errors.push({
      step: step,
      kind: classified.kind,
      code: classified.code,
      message: classified.message,
      userMessage: classified.userMessage
    });
  }

  function failDiagnosticStep(result, step, message) {
    addDiagnosticError(result, step, new Error(message));
    const error = new Error(message);
    error.__babyCloudDiagnosticRecorded = true;
    throw error;
  }

  function storeFullDiagnostic(result) {
    try {
      window.localStorage.setItem(LAST_FULL_CONNECTION_DIAGNOSTIC_KEY, JSON.stringify(result));
    } catch (error) {
      console.warn("BabyCloud full diagnostic storage failed", error);
    }
    return result;
  }

  function getLastDiagnosticResult() {
    try {
      const raw = window.localStorage.getItem(LAST_FULL_CONNECTION_DIAGNOSTIC_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function renderDiagnosticResult(result) {
    const source = result || getLastDiagnosticResult();
    if (!source) return "아직 전체 서버 연결 진단을 실행하지 않았어요.";
    const labels = {
      configExists: "cloud-config 로드",
      enabled: "enabled 상태",
      supabaseLibraryLoaded: "Supabase 라이브러리 로드",
      clientCreated: "Supabase client 생성",
      online: "네트워크 상태",
      authSession: "익명 Auth session",
      userId: "익명 userId",
      diagnosticsInsert: "cloud_diagnostics insert",
      diagnosticsSelect: "cloud_diagnostics select",
      familyReady: "family 준비",
      familyMemberReady: "family_members 연결",
      babyReady: "baby 준비",
      recordsInsert: "records insert",
      recordsSelect: "records select",
      recordsUpdate: "records update",
      recordsSoftDelete: "records soft delete"
    };
    const lines = ["Supabase 실제 연결 진단"];
    Object.keys(labels).forEach(function (key) {
      lines.push((source.checks && source.checks[key] ? "OK " : "FAIL ") + labels[key]);
    });
    lines.push("마지막 진단 시각: " + (source.checkedAt || "-"));
    if (source.errors && source.errors.length) {
      lines.push("마지막 오류: " + (source.errors[source.errors.length - 1].userMessage || source.errors[source.errors.length - 1].message));
    } else if (source.ok) {
      lines.push("서버 연결이 실제로 확인됐어요. Supabase Table Editor에서도 row를 확인해 보세요.");
    }
    return lines.join("\n");
  }

  async function testAuthConnection() {
    const client = getClient();
    if (!client) return { ok: false, userId: null, error: "supabase_client_unavailable" };
    try {
      const sessionResult = await client.auth.getSession();
      if (sessionResult.error) throw sessionResult.error;
      let user = sessionResult.data && sessionResult.data.session && sessionResult.data.session.user;
      if (!user || !user.id) {
        const signInResult = await client.auth.signInAnonymously();
        if (signInResult.error) throw signInResult.error;
        user = signInResult.data && signInResult.data.user;
      }
      if (!user || !user.id) throw new Error("anonymous_auth_failed");
      setState({ enabled: true, userId: user.id, status: "anonymous_ready", lastError: null });
      saveCloudContext(Object.assign({}, getCloudContext(), { currentUserId: user.id, deviceId: getOrCreateDeviceId() }));
      return { ok: true, userId: user.id, user: user };
    } catch (error) {
      const classified = classifyCloudError(error);
      setState({ ready: false, mode: "local", status: navigator.onLine === false ? "offline" : "error", lastError: normalizeError(error) });
      return { ok: false, userId: null, error: classified.userMessage, rawError: errorMessage(error), kind: classified.kind };
    }
  }

  async function testDiagnosticsInsertSelect() {
    const client = getClient();
    if (!client) return { ok: false, error: "supabase_client_unavailable" };
    try {
      const auth = await testAuthConnection();
      if (!auth.ok || !auth.userId) throw new Error(auth.error || "anonymous_auth_failed");
      const deviceId = getOrCreateDeviceId();
      const row = {
        user_id: auth.userId,
        device_id: deviceId,
        check_type: "phase3_6_manual",
        status: "ok",
        message: "Phase 3.6 diagnostic insert/select test",
        app_version: BABY_CLOUD_APP_VERSION,
        client_created_at: nowIso()
      };
      const insertResult = await client
        .from("cloud_diagnostics")
        .insert(row)
        .select("id,user_id,device_id,status,app_version,created_at")
        .single();
      if (insertResult.error) throw insertResult.error;
      const inserted = insertResult.data;
      if (!inserted || !inserted.id) throw new Error("diagnostics_insert_missing_row");
      const selectResult = await client
        .from("cloud_diagnostics")
        .select("id,user_id,device_id,status,app_version,created_at")
        .eq("id", inserted.id)
        .maybeSingle();
      if (selectResult.error) throw selectResult.error;
      if (!selectResult.data || selectResult.data.user_id !== auth.userId) throw new Error("diagnostics_select_user_mismatch");
      return { ok: true, diagnosticId: inserted.id, userId: auth.userId, deviceId: deviceId, row: selectResult.data };
    } catch (error) {
      const classified = classifyCloudError(error);
      return { ok: false, error: classified.userMessage, rawError: errorMessage(error), kind: classified.kind };
    }
  }

  async function testFamilyBabyInsertSelect() {
    const client = getClient();
    if (!client) return { ok: false, error: "supabase_client_unavailable" };
    try {
      const context = await ensureDefaultFamilyAndBaby();
      if (!context || !context.currentUserId || !context.currentFamilyId || !context.currentBabyId) {
        throw new Error("family_baby_context_missing");
      }
      const familyResult = await client.from("families").select("id,name,created_at").eq("id", context.currentFamilyId).maybeSingle();
      if (familyResult.error) throw familyResult.error;
      if (!familyResult.data) throw new Error("family_select_missing");
      const memberResult = await client
        .from("family_members")
        .select("id,family_id,user_id,role")
        .eq("family_id", context.currentFamilyId)
        .eq("user_id", context.currentUserId)
        .maybeSingle();
      if (memberResult.error) throw memberResult.error;
      if (!memberResult.data) throw new Error("family_member_select_missing");
      const babyResult = await client.from("babies").select("id,family_id,name,birth_date,gender").eq("id", context.currentBabyId).maybeSingle();
      if (babyResult.error) throw babyResult.error;
      if (!babyResult.data) throw new Error("baby_select_missing");
      return {
        ok: true,
        userId: context.currentUserId,
        familyId: context.currentFamilyId,
        babyId: context.currentBabyId,
        family: familyResult.data,
        member: memberResult.data,
        baby: babyResult.data
      };
    } catch (error) {
      const classified = classifyCloudError(error);
      return { ok: false, error: classified.userMessage, rawError: errorMessage(error), kind: classified.kind };
    }
  }

  async function testRecordInsertSelectUpdateDelete() {
    const client = getClient();
    if (!client) return { ok: false, error: "supabase_client_unavailable" };
    try {
      const context = await ensureDefaultFamilyAndBaby();
      if (!context || !context.currentUserId || !context.currentFamilyId || !context.currentBabyId) {
        throw new Error("family_baby_context_missing");
      }
      const now = nowIso();
      const testRecord = {
        id: "diagnostic_record_" + Date.now(),
        type: "test",
        subtype: "connection",
        amount: null,
        memo: "Phase 3.6 records insert/select/update/soft-delete test",
        isSample: true,
        createdAt: now,
        updatedAt: now
      };
      const row = mapLocalRecordToServerRow(testRecord, context);
      const insertResult = await client
        .from("records")
        .insert(row)
        .select("id,client_id,note,deleted_at,updated_at")
        .single();
      if (insertResult.error) throw insertResult.error;
      if (!insertResult.data || !insertResult.data.id) throw new Error("records_insert_missing_row");

      const selectResult = await client
        .from("records")
        .select("id,client_id,note,deleted_at,updated_at")
        .eq("client_id", testRecord.id)
        .maybeSingle();
      if (selectResult.error) throw selectResult.error;
      if (!selectResult.data) throw new Error("records_select_missing_row");

      const updateNote = "Phase 3.6 update test completed";
      const updateResult = await client
        .from("records")
        .update({
          note: updateNote,
          memo: updateNote,
          updated_at: nowIso(),
          payload: Object.assign({}, testRecord, { memo: updateNote, updatedAt: nowIso() })
        })
        .eq("client_id", testRecord.id)
        .select("id,client_id,note,updated_at")
        .maybeSingle();
      if (updateResult.error) throw updateResult.error;
      if (!updateResult.data || updateResult.data.note !== updateNote) throw new Error("records_update_not_applied");

      const deletedAt = nowIso();
      const deleteResult = await client
        .from("records")
        .update({ deleted_at: deletedAt, updated_at: deletedAt })
        .eq("client_id", testRecord.id)
        .select("id,client_id,deleted_at,updated_at")
        .maybeSingle();
      if (deleteResult.error) throw deleteResult.error;
      if (!deleteResult.data || !deleteResult.data.deleted_at) throw new Error("records_soft_delete_not_applied");

      return {
        ok: true,
        testRecordId: testRecord.id,
        serverRecordId: insertResult.data.id,
        inserted: insertResult.data,
        selected: selectResult.data,
        updated: updateResult.data,
        deleted: deleteResult.data
      };
    } catch (error) {
      const classified = classifyCloudError(error);
      return { ok: false, error: classified.userMessage, rawError: errorMessage(error), kind: classified.kind };
    }
  }

  async function runFullConnectionDiagnostic() {
    const result = createFullDiagnosticSkeleton();
    const config = getConfig();
    result.checks.configExists = !!(config && config.provider === "supabase");
    result.checks.enabled = !!(config && config.enabled);
    result.checks.supabaseLibraryLoaded = !!getSupabaseFactory();
    result.checks.online = typeof navigator === "undefined" ? true : navigator.onLine !== false;
    result.configAppVersion = config && config.appVersion ? config.appVersion : null;

    try {
      if (!result.checks.configExists) failDiagnosticStep(result, "configExists", "cloud-config.js를 찾지 못했어요.");
      if (!result.checks.enabled) failDiagnosticStep(result, "enabled", "서버 저장이 비활성화되어 있어요. cloud-config.js의 enabled 값을 확인해 주세요.");
      if (!result.checks.supabaseLibraryLoaded) failDiagnosticStep(result, "supabaseLibraryLoaded", "Supabase 라이브러리가 로드되지 않았어요. CDN 로드 또는 네트워크 상태를 확인해 주세요.");
      const client = getClient();
      result.checks.clientCreated = !!client;
      if (!client) failDiagnosticStep(result, "clientCreated", "Supabase client is not available");

      const auth = await testAuthConnection();
      result.checks.authSession = !!(auth && auth.ok);
      result.checks.userId = !!(auth && auth.userId);
      if (!auth.ok) failDiagnosticStep(result, "authSession", auth.error || "anonymous_auth_failed");
      result.ids.userId = auth.userId;

      const diagnostics = await testDiagnosticsInsertSelect();
      result.checks.diagnosticsInsert = !!(diagnostics && diagnostics.ok && diagnostics.diagnosticId);
      result.checks.diagnosticsSelect = !!(diagnostics && diagnostics.ok);
      if (!diagnostics.ok) failDiagnosticStep(result, "diagnosticsInsert", diagnostics.error || "diagnostics_insert_select_failed");
      result.ids.diagnosticId = diagnostics.diagnosticId;

      const familyBaby = await testFamilyBabyInsertSelect();
      result.checks.familyReady = !!(familyBaby && familyBaby.ok && familyBaby.familyId);
      result.checks.babyReady = !!(familyBaby && familyBaby.ok && familyBaby.babyId);
      result.checks.familyMemberReady = !!(familyBaby && familyBaby.ok && familyBaby.member);
      if (!familyBaby.ok) failDiagnosticStep(result, "familyReady", familyBaby.error || "family_baby_insert_select_failed");
      result.ids.familyId = familyBaby.familyId;
      result.ids.babyId = familyBaby.babyId;

      const recordTest = await testRecordInsertSelectUpdateDelete();
      result.checks.recordsInsert = !!(recordTest && recordTest.ok && recordTest.inserted);
      result.checks.recordsSelect = !!(recordTest && recordTest.ok && recordTest.selected);
      result.checks.recordsUpdate = !!(recordTest && recordTest.ok && recordTest.updated);
      result.checks.recordsSoftDelete = !!(recordTest && recordTest.ok && recordTest.deleted);
      if (!recordTest.ok) failDiagnosticStep(result, "recordsInsert", recordTest.error || "records_crud_test_failed");
      result.ids.testRecordId = recordTest.testRecordId;
      result.ids.serverRecordId = recordTest.serverRecordId;

      result.ok = Object.keys(result.checks).every(function (key) { return !!result.checks[key]; });
      setState({ ready: result.ok, mode: result.ok ? "cloud_ready" : "local", status: result.ok ? "connected" : "error", lastCheckedAt: result.checkedAt, lastError: null });
    } catch (error) {
      if (!error || !error.__babyCloudDiagnosticRecorded) {
        addDiagnosticError(result, "runFullConnectionDiagnostic", error);
      }
      result.ok = false;
      setState({ ready: false, mode: "local", status: result.checks.online ? "error" : "offline", lastCheckedAt: result.checkedAt, lastError: normalizeError(error) });
    }

    return storeFullDiagnostic(result);
  }

  async function diagnoseConnection() {
    const checkedAt = nowIso();
    const config = getConfig();
    const checks = {
      config: !!config && config.provider === "supabase" && !isPlaceholderConfig(config),
      enabled: !!(config && config.enabled),
      client: false,
      online: typeof navigator === "undefined" ? true : navigator.onLine !== false,
      auth: false,
      family: false,
      baby: false,
      familyMembersSelect: false,
      familiesSelect: false,
      babiesSelect: false,
      recordsSelect: false
    };
    const diagnosis = {
      ok: false,
      mode: "local",
      status: "local_mode",
      userId: null,
      familyId: null,
      babyId: null,
      checkedAt: checkedAt,
      checks: checks,
      error: ""
    };

    try {
      if (!checks.config) throw new Error("Supabase config not available");
      if (!checks.enabled) {
        diagnosis.status = "local_mode";
        return diagnosis;
      }

      const client = getClient();
      checks.client = !!client;
      if (!client) throw new Error("Supabase client not initialized");

      const user = await ensureUser();
      checks.auth = !!(user && user.id);
      diagnosis.userId = user && user.id ? user.id : null;
      if (!checks.auth) throw new Error("Anonymous Auth user missing");

      const context = await ensureDefaultFamilyAndBaby();
      diagnosis.familyId = context && context.currentFamilyId ? context.currentFamilyId : null;
      diagnosis.babyId = context && context.currentBabyId ? context.currentBabyId : null;
      checks.family = !!diagnosis.familyId;
      checks.baby = !!diagnosis.babyId;

      const familyMembersResult = await client.from("family_members").select("id,family_id,user_id").eq("user_id", user.id).limit(1);
      checks.familyMembersSelect = !familyMembersResult.error;
      if (familyMembersResult.error) throw familyMembersResult.error;

      const familiesResult = await client.from("families").select("id").limit(1);
      checks.familiesSelect = !familiesResult.error;
      if (familiesResult.error) throw familiesResult.error;

      const babiesResult = await client.from("babies").select("id,family_id").limit(1);
      checks.babiesSelect = !babiesResult.error;
      if (babiesResult.error) throw babiesResult.error;

      const recordsQuery = client.from("records").select("id,client_id").limit(1);
      let scopedRecordsQuery = recordsQuery;
      if (diagnosis.familyId) scopedRecordsQuery = scopedRecordsQuery.eq("family_id", diagnosis.familyId);
      if (diagnosis.babyId) scopedRecordsQuery = scopedRecordsQuery.eq("baby_id", diagnosis.babyId);
      const recordsResult = await scopedRecordsQuery;
      checks.recordsSelect = !recordsResult.error;
      if (recordsResult.error) throw recordsResult.error;

      diagnosis.ok = checks.auth && checks.family && checks.baby && checks.recordsSelect;
      diagnosis.mode = diagnosis.ok ? "cloud_ready" : "local";
      diagnosis.status = diagnosis.ok ? "connected" : "error";
      setState({
        ready: diagnosis.ok,
        mode: diagnosis.mode,
        status: diagnosis.status,
        userId: diagnosis.userId,
        lastCheckedAt: checkedAt,
        lastError: null
      });
    } catch (error) {
      diagnosis.ok = false;
      diagnosis.status = checks.online ? "error" : "offline";
      diagnosis.mode = "local";
      diagnosis.error = errorMessage(error);
      setState({
        ready: false,
        mode: "local",
        status: diagnosis.status,
        lastCheckedAt: checkedAt,
        lastError: normalizeError(error)
      });
    } finally {
      try {
        window.localStorage.setItem(LAST_SYNC_DIAGNOSIS_KEY, JSON.stringify(diagnosis));
      } catch (storageError) {
        console.warn("BabyCloud diagnosis storage failed", storageError);
      }
    }
    return diagnosis;
  }

  function getHumanStatusMessage(status) {
    const value = typeof status === "string" ? status : (status && status.status);
    if (value === "synced") return "서버에 저장됐어요.";
    if (value === "pending") return "서버 저장을 기다리고 있어요.";
    if (value === "error") return "서버 저장은 실패했지만, 이 기기의 기록은 유지되고 있어요.";
    if (value === "deleted_pending") return "삭제 내용을 서버에 반영하는 중이에요.";
    if (value === "deleted_error") return "이 기기에서는 삭제됐지만, 서버 반영은 다시 시도해야 해요.";
    if (value === "connected" || value === "cloud_ready") return "서버 저장이 준비됐어요. 새 기록은 이 기기에 먼저 저장되고, 가능하면 서버에도 함께 저장됩니다.";
    if (value === "offline") return "현재 오프라인이에요. 기록은 이 기기에 저장되고, 나중에 다시 동기화할 수 있어요.";
    return "이 기록은 아직 서버에 저장되지 않았어요. 이 기기에는 안전하게 저장되어 있어요.";
  }

  async function testSaveRecord() {
    const now = nowIso();
    const record = {
      id: "test_record_" + Date.now(),
      type: "test",
      subtype: "connection",
      amount: null,
      memo: "Phase 3.6 server test",
      isSample: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null
    };
    const result = await saveRecord(record);
    if (result.ok) setState({ status: "test_saved", lastSavedAt: result.syncedAt, lastError: null });
    return result;
  }

  async function testFetchRecords() {
    const client = getClient();
    if (!client) return { ok: false, status: "local_only", count: 0, records: [], error: "supabase_client_unavailable" };

    try {
      const context = await ensureDefaultFamilyAndBaby();
      if (!context || !context.currentFamilyId || !context.currentBabyId) return { ok: false, status: "error", count: 0, records: [], error: "family_baby_context_missing" };
      const result = await client
        .from("records")
        .select("client_id,record_id,type,subtype,note,memo,is_sample,recorded_at,deleted_at,device_id")
        .eq("family_id", context.currentFamilyId)
        .eq("baby_id", context.currentBabyId)
        .eq("type", "test")
        .order("recorded_at", { ascending: false })
        .limit(5);

      if (result.error) throw result.error;
      setState({ ready: true, mode: "cloud_ready", status: "test_fetched", userId: context.currentUserId, lastError: null });
      return { ok: true, status: "test_fetched", count: result.data.length, records: result.data };
    } catch (error) {
      console.warn("BabyCloud test fetch failed", error);
      setState({ ready: false, mode: "local", status: "error", lastError: normalizeError(error) });
      return { ok: false, status: "error", count: 0, records: [], error: errorMessage(error) };
    }
  }

  async function fetchRecords() {
    const client = getClient();
    if (!client) {
      return { ok: false, status: "local_only", count: 0, records: [], fetchedAt: null, error: "supabase_client_unavailable" };
    }

    try {
      setState({ status: "fetching", lastError: null });
      const context = await ensureDefaultFamilyAndBaby();
      if (!context || !context.currentFamilyId || !context.currentBabyId) {
        return { ok: false, status: "error", count: 0, records: [], fetchedAt: null, error: "family_baby_context_missing" };
      }

      const result = await client
        .from("records")
        .select("*")
        .eq("family_id", context.currentFamilyId)
        .eq("baby_id", context.currentBabyId)
        .order("recorded_at", { ascending: true });

      if (result.error) throw result.error;

      const fetchedAt = nowIso();
      const rows = Array.isArray(result.data) ? result.data : [];
      try {
        window.localStorage.setItem("babyAppLastServerFetch", JSON.stringify({
          fetchedAt: fetchedAt,
          serverCount: rows.length,
          status: "success"
        }));
      } catch (storageError) {
        console.warn("BabyCloud fetch status storage failed", storageError);
      }
      setState({
        ready: true,
        mode: "cloud_ready",
        status: "records_fetched",
        userId: context.currentUserId,
        lastCheckedAt: fetchedAt,
        lastError: null
      });
      return { ok: true, status: "records_fetched", count: rows.length, records: rows, fetchedAt: fetchedAt };
    } catch (error) {
      console.warn("BabyCloud records fetch failed", error);
      setState({
        ready: false,
        mode: "local",
        status: navigator.onLine === false ? "offline" : "fetch_failed",
        lastError: normalizeError(error)
      });
      try {
        window.localStorage.setItem("babyAppLastServerFetch", JSON.stringify({
          fetchedAt: nowIso(),
          serverCount: 0,
          status: "failed",
          error: errorMessage(error)
        }));
      } catch (storageError) {
        console.warn("BabyCloud fetch failure storage failed", storageError);
      }
      return { ok: false, status: "error", count: 0, records: [], fetchedAt: null, error: errorMessage(error) };
    }
  }

  function mainRecordFields(record) {
    return {
      type: record && record.type ? String(record.type) : "",
      subtype: record && record.subtype ? String(record.subtype) : "",
      amount: normalizeAmount(record && record.amount),
      memo: record && record.memo ? String(record.memo) : "",
      isSample: Boolean(record && record.isSample),
      createdAt: record && record.createdAt ? String(record.createdAt) : "",
      updatedAt: record && record.updatedAt ? String(record.updatedAt) : "",
      deletedAt: record && record.deletedAt ? String(record.deletedAt) : ""
    };
  }

  function recordsConflict(localRecord, serverRecord) {
    const localFields = mainRecordFields(localRecord);
    const serverFields = mainRecordFields(serverRecord);
    const majorDifferent =
      localFields.type !== serverFields.type ||
      localFields.subtype !== serverFields.subtype ||
      localFields.amount !== serverFields.amount ||
      localFields.memo !== serverFields.memo ||
      localFields.isSample !== serverFields.isSample ||
      localFields.createdAt !== serverFields.createdAt ||
      localFields.deletedAt !== serverFields.deletedAt;
    return majorDifferent && localFields.updatedAt && serverFields.updatedAt && localFields.updatedAt !== serverFields.updatedAt;
  }

  function buildMergePreview(localRecords, serverRows) {
    const locals = Array.isArray(localRecords) ? localRecords : [];
    const rows = Array.isArray(serverRows) ? serverRows : [];
    const localById = new Map();
    const serverValidById = new Map();
    const serverOnlyRecords = [];
    const localOnlyRecords = [];
    const bothRecords = [];
    const conflicts = [];
    const deletedServerRows = [];
    const invalidServerRows = [];

    locals.forEach(function (record) {
      if (record && record.id) localById.set(String(record.id), record);
    });

    rows.forEach(function (row) {
      const normalized = normalizeServerRowToLocalRecord(row);
      if (!normalized.ok) {
        invalidServerRows.push(normalized);
        return;
      }
      const record = normalized.record;
      if (record.deletedAt) deletedServerRows.push(row);
      serverValidById.set(record.id, record);
      const localRecord = localById.get(record.id);
      if (!localRecord) {
        if (!record.deletedAt) serverOnlyRecords.push(record);
        return;
      }
      bothRecords.push(record);
      if (recordsConflict(localRecord, record)) {
        conflicts.push({ id: record.id, localRecord: localRecord, serverRecord: record });
      }
    });

    locals.forEach(function (record) {
      if (record && record.id && !serverValidById.has(String(record.id))) localOnlyRecords.push(record);
    });

    const preview = {
      localCount: locals.length,
      serverCount: rows.length,
      serverOnlyCount: serverOnlyRecords.length,
      localOnlyCount: localOnlyRecords.length,
      bothCount: bothRecords.length,
      conflictCount: conflicts.length,
      deletedServerCount: deletedServerRows.length,
      invalidServerCount: invalidServerRows.length,
      serverOnlyRecords: serverOnlyRecords,
      localOnlyRecords: localOnlyRecords,
      bothRecords: bothRecords,
      conflicts: conflicts,
      deletedServerRows: deletedServerRows,
      invalidServerRows: invalidServerRows
    };

    try {
      window.localStorage.setItem("babyAppLastServerMergePreview", JSON.stringify({
        createdAt: nowIso(),
        localCount: preview.localCount,
        serverCount: preview.serverCount,
        serverOnlyCount: preview.serverOnlyCount,
        localOnlyCount: preview.localOnlyCount,
        bothCount: preview.bothCount,
        conflictCount: preview.conflictCount,
        deletedServerCount: preview.deletedServerCount,
        invalidServerCount: preview.invalidServerCount
      }));
    } catch (storageError) {
      console.warn("BabyCloud merge preview storage failed", storageError);
    }
    if (invalidServerRows.length) console.warn("BabyCloud invalid server rows", invalidServerRows);
    return preview;
  }

  function mergeServerRecordsIntoLocal(appData, serverRows, options) {
    const target = appData && typeof appData === "object" ? appData : null;
    const opts = options || {};
    const mergedAt = nowIso();
    if (!target || !Array.isArray(target.records)) {
      return { ok: false, addedCount: 0, skippedExistingCount: 0, conflictCount: 0, invalidCount: 0, mergedAt: mergedAt, error: "invalid_app_data" };
    }

    const preview = opts.preview || buildMergePreview(target.records, serverRows);
    const backup = {
      reason: "before_server_merge_phase3_5",
      createdAt: mergedAt,
      appVersion: BABY_CLOUD_APP_VERSION,
      appData: JSON.parse(JSON.stringify(target))
    };

    try {
      window.localStorage.setItem("babyAppBackupBeforeServerMerge", JSON.stringify(backup));
    } catch (error) {
      console.warn("BabyCloud merge backup failed", error);
      return {
        ok: false,
        addedCount: 0,
        skippedExistingCount: preview.bothCount || 0,
        conflictCount: preview.conflictCount || 0,
        invalidCount: preview.invalidServerCount || 0,
        mergedAt: mergedAt,
        error: "backup_failed"
      };
    }

    const existingIds = new Set(target.records.map(function (record) {
      return record && record.id ? String(record.id) : "";
    }));
    let addedCount = 0;
    preview.serverOnlyRecords.forEach(function (record) {
      if (!record || !record.id || record.deletedAt || existingIds.has(String(record.id))) return;
      target.records.push(record);
      existingIds.add(String(record.id));
      addedCount += 1;
    });
    target.records.sort(function (a, b) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    const result = {
      ok: true,
      addedCount: addedCount,
      skippedExistingCount: preview.bothCount || 0,
      conflictCount: preview.conflictCount || 0,
      invalidCount: preview.invalidServerCount || 0,
      deletedServerCount: preview.deletedServerCount || 0,
      mergedAt: mergedAt
    };
    try {
      window.localStorage.setItem("babyAppLastServerMergeResult", JSON.stringify(result));
    } catch (storageError) {
      console.warn("BabyCloud merge result storage failed", storageError);
    }
    return result;
  }

  init();
})();
