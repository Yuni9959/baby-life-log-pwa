// Baby life log - Phase 3.7.1 Supabase type sync helpers.
// Client-safe only: never put service_role keys, DB passwords, or direct DB URLs here.
// OAuth identity is only an access layer.
// The true owner of records is the family workspace.

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
  const LAST_SAFE_MERGE_PREVIEW_KEY = "babyAppLastSafeMergePreview";
  const LAST_SAFE_MERGE_RESULT_KEY = "babyAppLastSafeMergeResult";
  const BACKUP_BEFORE_SERVER_MERGE_KEY = "babyAppBackupBeforeServerMerge";
  const LAST_CLOUD_BACKUP_STATUS_KEY = "babyAppLastCloudBackupStatus";
  const LAST_CLOUD_RESTORE_STATUS_KEY = "babyAppLastCloudRestoreStatus";
  const FAMILY_JOIN_BACKUP_PREFIX = "babyAppBackupBeforeFamilyJoin:";
  const LAST_FAMILY_IDENTITY_DIAGNOSTIC_KEY = "babyAppLastFamilyIdentityDiagnostic";
  const PENDING_OAUTH_FAMILY_ID_KEY = "babylog_pending_family_id_before_oauth";
  const PENDING_OAUTH_STARTED_AT_KEY = "babylog_oauth_started_at";
  const PENDING_OAUTH_PROVIDER_KEY = "babylog_oauth_provider";
  const LAST_OAUTH_RESULT_KEY = "babylog_last_oauth_result";
  const LOCAL_FAMILY_ID_KEY = "babylog_family_id";
  const LOCAL_BABY_ID_KEY = "babylog_baby_id";
  const LOCAL_FAMILY_CODE_KEY = "babylog_family_code";
  const LOCAL_ACCOUNT_CODE_KEY = "babylog_account_code";
  const BABY_CLOUD_APP_VERSION = "4.3.5.1";
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
  const RETRY_STATUSES = ["local_only", "pending", "error", "deleted_pending", "deleted_error"];

  let supabaseClient = null;
  let loggedResolvedFamilyId = null;
  let loggedResolvedBabyId = null;

  const BabyCloud = {
    provider: "supabase",
    version: BABY_CLOUD_APP_VERSION,
    enabled: false,
    ready: false,
    mode: "local",
    status: "not_configured",
    userId: null,
    authIdentity: null,
    familyMembership: null,
    lastCheckedAt: null,
    lastSavedAt: null,
    lastUpdatedAt: null,
    lastDeletedAt: null,
    lastSetupAt: null,
    lastError: null,

    init: init,
    ensureUser: ensureUser,
    ensureAuthAndFamily: ensureAuthAndFamily,
    restoreAuthAndFamilyAfterLogin: restoreAuthAndFamilyAfterLogin,
    signInWithGoogle: signInWithGoogle,
    signInWithKakao: signInWithKakao,
    signOutGoogle: signOutGoogle,
    getPendingOAuthContext: getPendingOAuthContext,
    checkConnection: checkConnection,
    testSaveRecord: testSaveRecord,
    testFetchRecords: testFetchRecords,
    saveRecord: saveRecord,
    fetchRecords: fetchRecords,
    fetchServerRecordsForCurrentBaby: fetchServerRecordsForCurrentBaby,
    normalizeServerRecord: normalizeServerRowToLocalRecord,
    buildMergePreview: buildMergePreview,
    buildSafeMergePreview: buildSafeMergePreview,
    mergeServerRecordsIntoLocal: mergeServerRecordsIntoLocal,
    applySafeMerge: applySafeMerge,
    isTestRecord: isTestRecord,
    isDeletedRecord: isDeletedRecord,
    compareRecordFreshness: compareRecordFreshness,
    getSafeStatus: getSafeStatus,

    getOrCreateDeviceId: getOrCreateDeviceId,
    getDeviceName: getDeviceName,
    getDeviceType: getDeviceType,
    ensureDefaultFamilyAndBaby: ensureDefaultFamilyAndBaby,
    getCloudContext: getCloudContext,
    saveCloudContext: saveCloudContext,
    ensureFamilyMembership: ensureFamilyMembership,
    getAuthFamilySnapshot: getAuthFamilySnapshot,
    ensureFamilyAccessCode: ensureFamilyAccessCode,
    ensureCurrentProfile: ensureCurrentProfile,
    ensureFamilyCode: ensureFamilyCode,
    backupLocalRecordsToCloud: backupLocalRecordsToCloud,
    restoreCloudRecordsToLocal: restoreCloudRecordsToLocal,
    upsertCurrentDevice: upsertCurrentDevice,
    fetchLinkedDevices: fetchLinkedDevices,
    joinFamilyByAccessCode: joinFamilyByAccessCode,
    backupLocalStorageBeforeFamilyJoin: backupLocalStorageBeforeFamilyJoin,
    getFamilyIdentityDiagnostic: getFamilyIdentityDiagnostic,
    diagnoseFamilyIdentity: diagnoseFamilyIdentity,
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
    getHumanStatusMessage: getHumanStatusMessage,
    ensureUserFamilyContextRpc: ensureUserFamilyContextRpc,
    getUserFriendlyCloudStatus: getUserFriendlyCloudStatus
  };

  window.BabyCloud = BabyCloud;
  console.log("[BabyCloud] loaded version " + BABY_CLOUD_APP_VERSION + " no-created-by fix");

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
      serverId: cloud.serverId || null,
      lastAttemptAt: safeIso(cloud.lastAttemptAt),
      retryCount: Math.max(0, Math.round(Number(cloud.retryCount) || 0)),
      operation: ["create", "update", "delete", "unknown"].includes(cloud.operation) ? cloud.operation : "unknown"
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
    const sourceList = Array.isArray(records) ? records : [];
    const list = sourceList.filter(function (record) { return !isTestRecord(record); });
    const summary = {
      total: list.length,
      testTotal: sourceList.length - list.length,
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

  function contextMissingError() {
    const context = getCloudContext();
    if (context && context.lastError) return context.lastError;
    if (BabyCloud.lastError && BabyCloud.lastError.message) return BabyCloud.lastError.message;
    return "family_baby_context_missing";
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
    } else if (
      code === "404" ||
      code === 404 ||
      code === "PGRST205" ||
      lower.indexOf("404") !== -1 ||
      lower.indexOf("not found") !== -1 ||
      lower.indexOf("could not find the table") !== -1 ||
      (lower.indexOf("relation") !== -1 && lower.indexOf("does not exist") !== -1)
    ) {
      kind = "missing_table";
      userMessage = "Required Supabase tables are missing or not exposed through PostgREST. Run deliverables/supabase_phase3_6_connection_diagnostics.sql in the Supabase SQL Editor, then reload the app.";
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

  function getRecordClientId(recordOrRow) {
    if (!recordOrRow || typeof recordOrRow !== "object") return "";
    return String(recordOrRow.client_id || recordOrRow.record_id || recordOrRow.id || "").trim();
  }

  function isTestRecord(recordOrRow) {
    if (!recordOrRow || typeof recordOrRow !== "object") return false;
    const type = String(recordOrRow.type || "").toLowerCase();
    const subtype = String(recordOrRow.subtype || "").toLowerCase();
    const clientId = getRecordClientId(recordOrRow);
    const id = String(recordOrRow.id || "").trim();
    return type === "test" ||
      recordOrRow.isSample === true ||
      recordOrRow.is_sample === true ||
      subtype === "connection" ||
      clientId.indexOf("diagnostic_record_") === 0 ||
      clientId.indexOf("test_record_") === 0 ||
      id.indexOf("diagnostic_record_") === 0 ||
      id.indexOf("test_record_") === 0;
  }

  function isDeletedRecord(recordOrRow) {
    return !!(recordOrRow && (recordOrRow.deletedAt || recordOrRow.deleted_at));
  }

  function compareRecordFreshness(localRecord, serverRecord) {
    const localUpdated = safeIso(localRecord && (localRecord.updatedAt || localRecord.updated_at || localRecord.createdAt || localRecord.recorded_at));
    const serverUpdated = safeIso(serverRecord && (serverRecord.updatedAt || serverRecord.updated_at || serverRecord.createdAt || serverRecord.recorded_at));
    if (!localUpdated && !serverUpdated) return "unknown";
    if (localUpdated && !serverUpdated) return "local_newer";
    if (!localUpdated && serverUpdated) return "server_newer";
    const localTime = new Date(localUpdated).getTime();
    const serverTime = new Date(serverUpdated).getTime();
    if (localTime > serverTime) return "local_newer";
    if (serverTime > localTime) return "server_newer";
    return "same";
  }

  function getOrCreateDeviceId() {
    try {
      const existing = window.localStorage.getItem(DEVICE_ID_KEY);
      if (existing && (/^device_\d+_[a-z0-9]+$/i.test(existing) || /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing))) return existing;
      const next = window.crypto && typeof window.crypto.randomUUID === "function"
        ? window.crypto.randomUUID()
        : "device_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
      window.localStorage.setItem(DEVICE_ID_KEY, next);
      return next;
    } catch (error) {
      return "device_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
    }
  }

  function getDeviceType() {
    const ua = (navigator && navigator.userAgent ? navigator.userAgent : "").toLowerCase();
    if (/ipad|tablet/.test(ua)) return "tablet";
    if (/mobi|iphone|android/.test(ua)) return "phone";
    return "desktop";
  }

  function getDeviceName() {
    try {
      const stored = window.localStorage.getItem("babyAppDeviceName");
      if (stored && stored.trim()) return stored.trim().slice(0, 80);
    } catch (error) {}
    const ua = navigator && navigator.userAgent ? navigator.userAgent : "";
    const platform = navigator && navigator.platform ? navigator.platform : "";
    let name = "이 기기";
    if (/iPhone/i.test(ua)) name = "iPhone";
    else if (/iPad/i.test(ua)) name = "iPad";
    else if (/Android/i.test(ua)) name = /Mobile/i.test(ua) ? "Android Phone" : "Android Tablet";
    else if (/Mac/i.test(platform)) name = "Mac";
    else if (/Win/i.test(platform)) name = "Windows PC";
    else if (/Linux/i.test(platform)) name = "Linux Device";
    return name;
  }

  function normalizeAccessCode(value) {
    const compact = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!compact) return "";
    if (compact.indexOf("FAM") === 0 && compact.length >= 11) {
      return "FAM-" + compact.slice(3, 7) + "-" + compact.slice(7, 11);
    }
    if (compact.indexOf("FAMILY") === 0 && compact.length > 6) {
      return "FAMILY-" + compact.slice(6, 12);
    }
    if (compact.length === 8) return compact.slice(0, 4) + "-" + compact.slice(4);
    return compact.length > 6 ? compact.slice(0, 6) + "-" + compact.slice(6, 12) : compact;
  }

  function normalizeAccountCode(value) {
    const compact = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!compact) return "";
    if (compact.indexOf("ACCT") === 0 && compact.length >= 12) {
      return "ACCT-" + compact.slice(4, 8) + "-" + compact.slice(8, 12);
    }
    return compact;
  }

  function randomCodeSegment(length) {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = new Uint8Array(length);
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      window.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 255);
    }
    let output = "";
    for (let index = 0; index < length; index += 1) {
      output += alphabet[bytes[index] % alphabet.length];
    }
    return output;
  }

  function generateAccountCode() {
    return "ACCT-" + randomCodeSegment(4) + "-" + randomCodeSegment(4);
  }

  function generateFamilyCode() {
    return "FAM-" + randomCodeSegment(4) + "-" + randomCodeSegment(4);
  }

  function backupLocalStorageBeforeFamilyJoin(targetCode) {
    const createdAt = nowIso();
    const key = FAMILY_JOIN_BACKUP_PREFIX + createdAt.replace(/[:.]/g, "-");
    const snapshot = {
      createdAt: createdAt,
      reason: "before_family_join",
      targetAccessCode: normalizeAccessCode(targetCode),
      currentContext: getCloudContext(),
      storage: {}
    };
    try {
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const itemKey = window.localStorage.key(i);
        snapshot.storage[itemKey] = window.localStorage.getItem(itemKey);
      }
      window.localStorage.setItem(key, JSON.stringify(snapshot));
      window.localStorage.setItem("babyAppLastFamilyJoinBackupKey", key);
      return { ok: true, key: key, createdAt: createdAt };
    } catch (error) {
      return { ok: false, key: key, createdAt: createdAt, error: errorMessage(error) };
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
      authIdentity: BabyCloud.authIdentity || null,
      familyMembership: BabyCloud.familyMembership || null,
      currentFamilyId: context.currentFamilyId || null,
      currentBabyId: context.currentBabyId || null,
      deviceId: context.deviceId || null,
      deviceName: context.deviceName || null,
      deviceType: context.deviceType || null,
      familyAccessCode: context.familyAccessCode || null,
      familyCode: context.familyCode || context.familyAccessCode || null,
      accountCode: context.accountCode || null,
      familyName: context.familyName || null,
      babyName: context.babyName || null,
      babyBirthDate: context.babyBirthDate || null,
      babyGender: context.babyGender || null,
      lastCheckedAt: BabyCloud.lastCheckedAt,
      lastSavedAt: BabyCloud.lastSavedAt,
      lastUpdatedAt: BabyCloud.lastUpdatedAt,
      lastDeletedAt: BabyCloud.lastDeletedAt,
      lastSetupAt: BabyCloud.lastSetupAt || context.lastSetupAt || null,
      lastCloudBackupAt: context.lastCloudBackupAt || null,
      lastCloudRestoreAt: context.lastCloudRestoreAt || null,
      lastServerRecordCount: context.lastServerRecordCount,
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
        detectSessionInUrl: true
      }
    });
    if (supabaseClient.auth && typeof supabaseClient.auth.onAuthStateChange === "function") {
      supabaseClient.auth.onAuthStateChange(function (event, session) {
        const user = session && session.user ? session.user : null;
        if (user && user.id) {
          setState({ userId: user.id, authIdentity: buildAuthIdentity(user), lastError: null });
          if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "INITIAL_SESSION") {
            restoreAuthAndFamilyAfterLogin({ reason: event }).catch(function (error) {
              console.warn("BabyCloud OAuth restore after auth event failed", error);
            });
          }
        } else if (event === "SIGNED_OUT") {
          setState({ userId: null, authIdentity: null, familyMembership: null, status: "signed_out", ready: false, lastError: null });
        }
      });
    }
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
    await restoreAuthAndFamilyAfterLogin({ reason: "init" });
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
        setState({ enabled: true, userId: sessionUser.id, authIdentity: buildAuthIdentity(sessionUser), status: "anonymous_ready", lastError: null });
        return sessionUser;
      }

      const signInResult = await client.auth.signInAnonymously();
      if (signInResult.error) throw signInResult.error;
      const user = signInResult.data && signInResult.data.user;
      if (!user || !user.id) throw new Error("anonymous_auth_failed");
      setState({ enabled: true, userId: user.id, authIdentity: buildAuthIdentity(user), status: "anonymous_ready", lastError: null });
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

  function buildAuthIdentity(user) {
    const source = user && typeof user === "object" ? user : {};
    const identities = Array.isArray(source.identities) ? source.identities : [];
    const providers = identities.map(function (identity) {
      return identity && identity.provider ? identity.provider : null;
    }).filter(Boolean);
    return {
      id: source.id || null,
      isAnonymous: source.is_anonymous === true || providers.length === 0,
      email: source.email || null,
      providers: providers,
      createdAt: source.created_at || null,
      lastSignInAt: source.last_sign_in_at || null
    };
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

  function readStoredValue(keys) {
    for (let i = 0; i < keys.length; i += 1) {
      try {
        const value = window.localStorage.getItem(keys[i]);
        if (value && String(value).trim()) return String(value).trim();
      } catch (error) {}
    }
    return null;
  }

  function readLegacyFamilyId() {
    return readStoredValue([LOCAL_FAMILY_ID_KEY, PENDING_OAUTH_FAMILY_ID_KEY, "family_id", "familyId", "babyAppFamilyId"]);
  }

  function readLegacyBabyId() {
    return readStoredValue([LOCAL_BABY_ID_KEY, "baby_id", "babyId", "babyAppBabyId"]);
  }

  function getCloudContext() {
    let context = {};
    const storedFamilyId = readLegacyFamilyId();
    const storedBabyId = readLegacyBabyId();
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
    const resolvedFamilyId = storedFamilyId || context.currentFamilyId || context.family_id || null;
    const resolvedBabyId = storedBabyId || context.currentBabyId || context.baby_id || null;
    try {
      if (resolvedFamilyId) {
        window.localStorage.setItem(LOCAL_FAMILY_ID_KEY, resolvedFamilyId);
        if (loggedResolvedFamilyId !== resolvedFamilyId) {
          console.log("[CloudContext] resolved family_id " + resolvedFamilyId);
          loggedResolvedFamilyId = resolvedFamilyId;
        }
      }
      if (resolvedBabyId) {
        window.localStorage.setItem(LOCAL_BABY_ID_KEY, resolvedBabyId);
        if (loggedResolvedBabyId !== resolvedBabyId) {
          console.log("[CloudContext] resolved baby_id " + resolvedBabyId);
          loggedResolvedBabyId = resolvedBabyId;
        }
      }
    } catch (error) {
      console.warn("BabyCloud local context restore failed", error);
    }
    return {
      provider: "supabase",
      currentFamilyId: resolvedFamilyId,
      currentBabyId: resolvedBabyId,
      currentUserId: context.currentUserId || BabyCloud.userId || null,
      deviceId: context.deviceId || getOrCreateDeviceId(),
      deviceName: context.deviceName || getDeviceName(),
      deviceType: context.deviceType || getDeviceType(),
      familyAccessCode: context.familyAccessCode || context.accessCode || null,
      familyCode: context.familyCode || context.family_code || context.familyAccessCode || context.accessCode || readStoredValue([LOCAL_FAMILY_CODE_KEY]) || null,
      accountCode: context.accountCode || context.account_code || readStoredValue([LOCAL_ACCOUNT_CODE_KEY]) || null,
      familyName: context.familyName || "우리 가족",
      babyName: context.babyName || "아기",
      babyBirthDate: context.babyBirthDate || null,
      babyGender: context.babyGender || "unknown",
      lastSetupAt: context.lastSetupAt || null,
      lastProfileSyncAt: context.lastProfileSyncAt || null,
      lastError: context.lastError || "",
      lastSyncAt: context.lastSyncAt || null,
      lastUpdateSyncAt: context.lastUpdateSyncAt || null,
      lastDeleteSyncAt: context.lastDeleteSyncAt || null,
      lastCloudBackupAt: context.lastCloudBackupAt || null,
      lastCloudRestoreAt: context.lastCloudRestoreAt || null,
      lastServerRecordCount: Number.isFinite(Number(context.lastServerRecordCount)) ? Number(context.lastServerRecordCount) : null
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
      deviceName: source.deviceName || current.deviceName || getDeviceName(),
      deviceType: source.deviceType || current.deviceType || getDeviceType(),
      familyAccessCode: source.familyAccessCode || source.accessCode || current.familyAccessCode || null,
      familyCode: source.familyCode || source.family_code || source.familyAccessCode || source.accessCode || current.familyCode || current.familyAccessCode || null,
      accountCode: source.accountCode || source.account_code || current.accountCode || null,
      familyName: source.familyName || current.familyName || "우리 가족",
      babyName: source.babyName || current.babyName || "아기",
      babyBirthDate: source.babyBirthDate !== undefined ? source.babyBirthDate : (current.babyBirthDate || null),
      babyGender: source.babyGender || current.babyGender || "unknown",
      lastSetupAt: source.lastSetupAt || current.lastSetupAt || nowIso(),
      lastProfileSyncAt: source.lastProfileSyncAt || current.lastProfileSyncAt || null,
      lastError: source.lastError !== undefined ? String(source.lastError || "").slice(0, 300) : (current.lastError || ""),
      lastSyncAt: source.lastSyncAt || current.lastSyncAt || null,
      lastUpdateSyncAt: source.lastUpdateSyncAt || current.lastUpdateSyncAt || null,
      lastDeleteSyncAt: source.lastDeleteSyncAt || current.lastDeleteSyncAt || null,
      lastCloudBackupAt: source.lastCloudBackupAt || current.lastCloudBackupAt || null,
      lastCloudRestoreAt: source.lastCloudRestoreAt || current.lastCloudRestoreAt || null,
      lastServerRecordCount: source.lastServerRecordCount !== undefined ? source.lastServerRecordCount : current.lastServerRecordCount
    });
    try {
      window.localStorage.setItem(CLOUD_CONTEXT_KEY, JSON.stringify(next));
      if (next.currentFamilyId) window.localStorage.setItem(LOCAL_FAMILY_ID_KEY, next.currentFamilyId);
      if (next.currentBabyId) window.localStorage.setItem(LOCAL_BABY_ID_KEY, next.currentBabyId);
      if (next.familyCode || next.familyAccessCode) window.localStorage.setItem(LOCAL_FAMILY_CODE_KEY, next.familyCode || next.familyAccessCode);
      if (next.accountCode) window.localStorage.setItem(LOCAL_ACCOUNT_CODE_KEY, next.accountCode);
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

  async function ensureFamilyAccessCode(familyId) {
    return ensureFamilyCode(familyId);
  }

  async function ensureCurrentProfile(user) {
    const client = getClient();
    const currentUser = user || await ensureUser();
    if (!client || !currentUser || !currentUser.id) return { ok: false, profile: null, error: "auth_session_missing" };
    const auth = buildAuthIdentity(currentUser);
    const provider = (auth.providers && auth.providers[0]) || (auth.isAnonymous ? "anonymous" : null);
    const displayName = currentUser.user_metadata && (
      currentUser.user_metadata.full_name ||
      currentUser.user_metadata.name ||
      currentUser.user_metadata.nickname
    );
    try {
      const rpcResult = await client.rpc("ensure_current_profile", {
        p_account_code: generateAccountCode(),
        p_provider: provider,
        p_email: auth.email,
        p_display_name: displayName || null
      });
      if (rpcResult.error) throw rpcResult.error;
      const profile = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;
      const accountCode = normalizeAccountCode(profile && profile.account_code);
      if (accountCode) {
        saveCloudContext(Object.assign({}, getCloudContext(), { accountCode: accountCode, currentUserId: currentUser.id }));
        console.log("[AccountCode] profile ready", { accountCode: accountCode });
      }
      return { ok: true, profile: profile || null, accountCode: accountCode };
    } catch (error) {
      console.warn("[AccountCode] profile upsert failed", error);
      return { ok: false, profile: null, error: errorMessage(error) };
    }
  }

  async function ensureFamilyCode(familyId) {
    const client = getClient();
    const targetFamilyId = familyId || getCloudContext().currentFamilyId;
    if (!client || !targetFamilyId) return { ok: false, familyCode: null, accessCode: null, error: "family_context_missing" };
    try {
      const rpcResult = await client.rpc("ensure_family_code", {
        p_family_id: targetFamilyId,
        p_family_code: generateFamilyCode()
      });
      if (!rpcResult.error && rpcResult.data) {
        const row = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;
        const familyCode = normalizeAccessCode(row.family_code || row);
        saveCloudContext(Object.assign({}, getCloudContext(), { familyCode: familyCode, familyAccessCode: familyCode }));
        console.log("[FamilyCode] family code ready", { familyId: targetFamilyId, familyCode: familyCode });
        return { ok: true, familyCode: familyCode, accessCode: familyCode };
      }
      const readResult = await client
        .from("families")
        .select("id,family_code,name")
        .eq("id", targetFamilyId)
        .maybeSingle();
      if (readResult.error) throw readResult.error;
      if (readResult.data && readResult.data.family_code) {
        const existingCode = normalizeAccessCode(readResult.data.family_code);
        saveCloudContext(Object.assign({}, getCloudContext(), {
          familyCode: existingCode,
          familyAccessCode: existingCode,
          familyName: readResult.data.name || getCloudContext().familyName
        }));
        return { ok: true, familyCode: existingCode, accessCode: existingCode };
      }
      return { ok: false, familyCode: null, accessCode: null, error: "family_code_missing_run_phase4_3_sql" };
    } catch (error) {
      console.warn("[FamilyCode] family code ensure failed", error);
      return { ok: false, familyCode: null, accessCode: null, error: errorMessage(error) };
    }
  }

  async function upsertCurrentDevice(context) {
    const ctx = context || getCloudContext();
    saveCloudContext(Object.assign({}, ctx, {
      deviceId: ctx.deviceId || getOrCreateDeviceId(),
      deviceName: ctx.deviceName || getDeviceName(),
      deviceType: ctx.deviceType || getDeviceType()
    }));
    return { ok: true, device: null, skipped: true, reason: "phase4_3_devices_disabled" };
  }

  async function fetchLinkedDevices(familyId) {
    const ctx = getCloudContext();
    const targetFamilyId = familyId || ctx.currentFamilyId;
    if (!targetFamilyId) return { ok: false, devices: [], count: 0, error: "family_context_missing" };
    return { ok: true, devices: [], count: 0, skipped: true, reason: "phase4_3_devices_disabled" };
  }

  async function joinFamilyByAccessCode(accessCode) {
    const client = getClient();
    if (!client) return { ok: false, error: "supabase_client_unavailable" };
    const normalizedCode = normalizeAccessCode(accessCode);
    if (!normalizedCode || normalizedCode.length < 6) return { ok: false, error: "family_code_required" };
    const backup = backupLocalStorageBeforeFamilyJoin(normalizedCode);
    if (!backup.ok) return { ok: false, error: "family_join_backup_failed", backup: backup };
    try {
      const user = await ensureUser();
      if (!user || !user.id) throw new Error("anonymous_auth_failed");
      await ensureCurrentProfile(user);
      const device = {
        device_id: getOrCreateDeviceId(),
        device_name: getDeviceName(),
        device_type: getDeviceType()
      };
      const currentContext = getCloudContext();
      const currentCode = normalizeAccessCode(currentContext.familyCode || currentContext.familyAccessCode || "");
      if (currentContext.currentFamilyId && currentContext.currentBabyId && currentCode && currentCode === normalizedCode) {
        const membership = await ensureFamilyMembership(currentContext.currentFamilyId, user);
        if (!membership.ok) throw new Error(membership.error || "family_membership_failed");
        const context = saveCloudContext(Object.assign({}, currentContext, {
          currentUserId: user.id,
          deviceId: device.device_id,
          deviceName: device.device_name,
          deviceType: device.device_type,
          familyCode: currentCode,
          familyAccessCode: currentCode,
          lastSetupAt: nowIso(),
          lastError: ""
        }));
        const recordsResult = await fetchServerRecordsForCurrentBaby({ skipEnsure: true });
        const restoreResult = recordsResult && recordsResult.ok
          ? restoreCloudRecordsToLocal(recordsResult.records, { reason: "family_join_already_connected" })
          : { ok: false, addedCount: 0, error: recordsResult && recordsResult.error };
        setState({ ready: true, mode: "cloud_ready", status: "family_already_connected", userId: user.id, lastError: null });
        console.log("[FamilyConnect] already connected; fetched latest records", { familyId: context.currentFamilyId, restored: restoreResult.addedCount || 0 });
        return { ok: true, alreadyConnected: true, context: getCloudContext(), backup: backup, records: recordsResult, restore: restoreResult };
      }
      console.log("[FamilyConnect] join by family_code start", { familyCode: normalizedCode });
      const result = await client.rpc("join_family_by_family_code", {
        p_family_code: normalizedCode,
        p_device_id: device.device_id,
        p_device_name: device.device_name,
        p_device_type: device.device_type
      });
      if (result.error) throw result.error;
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!row || !row.family_id) throw new Error("family_join_failed");
      const babyId = row.baby_id || null;
      const context = saveCloudContext({
        currentFamilyId: row.family_id,
        currentBabyId: babyId,
        currentUserId: user.id,
        deviceId: device.device_id,
        deviceName: device.device_name,
        deviceType: device.device_type,
        familyCode: normalizeAccessCode(row.family_code || normalizedCode),
        familyAccessCode: normalizeAccessCode(row.family_code || normalizedCode),
        familyName: row.family_name || "우리 가족",
        babyName: row.baby_name || getCloudContext().babyName || "아기",
        babyBirthDate: row.baby_birth_date || null,
        babyGender: row.baby_gender || "unknown",
        lastSetupAt: nowIso()
      });
      await upsertCurrentDevice(context);
      const recordsResult = await fetchServerRecordsForCurrentBaby({ skipEnsure: true });
      const restoreResult = recordsResult && recordsResult.ok
        ? restoreCloudRecordsToLocal(recordsResult.records, { reason: "family_code_connect" })
        : { ok: false, addedCount: 0, error: recordsResult && recordsResult.error };
      setState({ ready: true, mode: "cloud_ready", status: "family_joined", userId: user.id, lastError: null });
      console.log("[FamilyConnect] join by family_code complete", { familyId: row.family_id, restored: restoreResult.addedCount || 0 });
      return { ok: true, context: getCloudContext(), backup: backup, records: recordsResult, restore: restoreResult };
    } catch (error) {
      console.warn("[FamilyConnect] family_code join failed", error);
      setState({ ready: false, mode: "local", status: "family_join_failed", lastError: normalizeError(error) });
      return { ok: false, error: errorMessage(error), backup: backup };
    }
  }

  async function diagnoseFamilyIdentity() {
    const context = getCloudContext();
    const storedAppData = readStoredAppData();
    const localRecords = storedAppData && Array.isArray(storedAppData.records) ? storedAppData.records : [];
    const summary = getSyncSummary(localRecords);
    const authSnapshot = await getAuthFamilySnapshot({ refresh: true });
    const serverRecords = await fetchServerRecordsForCurrentBaby({ skipEnsure: true });
    const linkedDevices = await fetchLinkedDevices(context.currentFamilyId);
    const accessCode = context.familyCode || context.familyAccessCode
      ? { ok: true, accessCode: context.familyCode || context.familyAccessCode, familyCode: context.familyCode || context.familyAccessCode }
      : await ensureFamilyAccessCode(context.currentFamilyId);
    const diagnostic = {
      ok: !!context.currentFamilyId,
      checkedAt: nowIso(),
      userId: authSnapshot.userId || context.currentUserId || BabyCloud.userId || null,
      auth: authSnapshot.auth || BabyCloud.authIdentity || null,
      familyId: context.currentFamilyId || null,
      babyId: context.currentBabyId || null,
      membership: authSnapshot.membership || BabyCloud.familyMembership || null,
      membershipConnected: !!(authSnapshot.membership && authSnapshot.membership.id),
      role: authSnapshot.membership && authSnapshot.membership.role ? authSnapshot.membership.role : null,
      membershipStatus: authSnapshot.membership && authSnapshot.membership.status ? authSnapshot.membership.status : null,
      lastSeenAt: authSnapshot.membership && authSnapshot.membership.last_seen_at ? authSnapshot.membership.last_seen_at : null,
      deviceId: context.deviceId || getOrCreateDeviceId(),
      deviceName: context.deviceName || getDeviceName(),
      deviceType: context.deviceType || getDeviceType(),
      familyAccessCode: accessCode.accessCode || null,
      familyCode: accessCode.familyCode || accessCode.accessCode || null,
      accountCode: context.accountCode || null,
      localRecordsCount: summary.total || 0,
      serverRecordsCount: serverRecords && serverRecords.ok ? serverRecords.total : null,
      linkedDevicesCount: linkedDevices && linkedDevices.ok ? linkedDevices.count : null,
      linkedDevices: linkedDevices.devices || [],
      serverFamilyId: serverRecords && serverRecords.familyId ? serverRecords.familyId : null,
      serverBabyId: serverRecords && serverRecords.babyId ? serverRecords.babyId : null,
      errors: [accessCode.error, serverRecords && serverRecords.error, linkedDevices && linkedDevices.error].filter(Boolean)
    };
    try {
      window.localStorage.setItem(LAST_FAMILY_IDENTITY_DIAGNOSTIC_KEY, JSON.stringify(diagnostic));
    } catch (error) {}
    return diagnostic;
  }

  function getPendingOAuthContext() {
    try {
      return {
        familyId: window.localStorage.getItem(PENDING_OAUTH_FAMILY_ID_KEY) || null,
        startedAt: window.localStorage.getItem(PENDING_OAUTH_STARTED_AT_KEY) || null,
        provider: window.localStorage.getItem(PENDING_OAUTH_PROVIDER_KEY) || null
      };
    } catch (error) {
      return { familyId: null, startedAt: null, provider: null };
    }
  }

  function savePendingOAuthContext(provider, familyId) {
    try {
      if (familyId) {
        window.localStorage.setItem(PENDING_OAUTH_FAMILY_ID_KEY, familyId);
      } else {
        window.localStorage.removeItem(PENDING_OAUTH_FAMILY_ID_KEY);
      }
      window.localStorage.setItem(PENDING_OAUTH_STARTED_AT_KEY, nowIso());
      window.localStorage.setItem(PENDING_OAUTH_PROVIDER_KEY, provider || "google");
    } catch (error) {
      console.warn("BabyCloud OAuth pending context storage failed", error);
    }
  }

  function clearPendingOAuthContext() {
    try {
      window.localStorage.removeItem(PENDING_OAUTH_FAMILY_ID_KEY);
      window.localStorage.removeItem(PENDING_OAUTH_STARTED_AT_KEY);
      window.localStorage.removeItem(PENDING_OAUTH_PROVIDER_KEY);
    } catch (error) {}
  }

  function saveLastOAuthResult(result) {
    try {
      window.localStorage.setItem(LAST_OAUTH_RESULT_KEY, JSON.stringify(Object.assign({ checkedAt: nowIso() }, result || {})));
    } catch (error) {}
  }

  function getOAuthRedirectTo() {
    if (!window.location) return undefined;
    return window.location.origin + window.location.pathname;
  }

  function getLocalRecordCount() {
    const appData = readStoredAppData();
    return appData && Array.isArray(appData.records) ? appData.records.length : 0;
  }

  function hasLocalBabyProfile() {
    const appData = readStoredAppData();
    return !!(appData && isObject(appData.profile) && Object.keys(appData.profile).length);
  }

  async function getFirstActiveMembershipForUser(userId) {
    const client = getClient();
    if (!client || !userId) return null;
    const result = await client
      .from("family_members")
      .select("id,family_id,user_id,role,status,joined_at,created_at,updated_at,last_seen_at")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (result.error) throw result.error;
    return result.data || null;
  }

  async function restoreAuthAndFamilyAfterLogin(options) {
    const client = getClient();
    if (!client) return { ok: false, error: "supabase_client_unavailable", context: getCloudContext() };

    const opts = options || {};
    const pending = getPendingOAuthContext();
    try {
      const sessionResult = await client.auth.getSession();
      if (sessionResult.error) throw sessionResult.error;
      const user = sessionResult.data && sessionResult.data.session && sessionResult.data.session.user;
      if (!user || !user.id) {
        if (pending.provider) {
          saveLastOAuthResult({
            ok: false,
            provider: pending.provider,
            status: "cancelled_or_no_session",
            message: (pending.provider === "kakao" ? "Kakao" : "Google") + " login was cancelled or no session was returned."
          });
          clearPendingOAuthContext();
        }
        return { ok: false, error: "auth_session_missing", context: getCloudContext() };
      }
      const profileResult = await ensureCurrentProfile(user);

      let context = getCloudContext();
      let familyId = context.currentFamilyId || null;
      let membership = null;

      if (!familyId && pending.familyId) {
        familyId = pending.familyId;
      }

      if (!familyId) {
        membership = await getFirstActiveMembershipForUser(user.id);
        if (membership && membership.family_id) familyId = membership.family_id;
      }

      if (!familyId) {
        context = await ensureAuthAndFamily();
        saveLastOAuthResult({
          ok: !!context,
          provider: pending.provider || "google",
          status: context ? "new_family_created_for_new_user" : "restore_failed",
          reason: opts.reason || ""
        });
        clearPendingOAuthContext();
        return { ok: !!context, context: context, createdNewFamily: !!context };
      }

      // Kakao account is only an identity for accessing the family workspace, not the owner of records.
      const membershipResult = await ensureFamilyMembership(familyId, user);
      if (membershipResult.ok) membership = membershipResult.membership;
      context = saveCloudContext(Object.assign({}, context, {
        currentFamilyId: familyId,
        currentUserId: user.id,
        lastSetupAt: context.lastSetupAt || nowIso(),
        lastError: membershipResult.ok ? "" : (membershipResult.error || "")
      }));
      const baby = await ensureBabyForFamily(familyId, context.currentBabyId);
      if (baby.ok && baby.baby && baby.baby.id) {
        context = saveCloudContext(Object.assign({}, context, {
          currentFamilyId: familyId,
          currentBabyId: baby.baby.id,
          currentUserId: user.id,
          babyName: baby.baby.name || context.babyName || "아기",
          babyBirthDate: baby.baby.birth_date || context.babyBirthDate || null,
          babyGender: baby.baby.gender || context.babyGender || "unknown"
        }));
      }
      await upsertCurrentDevice(context);
      const familyCodeResult = await ensureFamilyCode(familyId);
      if (familyCodeResult.ok) {
        context = saveCloudContext(Object.assign({}, context, {
          familyCode: familyCodeResult.familyCode,
          familyAccessCode: familyCodeResult.familyCode,
          accountCode: profileResult.accountCode || context.accountCode
        }));
      }
      backupLocalRecordsToCloud({ reason: "oauth_restore", context: context, skipEnsure: true }).catch(function (backupError) {
        console.warn("[CloudBackup] non-blocking upload after OAuth restore failed", backupError);
      });
      setState({
        enabled: true,
        ready: true,
        mode: "cloud_ready",
        status: pending.provider ? pending.provider + "_connected" : "family_ready",
        userId: user.id,
        authIdentity: buildAuthIdentity(user),
        familyMembership: membership || BabyCloud.familyMembership || null,
        lastCheckedAt: nowIso(),
        lastError: null
      });
      saveLastOAuthResult({
        ok: true,
        provider: pending.provider || "google",
        status: pending.provider ? "restored_after_oauth" : "restored",
        familyId: familyId,
        userId: user.id,
        reason: opts.reason || ""
      });
      clearPendingOAuthContext();
      return { ok: true, context: context, membership: membership, auth: buildAuthIdentity(user), profile: profileResult.profile || null };
    } catch (error) {
      console.warn("BabyCloud OAuth family restore failed", error);
      saveLastOAuthResult({
        ok: false,
        provider: pending.provider || "google",
        status: "restore_failed",
        error: errorMessage(error)
      });
      setState({ ready: false, mode: "local", status: "oauth_restore_failed", lastError: normalizeError(error) });
      return { ok: false, error: errorMessage(error), context: getCloudContext() };
    }
  }

  async function signInWithGoogle() {
    const client = getClient();
    if (!client) return { ok: false, error: "supabase_client_unavailable" };
    let context = getCloudContext();
    try {
      if (!context.currentFamilyId) {
        const ensured = await ensureAuthAndFamily();
        context = ensured || context;
      }
      const currentFamilyId = context.currentFamilyId || readLegacyFamilyId() || null;
      savePendingOAuthContext("google", currentFamilyId);
      console.log("[BabyCloud] Google login start", {
        familyId: currentFamilyId,
        localRecordsCount: getLocalRecordCount(),
        hasBabyProfile: hasLocalBabyProfile()
      });
      setState({ status: "google_login_starting", lastError: null });
      const redirectTo = getOAuthRedirectTo();
      const user = await ensureUser();
      if (!user || !user.id) throw new Error("anonymous_auth_failed");
      const method = client.auth && typeof client.auth.linkIdentity === "function" ? "linkIdentity" : "signInWithOAuth";
      const oauthResult = method === "linkIdentity"
        ? await client.auth.linkIdentity({ provider: "google", options: { redirectTo: redirectTo } })
        : await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo } });
      if (oauthResult.error) throw oauthResult.error;
      saveLastOAuthResult({ ok: true, provider: "google", status: "oauth_redirect_started", method: method, familyId: currentFamilyId });
      return { ok: true, data: oauthResult.data, method: method, redirectTo: redirectTo };
    } catch (error) {
      console.warn("BabyCloud Google login failed", error);
      saveLastOAuthResult({ ok: false, provider: "google", status: "oauth_start_failed", error: errorMessage(error) });
      setState({ ready: !!getCloudContext().currentFamilyId, mode: getCloudContext().currentFamilyId ? "cloud_ready" : "local", status: "google_login_failed", lastError: normalizeError(error) });
      return { ok: false, error: errorMessage(error), context: getCloudContext() };
    }
  }

  async function signInWithKakao() {
    const client = getClient();
    if (!client) return { ok: false, error: "supabase_client_unavailable" };
    let context = getCloudContext();
    try {
      if (!context.currentFamilyId) {
        const ensured = await ensureAuthAndFamily();
        context = ensured || context;
      }
      const currentFamilyId = context.currentFamilyId || readLegacyFamilyId() || null;
      savePendingOAuthContext("kakao", currentFamilyId);
      console.log("[BabyCloud] Kakao login start", {
        familyId: currentFamilyId,
        localRecordsCount: getLocalRecordCount(),
        hasBabyProfile: hasLocalBabyProfile()
      });
      setState({ status: "kakao_login_starting", lastError: null });
      const redirectTo = getOAuthRedirectTo();
      const user = await ensureUser();
      if (!user || !user.id) throw new Error("anonymous_auth_failed");
      const method = client.auth && typeof client.auth.linkIdentity === "function" ? "linkIdentity" : "signInWithOAuth";
      const oauthResult = method === "linkIdentity"
        ? await client.auth.linkIdentity({ provider: "kakao", options: { redirectTo: redirectTo } })
        : await client.auth.signInWithOAuth({ provider: "kakao", options: { redirectTo: redirectTo } });
      if (oauthResult.error) throw oauthResult.error;
      saveLastOAuthResult({ ok: true, provider: "kakao", status: "oauth_redirect_started", method: method, familyId: currentFamilyId });
      return { ok: true, data: oauthResult.data, method: method, redirectTo: redirectTo };
    } catch (error) {
      console.warn("BabyCloud Kakao login failed", error);
      saveLastOAuthResult({ ok: false, provider: "kakao", status: "oauth_start_failed", error: errorMessage(error) });
      setState({ ready: !!getCloudContext().currentFamilyId, mode: getCloudContext().currentFamilyId ? "cloud_ready" : "local", status: "kakao_login_failed", lastError: normalizeError(error) });
      return { ok: false, error: errorMessage(error), context: getCloudContext() };
    }
  }

  async function signOutGoogle() {
    const client = getClient();
    if (!client) return { ok: false, error: "supabase_client_unavailable", context: getCloudContext() };
    const preservedContext = getCloudContext();
    try {
      const result = await client.auth.signOut();
      if (result.error) throw result.error;
      saveCloudContext(preservedContext);
      setState({
        ready: !!preservedContext.currentFamilyId,
        mode: preservedContext.currentFamilyId ? "cloud_ready" : "local",
        status: "signed_out",
        userId: null,
        authIdentity: null,
        familyMembership: null,
        lastError: null
      });
      return { ok: true, context: getCloudContext() };
    } catch (error) {
      console.warn("BabyCloud sign out failed", error);
      saveCloudContext(preservedContext);
      setState({ status: "sign_out_failed", lastError: normalizeError(error) });
      return { ok: false, error: errorMessage(error), context: getCloudContext() };
    }
  }

  function getFamilyIdentityDiagnostic() {
    try {
      const raw = window.localStorage.getItem(LAST_FAMILY_IDENTITY_DIAGNOSTIC_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  async function ensureFamilyMembership(currentFamilyId, currentUser) {
    const client = getClient();
    if (!client) return { ok: false, membership: null, error: "supabase_client_unavailable" };
    if (!currentFamilyId || !currentUser || !currentUser.id) return { ok: false, membership: null, error: "family_or_user_missing" };

    try {
      console.log("[CloudContext] ensure membership", { familyId: currentFamilyId, userId: currentUser.id });
      const selectResult = await client
        .from("family_members")
        .select("id,family_id,user_id,role,status,joined_at,created_at,updated_at,last_seen_at")
        .eq("family_id", currentFamilyId)
        .eq("user_id", currentUser.id)
        .maybeSingle();
      if (selectResult.error) throw selectResult.error;

      if (selectResult.data && selectResult.data.id) {
        const updateResult = await client
          .from("family_members")
          .update({ status: "active", last_seen_at: nowIso() })
          .eq("id", selectResult.data.id)
          .select("id,family_id,user_id,role,status,joined_at,created_at,updated_at,last_seen_at")
          .maybeSingle();
        if (updateResult.error) throw updateResult.error;
        const membership = updateResult.data || Object.assign({}, selectResult.data, {
          status: "active",
          last_seen_at: nowIso()
        });
        setState({ familyMembership: membership });
        console.log("[CloudContext] membership ready", { familyId: currentFamilyId, userId: currentUser.id, existed: true, role: membership.role });
        return { ok: true, membership: membership, existed: true };
      }

      let role = "owner";
      try {
        const ownerResult = await client
          .from("family_members")
          .select("id")
          .eq("family_id", currentFamilyId)
          .eq("role", "owner")
          .eq("status", "active")
          .limit(1);
        if (!ownerResult.error && Array.isArray(ownerResult.data) && ownerResult.data.length) {
          role = "parent";
        }
      } catch (ownerError) {
        console.warn("[CloudContext] owner role check failed", ownerError);
      }

      const insertRow = {
        family_id: currentFamilyId,
        user_id: currentUser.id,
        role: role,
        status: "active",
        last_seen_at: nowIso()
      };
      const insertResult = await client
        .from("family_members")
        .insert(insertRow)
        .select("id,family_id,user_id,role,status,joined_at,created_at,updated_at,last_seen_at")
        .single();
      if (insertResult.error) throw insertResult.error;
      if (!insertResult.data) throw new Error("family_membership_not_returned");
      setState({ familyMembership: insertResult.data });
      console.log("[CloudContext] membership ready", { familyId: currentFamilyId, userId: currentUser.id, existed: false, role: insertResult.data.role });
      return { ok: true, membership: insertResult.data, existed: false };
    } catch (error) {
      console.warn("[CloudContext] membership error", error);
      setState({ familyMembership: null, lastError: normalizeError(error) });
      return { ok: false, membership: null, error: errorMessage(error) };
    }
  }

  async function ensureBabyForFamily(familyId, preferredBabyId) {
    const client = getClient();
    if (!client || !familyId) return { ok: false, baby: null, error: "family_context_missing" };
    try {
      if (preferredBabyId) {
        const babyCheck = await client
          .from("babies")
          .select("id,family_id,name,birth_date,gender")
          .eq("id", preferredBabyId)
          .eq("family_id", familyId)
          .maybeSingle();
        if (!babyCheck.error && babyCheck.data) {
          return { ok: true, baby: babyCheck.data };
        }
      }

      const babyResult = await client
        .from("babies")
        .select("id,family_id,name,birth_date,gender")
        .eq("family_id", familyId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (babyResult.error) throw babyResult.error;
      if (babyResult.data && babyResult.data.id) return { ok: true, baby: babyResult.data };

      const defaults = profileDefaults();
      const createBabyResult = await client
        .from("babies")
        .insert({ family_id: familyId, name: defaults.babyName, birth_date: defaults.birthDate, gender: defaults.gender })
        .select("id,family_id,name,birth_date,gender")
        .single();
      if (createBabyResult.error) throw createBabyResult.error;
      return { ok: true, baby: createBabyResult.data };
    } catch (error) {
      return { ok: false, baby: null, error: errorMessage(error) };
    }
  }

  async function getAuthFamilySnapshot(options) {
    const opts = options || {};
    const context = getCloudContext();
    const snapshot = {
      ok: false,
      checkedAt: nowIso(),
      auth: BabyCloud.authIdentity || null,
      userId: BabyCloud.userId || context.currentUserId || null,
      familyId: context.currentFamilyId || null,
      babyId: context.currentBabyId || null,
      membership: BabyCloud.familyMembership || null,
      error: ""
    };
    if (!opts.refresh || !getClient()) return snapshot;
    try {
      const user = await ensureUser();
      snapshot.auth = buildAuthIdentity(user);
      snapshot.userId = user && user.id ? user.id : null;
      if (context.currentFamilyId && user && user.id) {
        const membership = await ensureFamilyMembership(context.currentFamilyId, user);
        snapshot.membership = membership.membership || null;
      }
      snapshot.ok = !!(snapshot.userId && snapshot.familyId);
    } catch (error) {
      snapshot.error = errorMessage(error);
    }
    return snapshot;
  }

  async function ensureAuthAndFamily() {
    const client = getClient();
    if (!client) return null;

    try {
      setState({ status: "checking", lastError: null });
      const user = await ensureUser();
      if (!user || !user.id) throw new Error("anonymous_auth_failed");
      const profileResult = await ensureCurrentProfile(user);

      const deviceId = getOrCreateDeviceId();
      let context = getCloudContext();
      const pendingOAuth = getPendingOAuthContext();
      let familyId = context.currentFamilyId || null;
      let createdNewFamily = false;
      let familyName = context.familyName || "우리 가족";

      if (!familyId && pendingOAuth.familyId) {
        familyId = pendingOAuth.familyId;
      }

      if (familyId) {
        const membership = await ensureFamilyMembership(familyId, user);
        if (!membership.ok) throw new Error(membership.error || "family_membership_failed");
      } else {
        const membershipResult = await client
          .from("family_members")
          .select("id,family_id,user_id,role,status,joined_at,created_at,updated_at,last_seen_at")
          .eq("user_id", user.id)
          .eq("status", "active")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (membershipResult.error) throw membershipResult.error;
        if (membershipResult.data && membershipResult.data.family_id) {
          familyId = membershipResult.data.family_id;
          setState({ familyMembership: membershipResult.data });
        }
      }

      if (!familyId) {
        const familyCode = context.familyCode || context.familyAccessCode || generateFamilyCode();
        const familyResult = await client
          .from("families")
          .insert({ name: familyName, family_code: familyCode, updated_at: nowIso() })
          .select("id,name,family_code")
          .single();
        if (familyResult.error) throw familyResult.error;
        familyId = familyResult.data && familyResult.data.id;
        familyName = (familyResult.data && familyResult.data.name) || familyName;
        createdNewFamily = true;
        if (!familyId) throw new Error("family_create_failed");

        const membership = await ensureFamilyMembership(familyId, user);
        if (!membership.ok) throw new Error(membership.error || "family_membership_failed");
      }

      context = saveCloudContext(Object.assign({}, context, {
        currentFamilyId: familyId,
        currentUserId: user.id,
        familyName: familyName,
        lastSetupAt: context.lastSetupAt || nowIso(),
        lastError: ""
      }));

      const baby = await ensureBabyForFamily(familyId, context.currentBabyId);
      if (!baby.ok || !baby.baby || !baby.baby.id) throw new Error(baby.error || "family_or_baby_missing");

      // records와 babies의 실제 주인은 auth user가 아니라 family_id다.
      // The owner of records and babies is the family_id, not the auth user.
      context = saveCloudContext({
        currentFamilyId: familyId,
        currentBabyId: baby.baby.id,
        currentUserId: user.id,
        deviceId: deviceId,
        deviceName: getDeviceName(),
        deviceType: getDeviceType(),
        familyName: familyName,
        babyName: baby.baby.name || "아기",
        babyBirthDate: baby.baby.birth_date || null,
        babyGender: baby.baby.gender || "unknown",
        lastSetupAt: nowIso()
      });
      const accessCodeResult = await ensureFamilyAccessCode(familyId);
      if (accessCodeResult.ok) {
        context = saveCloudContext(Object.assign({}, context, {
          familyAccessCode: accessCodeResult.accessCode,
          familyCode: accessCodeResult.familyCode || accessCodeResult.accessCode,
          accountCode: profileResult.accountCode || context.accountCode
        }));
      }
      await upsertCurrentDevice(context);
      backupLocalRecordsToCloud({ reason: createdNewFamily ? "new_family_initial_upload" : "family_ready_upload", context: context, skipEnsure: true }).catch(function (backupError) {
        console.warn("[CloudBackup] non-blocking local upload failed", backupError);
      });
      setState({
        enabled: true,
        ready: true,
        mode: "cloud_ready",
        status: createdNewFamily ? "family_created" : "family_ready",
        userId: user.id,
        authIdentity: buildAuthIdentity(user),
        lastCheckedAt: nowIso(),
        lastError: null
      });
      return context;
    } catch (error) {
      console.warn("BabyCloud family/baby setup failed", error);
      saveCloudContext(Object.assign({}, getCloudContext(), { lastError: errorMessage(error) }));
      setState({
        ready: false,
        mode: "local",
        status: navigator.onLine === false ? "offline" : "error",
        lastError: normalizeError(error)
      });
      return null;
    }
  }

  async function ensureDefaultFamilyAndBaby() {
    return ensureAuthAndFamily();
  }

  async function fetchCurrentBaby() {
    const client = getClient();
    if (!client) return { ok: false, error: "supabase_client_unavailable", baby: null };
    const context = await ensureDefaultFamilyAndBaby();
    if (!context || !context.currentFamilyId || !context.currentBabyId) {
      return { ok: false, error: contextMissingError(), baby: null };
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
      return { ok: false, error: contextMissingError() };
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
      return { ok: false, scanned: 0, repaired: 0, skipped: 0, failed: 0, error: contextMissingError() };
    }
    try {
      const rowsResult = await client
        .from("records")
        .select("id,client_id,family_id,baby_id,device_id")
        .eq("family_id", context.currentFamilyId)
        .is("baby_id", null)
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
          .eq("family_id", context.currentFamilyId)
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
      const context = opts.context || (opts.skipEnsure === true ? getCloudContext() : await ensureDefaultFamilyAndBaby());
      if (!context) throw new Error(contextMissingError());
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

      const missingBaby = await client.from("records").select("id", { count: "exact", head: true }).eq("family_id", context.currentFamilyId).is("baby_id", null);
      diagnosis.serverRecordsMissingFamilyId = 0;
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
    const raw = String(type || "").trim();
    const map = {
      feeding: "feeding",
      feed: "feeding",
      milk: "feeding",
      "수유": "feeding",

      diaper: "diaper",
      nappy: "diaper",
      "기저귀": "diaper",

      burp: "burp",
      burping: "burp",
      belch: "burp",
      "트림": "burp",
      "트름": "burp",

      sleep: "sleep_start",
      sleep_start: "sleep_start",
      asleep: "sleep_start",
      "잠듦": "sleep_start",
      "잠": "sleep_start",

      sleep_end: "sleep_end",

      wake: "wake",
      awake: "wake",
      wakeup: "wake",
      wake_up: "wake",
      "깨어남": "wake",

      custom: "custom",
      test: "test"
    };
    return map[raw] || raw || "custom";
  }
  function mapServerTypeToLocalType(type) {
    const value = String(type || "");
    if (value === "sleep_start") return "sleep";
    if (value === "sleep_end") return "wake";
    return value || "custom";
  }

  function mapRecordSubtype(record) {
    record = record || {};
    const type = mapRecordType(record.type);
    const raw = String(record.subtype || record.diaperType || record.feedingType || "").trim();

    if (type === "diaper") {
      const diaperMap = {
        pee: "pee",
        wet: "pee",
        urine: "pee",
        "소변": "pee",

        poop: "poop",
        dirty: "poop",
        stool: "poop",
        "대변": "poop",

        pee_poop: "pee_poop",
        both: "pee_poop",
        mixed: "pee_poop",
        "소변+대변": "pee_poop",
        "소변 대변": "pee_poop"
      };
      return diaperMap[raw] || null;
    }

    if (type === "feeding") {
      const feedingMap = {
        formula: "formula",
        "분유": "formula",

        breast: "breast",
        breastfeeding: "breast",
        "모유": "breast",

        pumped: "pumped",
        "유축": "pumped"
      };
      return feedingMap[raw] || null;
    }

    if (type === "test") return raw || "connection";

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
    const type = mapRecordType(record && record.type);

    if (type !== "feeding") {
      return null;
    }

    const value = record.amount_ml ?? record.amount ?? record.ml ?? null;
    const number = Number(value);

    if (!Number.isFinite(number) || number < 0) {
      return null;
    }

    return Math.round(number);
  }
  function mapLocalRecordToServerRow(record, context) {
    if (!record || typeof record !== "object") throw new Error("record is required");
    if (!record.id) throw new Error("record.id is required");
    const ctx = context || getCloudContext();
    if (!ctx.currentFamilyId) throw new Error("family_id is required");
    if (!ctx.currentBabyId) throw new Error("baby_id is required");

    const serverType = mapRecordType(record.type);
    const serverSubtype = mapRecordSubtype(record);
    const amountMl = getRecordAmountMl(record);
    const recordedAtValue = record.createdAt || record.recordedAt || null;
    const recordedAt = isValidDate(recordedAtValue) ? new Date(recordedAtValue).toISOString() : nowIso();
    const updatedAt = isValidDate(record.updatedAt) ? new Date(record.updatedAt).toISOString() : recordedAt;
    const note = record.memo || record.note || "";
    const payload = Object.assign({}, record, {
      updatedAt: updatedAt,
      deletedAt: record.deletedAt || null
    });
    const row = {
      family_id: ctx.currentFamilyId,
      baby_id: ctx.currentBabyId,
      user_id: ctx.currentUserId || BabyCloud.userId || null,

      client_id: String(record.id),
      record_id: String(record.id),
      device_id: ctx.deviceId || getOrCreateDeviceId() || null,

      type: serverType,
      subtype: serverSubtype,
      amount_ml: amountMl,
      note: note,
      recorded_at: recordedAt,
      deleted_at: record.deletedAt || null,

      amount: amountMl,
      memo: note,
      is_sample: Boolean(record.isSample),

      app_version: BABY_CLOUD_APP_VERSION,
      schema_version: 4,
      payload: payload
    };

    console.log("[BabyCloud] mapLocalRecordToServerRow", {
      localType: record.type,
      serverType: serverType,
      localSubtype: record.subtype,
      serverSubtype: serverSubtype,
      amountMl: amountMl,
      row: row
    });

    return row;
  }
  function normalizeAmount(value) {
    if (value === null || value === undefined || value === "") return null;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  function normalizeServerRowToLocalRecord(row) {
    if (!isObject(row)) return { ok: false, reason: "row_not_object", row: row };
    const clientId = row.client_id || row.record_id || row.id;
    if (!clientId) return { ok: false, reason: "missing_client_id", row: row };
    const payload = isObject(row.payload) ? row.payload : {};
    const createdAt = payload.createdAt || row.recorded_at || row.record_created_at || row.created_at;
    const updatedAt = payload.updatedAt || row.record_updated_at || row.updated_at || row.recorded_at || row.created_at;
    if (!isValidDate(createdAt) || !isValidDate(updatedAt)) return { ok: false, reason: "invalid_date", row: row };

    const localType = mapServerTypeToLocalType(payload.type || row.type);
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
        babyId: row.baby_id || null,
        serverId: row.id || null
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
    let row = null;
    console.log("[BabyCloud] saveRecord:start", {
      id: recordId,
      type: record && record.type,
      subtype: record && record.subtype,
      amount: record && record.amount,
      createdAt: record && record.createdAt
    });
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

      row = mapLocalRecordToServerRow(record, context);
      console.log("[BabyCloud] saveRecord:row", row);
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
      console.log("[BabyCloud] saveRecord:success", {
        id: record.id,
        type: row.type,
        client_id: row.client_id
      });
      return { ok: true, status: "synced", recordId: record.id, syncedAt: syncedAt };
    } catch (error) {
      console.error("[BabyCloud] saveRecord:error", {
        id: recordId,
        localType: record && record.type,
        rowType: row && row.type,
        rowSubtype: row && row.subtype,
        error: error
      });
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
      if (!context || !context.currentFamilyId || !context.currentBabyId) return { ok: false, status: "error", recordId: recordId, error: contextMissingError() };
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
      if (!context || !context.currentFamilyId || !context.currentBabyId) return { ok: false, status: "error", recordId: recordId, error: contextMissingError() };
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

  async function ensureUserFamilyContextRpc(profile) {
    if (!getClient()) return { ok: false, status: "local_only", error: "supabase_client_unavailable" };
    try {
      const saved = await ensureAuthAndFamily();
      if (!saved || !saved.currentFamilyId || !saved.currentBabyId) throw new Error(contextMissingError());
      setState({ ready: true, mode: "cloud_ready", status: "context_ready", userId: saved.currentUserId, lastError: null });
      return {
        ok: true,
        status: "context_ready",
        context: saved,
        familyId: saved.currentFamilyId,
        babyId: saved.currentBabyId,
        memberId: BabyCloud.familyMembership && BabyCloud.familyMembership.id ? BabyCloud.familyMembership.id : null
      };
    } catch (error) {
      console.warn("BabyCloud context setup failed", error);
      setState({ ready: false, mode: "local", status: "error", lastError: normalizeError(error) });
      return { ok: false, status: "error", error: errorMessage(error) };
    }
  }

  async function retryPendingMutations(records) {
    return retryPendingRecords({ records: Array.isArray(records) ? records : ((readStoredAppData() || {}).records || []) });
  }

  async function retryRecordSync(record) {
    const startedAt = nowIso();
    const state = getRecordCloudStatus(record);
    if (isTestRecord(record)) {
      return { ok: true, status: "skipped_test_row", recordId: record && record.id, skipped: true };
    }
    const operation = (record && record.cloud && record.cloud.operation) ||
      (record && record.deletedAt ? "delete" : (state.status === "local_only" ? "create" : "update"));
    updateStoredRecordCloud(record && record.id, {
      status: state.status,
      lastAttemptAt: startedAt,
      retryCount: (state.retryCount || 0) + 1,
      operation: operation
    });
    try {
      let result;
      if (operation === "delete" || (record && record.deletedAt)) {
        result = await softDeleteRecord(record);
      } else if (operation === "create" || state.status === "local_only") {
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
          operation: operation,
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
        retryCount: retryCount,
        operation: operation
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
    let skippedTestRows = 0;
    const targets = records.filter(function (record) {
      if (!record || !statuses.includes(getRecordCloudStatus(record).status)) return false;
      if (isTestRecord(record)) {
        skippedTestRows += 1;
        return false;
      }
      return true;
    });
    const summary = {
      ok: true,
      attempted: targets.length,
      succeeded: 0,
      failed: 0,
      skipped: records.length - targets.length,
      skippedTestRows: skippedTestRows,
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
      setState({ enabled: true, userId: user.id, authIdentity: buildAuthIdentity(user), status: "anonymous_ready", lastError: null });
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
        check_type: "phase3_8_manual",
        status: "ok",
        message: "Phase 3.8 diagnostic insert/select test",
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
        throw new Error(contextMissingError());
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
        throw new Error(contextMissingError());
      }
      const now = nowIso();
      const testRecord = {
        id: "diagnostic_record_" + Date.now(),
        type: "test",
        subtype: "connection",
        amount: null,
        memo: "Phase 3.8 records insert/select/update/soft-delete test",
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

      const updateNote = "Phase 3.8 update test completed";
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
      if (!auth.ok) addDiagnosticError(result, "authSession", new Error(auth.error || "anonymous_auth_failed"));
      result.ids.userId = auth && auth.userId;

      const diagnostics = await testDiagnosticsInsertSelect();
      result.checks.diagnosticsInsert = !!(diagnostics && diagnostics.ok && diagnostics.diagnosticId);
      result.checks.diagnosticsSelect = !!(diagnostics && diagnostics.ok);
      if (!diagnostics.ok) addDiagnosticError(result, "diagnosticsInsert", new Error(diagnostics.error || diagnostics.rawError || "diagnostics_insert_select_failed"));
      result.ids.diagnosticId = diagnostics && diagnostics.diagnosticId;

      const familyBaby = await testFamilyBabyInsertSelect();
      result.checks.familyReady = !!(familyBaby && familyBaby.ok && familyBaby.familyId);
      result.checks.babyReady = !!(familyBaby && familyBaby.ok && familyBaby.babyId);
      result.checks.familyMemberReady = !!(familyBaby && familyBaby.ok && familyBaby.member);
      if (!familyBaby.ok) addDiagnosticError(result, "familyReady", new Error(familyBaby.error || familyBaby.rawError || "family_baby_insert_select_failed"));
      result.ids.familyId = familyBaby && familyBaby.familyId;
      result.ids.babyId = familyBaby && familyBaby.babyId;

      const recordTest = await testRecordInsertSelectUpdateDelete();
      result.checks.recordsInsert = !!(recordTest && recordTest.ok && recordTest.inserted);
      result.checks.recordsSelect = !!(recordTest && recordTest.ok && recordTest.selected);
      result.checks.recordsUpdate = !!(recordTest && recordTest.ok && recordTest.updated);
      result.checks.recordsSoftDelete = !!(recordTest && recordTest.ok && recordTest.deleted);
      if (!recordTest.ok) addDiagnosticError(result, "recordsInsert", new Error(recordTest.error || recordTest.rawError || "records_crud_test_failed"));
      result.ids.testRecordId = recordTest && recordTest.testRecordId;
      result.ids.serverRecordId = recordTest && recordTest.serverRecordId;

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

  function getUserFriendlyCloudStatus(input) {
    const status = typeof input === "string" ? input : ((input && input.status) || BabyCloud.status);
    const summary = input && input.summary ? input.summary : null;
    const pendingCount = summary ? (summary.pending || 0) + (summary.localOnly || 0) + (summary.deletedPending || 0) : 0;
    const errorCount = summary ? (summary.error || 0) + (summary.deletedError || 0) : 0;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { key: "offline", title: "현재 오프라인이에요.", message: "기록은 이 기기에 저장되고, 나중에 다시 동기화할 수 있어요." };
    }
    if (status === "fetching" || status === "checking") {
      return { key: "syncing", title: "서버와 기록을 맞추는 중이에요.", message: "기록 입력은 계속 이 기기에 먼저 저장됩니다." };
    }
    if (errorCount > 0 || status === "error" || status === "save_failed" || status === "fetch_failed") {
      return { key: "error", title: "서버 저장이 원활하지 않아요.", message: "기록은 이 기기에 안전하게 저장되어 있어요." };
    }
    if (pendingCount > 0 || status === "pending") {
      return { key: "pending", title: "서버에 아직 반영되지 않은 기록이 있어요.", message: "기록은 이 기기에 먼저 저장되어 있고 다시 동기화할 수 있어요." };
    }
    if (status === "not_configured" || status === "local_mode" || BabyCloud.enabled === false) {
      return { key: "local_only", title: "현재는 이 기기에만 저장 중이에요.", message: "서버 저장 설정을 확인하면 백업 동기화를 사용할 수 있어요." };
    }
    return { key: "cloud_ready", title: "서버 저장이 준비됐어요.", message: "기록은 이 기기에 먼저 저장되고, 서버에도 함께 보관됩니다." };
  }

  async function testSaveRecord() {
    const now = nowIso();
    const record = {
      id: "test_record_" + Date.now(),
      type: "test",
      subtype: "connection",
      amount: null,
      memo: "Phase 3.8 server test",
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
      if (!context || !context.currentFamilyId || !context.currentBabyId) return { ok: false, status: "error", count: 0, records: [], error: contextMissingError() };
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

  async function fetchServerRecordsForCurrentBaby(options) {
    const opts = options || {};
    const client = getClient();
    if (!client) {
      return { ok: false, status: "local_only", rows: [], records: [], fetchedAt: null, familyId: null, babyId: null, total: 0, testRows: 0, deletedRows: 0, error: "supabase_client_unavailable" };
    }

    try {
      setState({ status: "fetching", lastError: null });
      let contextResult = null;
      if (opts.useRpc === true) {
        contextResult = await ensureUserFamilyContextRpc(opts.profile || {});
      }
      const context = opts.skipEnsure === true
        ? getCloudContext()
        : (contextResult && contextResult.ok ? getCloudContext() : await ensureDefaultFamilyAndBaby());
      if (!context || !context.currentFamilyId || !context.currentBabyId) {
        return { ok: false, status: "error", rows: [], records: [], fetchedAt: null, familyId: null, babyId: null, total: 0, testRows: 0, deletedRows: 0, error: contextMissingError() };
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
      const payload = {
        ok: true,
        status: "records_fetched",
        rows: rows,
        records: rows,
        fetchedAt: fetchedAt,
        familyId: context.currentFamilyId,
        babyId: context.currentBabyId,
        total: rows.length,
        count: rows.length,
        testRows: rows.filter(isTestRecord).length,
        deletedRows: rows.filter(isDeletedRecord).length
      };
      try {
        window.localStorage.setItem("babyAppLastServerFetch", JSON.stringify({
          fetchedAt: fetchedAt,
          familyId: payload.familyId,
          babyId: payload.babyId,
          total: payload.total,
          testRows: payload.testRows,
          deletedRows: payload.deletedRows,
          status: "success"
        }));
      } catch (storageError) {
        console.warn("BabyCloud fetch status storage failed", storageError);
      }
      saveCloudContext(Object.assign({}, context, { lastServerRecordCount: rows.length }));
      setState({
        ready: true,
        mode: "cloud_ready",
        status: "records_fetched",
        userId: context.currentUserId,
        lastCheckedAt: fetchedAt,
        lastError: null
      });
      return payload;
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
          total: 0,
          testRows: 0,
          deletedRows: 0,
          status: "failed",
          error: errorMessage(error)
        }));
      } catch (storageError) {
        console.warn("BabyCloud fetch failure storage failed", storageError);
      }
      return { ok: false, status: "error", rows: [], records: [], fetchedAt: null, familyId: null, babyId: null, total: 0, count: 0, testRows: 0, deletedRows: 0, error: errorMessage(error) };
    }
  }

  async function fetchRecords() {
    return fetchServerRecordsForCurrentBaby();
  }

  async function backupLocalRecordsToCloud(options) {
    const opts = options || {};
    const client = getClient();
    const appData = readStoredAppData();
    const localRecords = appData && Array.isArray(appData.records) ? appData.records : [];
    const startedAt = nowIso();
    if (!client) return { ok: false, uploadedCount: 0, localCount: localRecords.length, error: "supabase_client_unavailable" };
    try {
      const context = opts.context && opts.context.currentFamilyId && opts.context.currentBabyId
        ? opts.context
        : (opts.skipEnsure === true ? getCloudContext() : await ensureDefaultFamilyAndBaby());
      if (!context || !context.currentFamilyId || !context.currentBabyId) throw new Error(contextMissingError());
      const rows = localRecords
        .filter(function (record) { return record && record.id && !isTestRecord(record); })
        .map(function (record) {
          const row = mapLocalRecordToServerRow(record, context);
          row.family_id = context.currentFamilyId;
          row.baby_id = context.currentBabyId;
          return row;
        });
      if (!rows.length) {
        const emptyStatus = { ok: true, startedAt: startedAt, uploadedAt: nowIso(), uploadedCount: 0, localCount: localRecords.length, reason: opts.reason || "manual" };
        window.localStorage.setItem(LAST_CLOUD_BACKUP_STATUS_KEY, JSON.stringify(emptyStatus));
        return emptyStatus;
      }
      const result = await client
        .from("records")
        .upsert(rows, { onConflict: "family_id,baby_id,client_id" })
        .select("client_id,updated_at");
      if (result.error) throw result.error;
      const uploadedAt = nowIso();
      const uploadedIds = new Set((Array.isArray(result.data) ? result.data : []).map(function (row) {
        return String(row.client_id || "");
      }));
      if (appData && Array.isArray(appData.records)) {
        appData.records.forEach(function (record) {
          if (!record || !record.id || (uploadedIds.size && !uploadedIds.has(String(record.id)))) return;
          record.cloud = normalizeRecordCloud(Object.assign({}, record, {
            cloud: Object.assign({}, record.cloud || {}, {
              status: record.deletedAt ? "deleted_synced" : "synced",
              syncedAt: uploadedAt,
              error: "",
              familyId: context.currentFamilyId,
              babyId: context.currentBabyId,
              operation: record.deletedAt ? "delete" : "update"
            })
          }));
        });
        writeStoredAppData(appData);
      }
      const status = {
        ok: true,
        startedAt: startedAt,
        uploadedAt: uploadedAt,
        uploadedCount: rows.length,
        localCount: localRecords.length,
        familyId: context.currentFamilyId,
        babyId: context.currentBabyId,
        reason: opts.reason || "manual"
      };
      window.localStorage.setItem(LAST_CLOUD_BACKUP_STATUS_KEY, JSON.stringify(status));
      saveCloudContext(Object.assign({}, context, { lastCloudBackupAt: uploadedAt, lastSyncAt: uploadedAt }));
      setState({ ready: true, mode: "cloud_ready", status: "cloud_backup_uploaded", lastSavedAt: uploadedAt, lastError: null });
      console.log("[CloudBackup] local records uploaded", status);
      return status;
    } catch (error) {
      const failure = { ok: false, startedAt: startedAt, uploadedAt: null, uploadedCount: 0, localCount: localRecords.length, error: errorMessage(error), reason: opts.reason || "manual" };
      try {
        window.localStorage.setItem(LAST_CLOUD_BACKUP_STATUS_KEY, JSON.stringify(failure));
      } catch (storageError) {
        console.warn("[CloudBackup] status storage failed", storageError);
      }
      console.warn("[CloudBackup] local records upload failed; local records are preserved", error);
      return failure;
    }
  }

  function restoreCloudRecordsToLocal(serverRows, options) {
    const opts = options || {};
    const rows = Array.isArray(serverRows) ? serverRows : [];
    const appData = readStoredAppData();
    const startedAt = nowIso();
    if (!appData || !Array.isArray(appData.records)) {
      return { ok: false, addedCount: 0, error: "invalid_app_data" };
    }
    try {
      const preview = buildSafeMergePreview(appData, rows);
      const result = applySafeMerge(appData, preview, { serverRows: rows });
      const restoredAt = nowIso();
      const status = Object.assign({}, result, {
        ok: !!(result && result.ok),
        startedAt: startedAt,
        restoredAt: restoredAt,
        serverCount: rows.length,
        reason: opts.reason || "manual"
      });
      if (status.ok) {
        writeStoredAppData(appData);
        saveCloudContext(Object.assign({}, getCloudContext(), {
          lastCloudRestoreAt: restoredAt,
          lastServerRecordCount: rows.length
        }));
        try {
          window.dispatchEvent(new CustomEvent("baby-cloud-local-restore", { detail: status }));
        } catch (eventError) {}
      }
      window.localStorage.setItem(LAST_CLOUD_RESTORE_STATUS_KEY, JSON.stringify(status));
      console.log("[CloudRestore] server records merged into local storage", status);
      return status;
    } catch (error) {
      const failure = { ok: false, startedAt: startedAt, restoredAt: null, addedCount: 0, serverCount: rows.length, error: errorMessage(error), reason: opts.reason || "manual" };
      try {
        window.localStorage.setItem(LAST_CLOUD_RESTORE_STATUS_KEY, JSON.stringify(failure));
      } catch (storageError) {
        console.warn("[CloudRestore] status storage failed", storageError);
      }
      console.warn("[CloudRestore] server restore failed; local records are preserved", error);
      return failure;
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

  function buildSafeMergePreview(appData, serverRows) {
    const locals = appData && Array.isArray(appData.records)
      ? appData.records
      : (Array.isArray(appData) ? appData : []);
    const rows = Array.isArray(serverRows) ? serverRows : [];
    const localById = new Map();
    const serverValidById = new Map();
    const serverOnlyRecords = [];
    const localOnlyRecords = [];
    const bothRecords = [];
    const deleteApplyRecords = [];
    const serverNewerRecords = [];
    const conflicts = [];
    const testRows = [];
    const invalidRows = [];
    let serverDeletedCount = 0;
    let localDeletedCount = 0;

    locals.forEach(function (record) {
      if (!record || !record.id) return;
      localById.set(String(record.id), record);
      if (record.deletedAt) localDeletedCount += 1;
    });

    rows.forEach(function (row) {
      if (isTestRecord(row)) {
        testRows.push(row);
        return;
      }
      const normalized = normalizeServerRowToLocalRecord(row);
      if (!normalized.ok) {
        invalidRows.push(normalized);
        return;
      }
      const record = normalized.record;
      const recordId = String(record.id);
      const localRecord = localById.get(recordId);
      serverValidById.set(recordId, record);

      if (record.deletedAt) serverDeletedCount += 1;

      if (!localRecord) {
        if (!record.deletedAt) serverOnlyRecords.push(record);
        return;
      }

      bothRecords.push(record);
      if (record.deletedAt && !localRecord.deletedAt) {
        deleteApplyRecords.push({ id: recordId, localRecord: localRecord, serverRecord: record, deletedAt: record.deletedAt });
        return;
      }
      if (!record.deletedAt && localRecord.deletedAt) return;
      if (recordsConflict(localRecord, record)) {
        const freshness = compareRecordFreshness(localRecord, record);
        if (freshness === "server_newer") {
          serverNewerRecords.push(record);
          return;
        }
        conflicts.push({
          id: recordId,
          localRecord: localRecord,
          serverRecord: record,
          freshness: freshness
        });
      }
    });

    locals.forEach(function (record) {
      if (record && record.id && !serverValidById.has(String(record.id))) localOnlyRecords.push(record);
    });

    const preview = {
      ok: true,
      localCount: locals.length,
      serverCount: rows.length,
      serverOnlyCount: serverOnlyRecords.length,
      localOnlyCount: localOnlyRecords.length,
      bothCount: bothRecords.length,
      serverDeletedCount: serverDeletedCount,
      localDeletedCount: localDeletedCount,
      deleteApplyCount: deleteApplyRecords.length,
      serverNewerCount: serverNewerRecords.length,
      conflictCount: conflicts.length,
      testRowCount: testRows.length,
      invalidRowCount: invalidRows.length,
      serverOnlyRecords: serverOnlyRecords,
      localOnlyRecords: localOnlyRecords,
      bothRecords: bothRecords,
      deleteApplyRecords: deleteApplyRecords,
      serverNewerRecords: serverNewerRecords,
      conflicts: conflicts,
      testRows: testRows,
      invalidRows: invalidRows
    };

    return preview;
  }

  function applySafeMerge(appData, mergePreview, options) {
    const target = appData && typeof appData === "object" ? appData : null;
    const opts = options || {};
    const mergedAt = nowIso();
    if (!target || !Array.isArray(target.records)) {
      return { ok: false, added: 0, deletedApplied: 0, skippedExisting: 0, skippedTestRows: 0, conflicts: 0, mergedAt: mergedAt, error: "invalid_app_data" };
    }
    const preview = mergePreview && mergePreview.ok ? mergePreview : buildSafeMergePreview(target, opts.serverRows || []);
    if (
      (preview.serverOnlyCount || 0) < 1 &&
      (preview.deleteApplyCount || 0) < 1 &&
      (preview.serverNewerCount || 0) < 1
    ) {
      const noChange = {
        ok: true,
        added: 0,
        addedCount: 0,
        deletedApplied: 0,
        serverNewerApplied: 0,
        serverNewerSkipped: 0,
        overwritePolicy: "server_newer_updates_existing_records",
        skippedExisting: preview.bothCount || 0,
        skippedTestRows: preview.testRowCount || 0,
        conflicts: preview.conflictCount || 0,
        invalidRows: preview.invalidRowCount || 0,
        mergedRecords: [],
        mergedAt: mergedAt,
        noChange: true
      };
      try {
        window.localStorage.setItem(LAST_SAFE_MERGE_RESULT_KEY, JSON.stringify(noChange));
        window.localStorage.setItem("babyAppLastServerMergeResult", JSON.stringify(noChange));
      } catch (storageError) {}
      return noChange;
    }
    const backup = {
      reason: "before_server_merge_phase3_8",
      createdAt: mergedAt,
      appVersion: BABY_CLOUD_APP_VERSION,
      appData: JSON.parse(JSON.stringify(target))
    };

    try {
      window.localStorage.setItem(BACKUP_BEFORE_SERVER_MERGE_KEY, JSON.stringify(backup));
    } catch (error) {
      console.warn("BabyCloud safe merge backup failed", error);
      return { ok: false, added: 0, deletedApplied: 0, skippedExisting: preview.bothCount || 0, skippedTestRows: preview.testRowCount || 0, conflicts: preview.conflictCount || 0, mergedAt: mergedAt, error: "backup_failed" };
    }

    const existingIds = new Set(target.records.map(function (record) {
      return record && record.id ? String(record.id) : "";
    }));
    let added = 0;
    let deletedApplied = 0;
    let serverNewerApplied = 0;
    const mergedRecords = [];

    (preview.serverOnlyRecords || []).forEach(function (record) {
      if (!record || !record.id || record.deletedAt || isTestRecord(record) || existingIds.has(String(record.id))) return;
      target.records.push(record);
      existingIds.add(String(record.id));
      added += 1;
      mergedRecords.push(record);
    });

    const deleteById = new Map();
    (preview.deleteApplyRecords || []).forEach(function (item) {
      if (item && item.id && item.deletedAt) deleteById.set(String(item.id), item.deletedAt);
    });
    if (deleteById.size) {
      target.records.forEach(function (record) {
        if (!record || !record.id || record.deletedAt) return;
        const deletedAt = deleteById.get(String(record.id));
        if (!deletedAt) return;
        record.deletedAt = safeIso(deletedAt) || deletedAt;
        record.updatedAt = safeIso(deletedAt) || record.updatedAt || nowIso();
        record.cloud = normalizeRecordCloud(Object.assign({}, record, {
          cloud: Object.assign({}, record.cloud || {}, {
            status: "deleted_synced",
            syncedAt: record.updatedAt,
            error: ""
          })
        }));
        deletedApplied += 1;
        mergedRecords.push(record);
      });
    }

    const byId = new Map();
    target.records.forEach(function (record) {
      if (record && record.id) byId.set(String(record.id), record);
    });
    (preview.serverNewerRecords || []).forEach(function (record) {
      if (!record || !record.id || record.deletedAt || isTestRecord(record)) return;
      const local = byId.get(String(record.id));
      if (!local || local.deletedAt) return;
      Object.assign(local, record, {
        cloud: normalizeRecordCloud(Object.assign({}, record, {
          cloud: Object.assign({}, record.cloud || {}, {
            status: "synced",
            syncedAt: record.updatedAt || mergedAt,
            error: ""
          })
        }))
      });
      serverNewerApplied += 1;
      mergedRecords.push(local);
    });

    target.records.sort(function (a, b) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    const result = {
      ok: true,
      added: added,
      addedCount: added,
      deletedApplied: deletedApplied,
      serverNewerApplied: serverNewerApplied,
      serverNewerSkipped: 0,
      overwritePolicy: "server_newer_updates_existing_records",
      skippedExisting: preview.bothCount || 0,
      skippedTestRows: preview.testRowCount || 0,
      conflicts: preview.conflictCount || 0,
      invalidRows: preview.invalidRowCount || 0,
      mergedRecords: mergedRecords,
      mergedAt: mergedAt
    };
    try {
      window.localStorage.setItem(LAST_SAFE_MERGE_RESULT_KEY, JSON.stringify(result));
      window.localStorage.setItem("babyAppLastServerMergeResult", JSON.stringify(result));
    } catch (storageError) {
      console.warn("BabyCloud safe merge result storage failed", storageError);
    }
    return result;
  }

  function mergeServerRecordsIntoLocal(appData, serverRows, options) {
    const target = appData && typeof appData === "object" ? appData : null;
    const opts = options || {};
    const mergedAt = nowIso();
    if (!target || !Array.isArray(target.records)) {
      return { ok: false, addedCount: 0, skippedExistingCount: 0, conflictCount: 0, invalidCount: 0, mergedAt: mergedAt, error: "invalid_app_data" };
    }

    const preview = opts.preview || buildSafeMergePreview(target, serverRows);
    const backup = {
      reason: "before_server_merge_phase3_8",
      createdAt: mergedAt,
      appVersion: BABY_CLOUD_APP_VERSION,
      appData: JSON.parse(JSON.stringify(target))
    };

    try {
      window.localStorage.setItem(BACKUP_BEFORE_SERVER_MERGE_KEY, JSON.stringify(backup));
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
    (preview.serverOnlyRecords || []).forEach(function (record) {
      if (!record || !record.id || record.deletedAt || isTestRecord(record) || existingIds.has(String(record.id))) return;
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
