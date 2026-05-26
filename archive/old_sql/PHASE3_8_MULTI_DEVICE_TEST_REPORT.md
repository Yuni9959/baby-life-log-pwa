# Phase 3.8 Multi-Device Test Report

## 1. Scope

Phase 3.8 adds Family Identity and Multi-Device Foundation features:

- family access code generation
- access-code based family join
- stable device identity
- linked device list
- family context diagnostics
- family_id based server record fetch
- client_id dedupe support
- localStorage backup before family change

## 2. Automated Checks Run by Coder

| Check | Result | Notes |
| --- | --- | --- |
| `node --check deliverables/cloud-config.js` | PASS | Cloud config syntax is valid. |
| `node --check deliverables/cloud-supabase.js` | PASS | Browser APIs are referenced but syntax is valid. |
| `node --check deliverables/service-worker.js` | PASS | Service worker syntax is valid. |
| `node --check deliverables/sw.js` | PASS | Legacy service worker syntax is valid. |

## 3. Supabase SQL Verification

| Item | Result | Notes |
| --- | --- | --- |
| Run `deliverables/supabase_phase3_8_family_identity.sql` in Supabase SQL Editor | NOT VERIFIED | Requires Supabase project access. |
| `families.access_code` exists and is unique | NOT VERIFIED | SQL adds the column and a unique partial index. |
| `families.created_by` exists | NOT VERIFIED | SQL adds the column for Phase 4 Auth migration. |
| `devices` table exists | NOT VERIFIED | SQL creates table, indexes, timestamp trigger, and RLS policies. |
| `ensure_family_access_code(uuid)` RPC works | NOT VERIFIED | Must be called after SQL execution. |
| `create_family_with_access_code(...)` RPC works | NOT VERIFIED | Optional bootstrap RPC included for first-device setup. |
| `join_family_by_access_code(...)` RPC works | NOT VERIFIED | Must be tested from a second browser profile/device. |
| `upsert_device(...)` and `get_linked_devices(...)` RPCs work | NOT VERIFIED | Can be tested after joining a family. |
| Existing records preserved | NOT VERIFIED | SQL is additive and does not delete records. |

## 4. Manual Multi-Device Test Plan

Use two physical devices, or two browser profiles with separate localStorage.

| Scenario | Expected Result | Result |
| --- | --- | --- |
| First device opens app and runs "가족/아기 서버 구조 확인" | Family, baby, device, and access code are prepared. | NOT VERIFIED |
| First device clicks "가족 코드 복사" | Current family access code is copied. | NOT VERIFIED |
| Second device enters code and clicks "가족 연결하기" | localStorage backup is created and second device joins the same `family_id`. | NOT VERIFIED |
| Linked devices refresh | Both devices appear in connected device list. | NOT VERIFIED |
| Server records refresh after joining | Records are fetched by `family_id`. | NOT VERIFIED |
| Safe merge on second device | Server-only records are merged locally after backup. | NOT VERIFIED |

## 5. Record Sync Regression Checklist

| Record Type | Expected Result | Result |
| --- | --- | --- |
| feeding | Saves locally first and syncs to Supabase. | NOT VERIFIED |
| diaper | Saves locally first and syncs to Supabase. | NOT VERIFIED |
| burp | Saves using Phase 3.7.1 type/subtype mapping. | NOT VERIFIED |
| sleep_start | Saves using Phase 3.7.1 type/subtype mapping. | NOT VERIFIED |
| wake | Saves using Phase 3.7.1 type/subtype mapping. | NOT VERIFIED |
| Duplicate prevention | Same `family_id + client_id` is not duplicated. | NOT VERIFIED |
| Conflict rule | Server-newer records win during safe merge. | NOT VERIFIED |
| Sync badge | Existing sync badge states still render. | NOT VERIFIED |

## 6. Tester Notes

- Do not run browser-only files with plain `node file.js`.
- Use `node --check` for syntax only.
- Apply `supabase_phase3_8_family_identity.sql` before testing family code features.
- If RLS blocks direct table reads, verify the Phase 3.8 RPC functions first.
- Any item not actually tested in Supabase SQL Editor or a browser/PWA must stay `NOT VERIFIED`.
