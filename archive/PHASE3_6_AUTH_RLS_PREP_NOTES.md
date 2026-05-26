# Phase 3.6 Auth/RLS Prep Notes

Phase 3.5 keeps the app on Anonymous Auth and does not add login UI. Phase 3.6 should design the transition before any account screen is implemented.

## Current Phase 3.5 State

- `families`, `babies`, `family_members`, and `records` are the server data boundaries.
- The current anonymous `auth.uid()` is connected to one default family through `family_members`.
- Records are written with `family_id`, `baby_id`, `client_id`, and `device_id`.
- Local records remain the source of immediate UX and are not blocked by Supabase failures.
- Local profile values can be pushed to the current `babies` row.
- Server baby values are not automatically written over local profile values.

## Phase 3.6 Decisions

1. Decide how an anonymous user becomes an email or Google user without losing the existing `auth.uid()` ownership path.
2. Confirm whether Supabase anonymous identities are upgraded in place or linked through a separate recovery flow.
3. Review RLS policies so every `families`, `babies`, and `records` operation checks membership through `family_members`.
4. Define a backup checkpoint before account conversion.
5. Define recovery steps if login conversion fails after local records already exist.
6. Keep login UI, logout UI, family invite UI, and multi-family switching out of Phase 3.6 unless a later PROJECT.md explicitly adds them.

## RLS Review Targets

- `families`: select only when an authenticated user has a `family_members` row.
- `family_members`: select own memberships; insert owner membership only through the controlled default-family flow or a future invite flow.
- `babies`: select/update only for families where `auth.uid()` is a member.
- `records`: select/insert/update only for families where `auth.uid()` is a member, and soft delete through `deleted_at`.

## Data Safety Rules

- Do not delete anonymous records during conversion.
- Do not hard-delete server records.
- Do not overwrite local profile from server baby data without explicit confirmation.
- Keep `client_id` as the idempotency key across devices and retries.
- Keep `device_id` free of names, emails, phone numbers, and other personal data.
