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
    fetchRecords: fetchRecords,
    normalizeServerRecord: normalizeServerRecord,
    buildMergePreview: buildMergePreview,
    mergeServerRecordsIntoLocal: mergeServerRecordsIntoLocal,
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

  function isObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function isValidIsoLike(value) {
    return !!value && !Number.isNaN(new Date(value).getTime());
  }

  function supportedType(type) {
    return ["feeding", "burp", "diaper", "sleep", "wake"].indexOf(type) !== -1;
  }

  function normalizeAmount(value) {
    if (value === null || value === undefined || value === "") return null;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  function normalizeCloudStatus(cloud) {
    const source = isObject(cloud) ? cloud : {};
    return {
      status: source.status || "local_only",
      syncedAt: source.syncedAt || null,
      error: source.error || ""
    };
  }

  function mainRecordFields(record) {
    return {
      type: record && record.type ? String(record.type) : "",
      subtype: record && record.subtype ? String(record.subtype) : "",
      amount: normalizeAmount(record && record.amount),
      memo: record && record.memo ? String(record.memo) : "",
      isSample: Boolean(record && record.isSample),
      createdAt: record && record.createdAt ? String(record.createdAt) : "",
      updatedAt: record && record.updatedAt ? String(record.updatedAt) : ""
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
      localFields.createdAt !== serverFields.createdAt;
    const localUpdated = localFields.updatedAt;
    const serverUpdated = serverFields.updatedAt;
    return majorDifferent && localUpdated && serverUpdated && localUpdated !== serverUpdated;
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

  async function fetchRecords() {
    const client = getClient();
    if (!client) {
      return { ok: false, status: "local_only", count: 0, records: [], fetchedAt: null, error: "supabase_client_unavailable" };
    }

    try {
      setState({ status: "fetching", lastError: null });
      const user = BabyCloud.userId ? { id: BabyCloud.userId } : await ensureUser();
      if (!user || !user.id) {
        return { ok: false, status: "error", count: 0, records: [], fetchedAt: null, error: "anonymous_auth_failed" };
      }

      const result = await client
        .from("records")
        .select("*")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .order("record_created_at", { ascending: true });

      if (result.error) throw result.error;

      const fetchedAt = new Date().toISOString();
      const rows = Array.isArray(result.data) ? result.data : [];
      const summary = { fetchedAt: fetchedAt, serverCount: rows.length, status: "success" };
      try {
        window.localStorage.setItem("babyAppLastServerFetch", JSON.stringify(summary));
      } catch (storageError) {
        console.warn("BabyCloud fetch status storage failed", storageError);
      }
      setState({
        ready: true,
        mode: "cloud_ready",
        status: "records_fetched",
        userId: user.id,
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
          fetchedAt: new Date().toISOString(),
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

  function normalizeServerRecord(row) {
    if (!isObject(row)) return { ok: false, reason: "row_not_object", row: row };
    if (row.deleted_at) return { ok: false, reason: "deleted_server_record", row: row };
    if (!row.record_id) return { ok: false, reason: "missing_record_id", row: row };

    const payload = row.payload === null || row.payload === undefined ? {} : row.payload;
    if (!isObject(payload)) return { ok: false, reason: "payload_not_object", row: row };

    const type = payload.type || row.type;
    const createdAt = payload.createdAt || row.record_created_at;
    const updatedAt = payload.updatedAt || row.record_updated_at || row.record_created_at || createdAt;

    if (!type) return { ok: false, reason: "missing_type", row: row };
    if (!supportedType(String(type))) return { ok: false, reason: "unsupported_type", row: row };
    if (!createdAt) return { ok: false, reason: "missing_created_at", row: row };
    if (!isValidIsoLike(createdAt) || !isValidIsoLike(updatedAt)) return { ok: false, reason: "invalid_date", row: row };

    const record = {
      id: String(row.record_id),
      type: String(type),
      subtype: payload.subtype || row.subtype || "",
      amount: normalizeAmount(payload.amount !== undefined ? payload.amount : row.amount),
      memo: payload.memo || row.memo || "",
      isSample: Boolean(payload.isSample !== undefined ? payload.isSample : row.is_sample),
      createdAt: new Date(createdAt).toISOString(),
      updatedAt: new Date(updatedAt).toISOString(),
      cloud: {
        status: "synced",
        syncedAt: row.updated_at || row.created_at || new Date().toISOString(),
        error: ""
      }
    };

    return { ok: true, record: record, row: row };
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
      if (row && row.deleted_at) {
        deletedServerRows.push(row);
        return;
      }
      const normalized = normalizeServerRecord(row);
      if (!normalized.ok) {
        invalidServerRows.push(normalized);
        return;
      }
      const record = normalized.record;
      serverValidById.set(record.id, record);
      const localRecord = localById.get(record.id);
      if (!localRecord) {
        serverOnlyRecords.push(record);
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
        createdAt: new Date().toISOString(),
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
    const mergedAt = new Date().toISOString();
    if (!target || !Array.isArray(target.records)) {
      return { ok: false, addedCount: 0, skippedExistingCount: 0, conflictCount: 0, invalidCount: 0, mergedAt: mergedAt, error: "invalid_app_data" };
    }

    const preview = opts.preview || buildMergePreview(target.records, serverRows);
    const backup = {
      reason: "before_server_merge_phase3_2",
      createdAt: mergedAt,
      appVersion: "3.2",
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
      if (!record || !record.id || existingIds.has(String(record.id))) return;
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
