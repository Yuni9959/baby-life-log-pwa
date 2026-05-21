// Baby life log - Phase 3.3 Supabase sync helpers.
// Client-safe only: never put service_role keys, DB passwords, or direct DB URLs here.

(function () {
  "use strict";

  const STATUS_EVENT = "baby-cloud-status-change";
  const CLOUD_CONTEXT_KEY = "babyAppCloudContext";
  const APP_STORAGE_KEY = "baby_life_log_app_v2";
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

    ensureDefaultFamilyAndBaby: ensureDefaultFamilyAndBaby,
    getCloudContext: getCloudContext,
    saveCloudContext: saveCloudContext,
    mapLocalRecordToServerRow: mapLocalRecordToServerRow,
    normalizeServerRowToLocalRecord: normalizeServerRowToLocalRecord,
    updateRecord: updateRecord,
    softDeleteRecord: softDeleteRecord,
    softDeleteRecords: softDeleteRecords,
    retryPendingMutations: retryPendingMutations
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

  function nowIso() {
    return new Date().toISOString();
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
    try {
      const raw = window.localStorage.getItem(CLOUD_CONTEXT_KEY);
      context = raw ? JSON.parse(raw) : {};
    } catch (error) {
      context = {};
    }
    const appData = readStoredAppData();
    if (appData && isObject(appData.cloud)) {
      context = Object.assign({}, context, appData.cloud);
    }
    return {
      provider: "supabase",
      currentFamilyId: context.currentFamilyId || null,
      currentBabyId: context.currentBabyId || null,
      currentUserId: context.currentUserId || BabyCloud.userId || null,
      lastSetupAt: context.lastSetupAt || null,
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
      lastSetupAt: source.lastSetupAt || current.lastSetupAt || nowIso(),
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
    return {
      babyName: String(profile.babyName || profile.name || "").trim() || "아기",
      birthDate: /^\d{4}-\d{2}-\d{2}$/.test(String(profile.birthDate || "")) ? String(profile.birthDate) : null
    };
  }

  async function ensureDefaultFamilyAndBaby() {
    const client = getClient();
    if (!client) return null;

    try {
      setState({ status: "checking", lastError: null });
      const user = await ensureUser();
      if (!user || !user.id) throw new Error("anonymous_auth_failed");

      let context = getCloudContext();
      if (context.currentFamilyId && context.currentBabyId) {
        const babyCheck = await client
          .from("babies")
          .select("id,family_id")
          .eq("id", context.currentBabyId)
          .eq("family_id", context.currentFamilyId)
          .maybeSingle();
        if (!babyCheck.error && babyCheck.data) {
          context = saveCloudContext(Object.assign({}, context, { currentUserId: user.id, lastSetupAt: nowIso() }));
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
        .select("id,family_id")
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
          .insert({ family_id: familyId, name: defaults.babyName, birth_date: defaults.birthDate })
          .select("id")
          .single();
        if (createBabyResult.error) throw createBabyResult.error;
        babyId = createBabyResult.data && createBabyResult.data.id;
      }

      if (!familyId || !babyId) throw new Error("family_or_baby_missing");
      context = saveCloudContext({
        currentFamilyId: familyId,
        currentBabyId: babyId,
        currentUserId: user.id,
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
      type: mapRecordType(record.type),
      subtype: mapRecordSubtype(record),
      amount_ml: amountMl,
      note: note,
      recorded_at: createdAt,
      deleted_at: record.deletedAt || null,
      amount: amountMl,
      memo: note,
      is_sample: Boolean(record.isSample),
      app_version: (getConfig() && getConfig().appVersion) || "3.3",
      schema_version: Number((getConfig() && getConfig().schemaVersion) || 2),
      payload: payload,
      record_created_at: createdAt,
      record_updated_at: updatedAt
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
      const currentCloud = isObject(record.cloud) ? record.cloud : {};
      return Object.assign({}, record, {
        cloud: Object.assign({}, currentCloud, cloudPatch || {})
      });
    });
    return changed ? writeStoredAppData(appData) : false;
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
      const context = await ensureDefaultFamilyAndBaby();
      if (!context || !context.currentFamilyId || !context.currentBabyId) {
        return { ok: false, status: "error", recordId: recordId, error: "family_baby_setup_failed" };
      }

      const row = mapLocalRecordToServerRow(record, context);
      const updateResult = await client
        .from("records")
        .update(row)
        .eq("family_id", context.currentFamilyId)
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

  async function updateRecord(record) {
    const recordId = record && record.id ? record.id : null;
    try {
      const client = getClient();
      if (!client) return { ok: false, status: "local_only", recordId: recordId, error: "supabase_client_unavailable" };
      const context = await ensureDefaultFamilyAndBaby();
      if (!context || !context.currentFamilyId) return { ok: false, status: "error", recordId: recordId, error: "family_context_missing" };
      const row = mapLocalRecordToServerRow(record, context);
      const result = await client
        .from("records")
        .update(row)
        .eq("family_id", context.currentFamilyId)
        .eq("client_id", String(record.id))
        .select("id,client_id,updated_at")
        .maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) return saveRecord(record);
      const syncedAt = result.data.updated_at || nowIso();
      saveCloudContext(Object.assign({}, context, { lastSyncAt: syncedAt, lastUpdateSyncAt: syncedAt }));
      setState({ ready: true, mode: "cloud_ready", status: "synced", lastUpdatedAt: syncedAt, lastError: null });
      return { ok: true, status: "synced", recordId: record.id, syncedAt: syncedAt };
    } catch (error) {
      console.warn("BabyCloud record update failed", error);
      setState({ ready: false, mode: "local", status: navigator.onLine === false ? "offline" : "save_failed", lastError: normalizeError(error) });
      return { ok: false, status: "error", recordId: recordId, error: errorMessage(error) };
    }
  }

  async function softDeleteRecord(record) {
    const recordId = record && record.id ? record.id : null;
    try {
      const client = getClient();
      if (!client) return { ok: false, status: "local_only", recordId: recordId, error: "supabase_client_unavailable" };
      const context = await ensureDefaultFamilyAndBaby();
      if (!context || !context.currentFamilyId) return { ok: false, status: "error", recordId: recordId, error: "family_context_missing" };
      const deletedAt = record.deletedAt || nowIso();
      const row = mapLocalRecordToServerRow(Object.assign({}, record, { deletedAt: deletedAt }), context);
      const result = await client
        .from("records")
        .update(row)
        .eq("family_id", context.currentFamilyId)
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
      return { ok: true, status: "synced", recordId: record.id, syncedAt: syncedAt, deletedAt: deletedAt };
    } catch (error) {
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
    const list = Array.isArray(records) ? records : ((readStoredAppData() || {}).records || []);
    const targets = list.filter(function (record) {
      return record && record.cloud && (record.cloud.status === "pending" || record.cloud.status === "error");
    });
    const results = [];
    for (let i = 0; i < targets.length; i += 1) {
      const record = targets[i];
      const result = record.deletedAt ? await softDeleteRecord(record) : await saveRecord(record);
      results.push(result);
      updateStoredRecordCloud(record.id, result && result.ok
        ? { status: "synced", syncedAt: result.syncedAt || nowIso(), error: "" }
        : { status: "error", syncedAt: null, error: (result && result.error) || "retry_failed" });
    }
    return { ok: results.every(function (result) { return result && result.ok; }), count: targets.length, results: results };
  }

  async function testSaveRecord() {
    const now = nowIso();
    const record = {
      id: "test_record_" + Date.now(),
      type: "test",
      subtype: "connection",
      amount: null,
      memo: "Phase 3.3 server test",
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
      if (!context || !context.currentFamilyId) return { ok: false, status: "error", count: 0, records: [], error: "family_context_missing" };
      const result = await client
        .from("records")
        .select("client_id,record_id,type,subtype,note,memo,is_sample,recorded_at,record_created_at,deleted_at")
        .eq("family_id", context.currentFamilyId)
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
      if (!context || !context.currentFamilyId) {
        return { ok: false, status: "error", count: 0, records: [], fetchedAt: null, error: "family_context_missing" };
      }

      const result = await client
        .from("records")
        .select("*")
        .eq("family_id", context.currentFamilyId)
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
      reason: "before_server_merge_phase3_3",
      createdAt: mergedAt,
      appVersion: "3.3",
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
