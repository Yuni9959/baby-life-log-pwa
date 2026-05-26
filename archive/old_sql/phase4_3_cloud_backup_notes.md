# Phase 4.3 Cloud Backup Notes

## Scope

Phase 4.3 connects OAuth identity to the existing family workspace and adds a safe cloud backup/restore foundation.

```text
OAuth identity is only an access layer.
The true owner of records is the family workspace.
```

This phase implements upload, restore, and reconnect foundations only. Full realtime sync, live collaborative editing, advanced conflict resolution, server-side device management, and billing are out of scope.

## Implemented Files

- `phase4_3_sql_migration.sql`: adds `profiles`, `families.family_code`, unique account/family codes, stable `family_members(family_id, user_id)`, role/status constraints, family-scoped RLS, and helper RPCs.
- `cloud-supabase.js`: creates or preserves `account_code` and `family_code`, uploads local records by `family_id`, and restores server records without deleting local records.
- `index.html`: shows account code, family code, cloud backup status, last upload/restore time, and local/server record counts.

## Backup Policy

- Local records are read from localStorage and normalized to the current `family_id` and baby context.
- Upload uses `records.family_id`, `records.baby_id`, and `client_id` conflict handling.
- Backup failures are soft failures. The UI must not turn a successful local save into a failed save because cloud upload failed.
- Failures are logged with `[CloudBackup]` and `console.warn`.

## Restore Policy

- Family restore starts from an authenticated user plus a `FAM-XXXX-XXXX` family code.
- Only records from the connected `family_id` are fetched.
- Server-only records are added to localStorage.
- Existing local records with the same id are not overwritten by server records in Phase 4.3.
- Local records, baby profile, settings, and family context are preserved.

## Supabase Setup

1. Open the Supabase SQL editor.
2. Run `deliverables/phase4_3_sql_migration.sql`.
3. Confirm these objects exist:
   - `public.profiles`
   - `public.families.family_code`
   - unique indexes on `profiles.account_code`, `families.family_code`, and `family_members(family_id, user_id)`
   - RPCs: `ensure_current_profile`, `ensure_family_code`, `link_current_user_to_family`, `join_family_by_family_code`

## Manual Test Path

1. Open `deliverables/index.html` in the configured app environment.
2. Run the family/baby server structure check.
3. Connect Google or Kakao.
4. Confirm `account_code` starts with `ACCT-`.
5. Confirm `family_code` starts with `FAM-`.
6. Click the local records cloud backup button.
7. Confirm local record count and uploaded count match expected non-test records.
8. On a new device/browser profile, enter the `FAM-` code and connect.
9. Confirm server records are restored into localStorage without deleting or overwriting existing local records.

## Security Notes

`family_code` is a workspace connection code, not the database owner. The database owner remains `family_id`.

For production invitation flows, add approval, expiry, one-time invite codes, or role-limited invitations. Phase 4.3 intentionally keeps this simple so backup and restore can be validated first.

## Known Limitations

- Live Google/Kakao provider switching must be verified against the real Supabase project.
- RLS and RPC behavior must be verified after applying the SQL migration.
- Restore conflict handling is conservative and skips existing local records instead of merging field-level differences.
