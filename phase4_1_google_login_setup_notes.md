# Phase 4.1 Google Login Setup Notes

## Purpose

Phase 4.1 connects a Google account to the existing family workspace.

Google account is only an identity for accessing the family workspace, not the owner of records.

The app keeps:

- existing `family_id`
- local records
- baby profile
- settings
- backup/restore data

## Supabase Dashboard

1. Open Supabase Dashboard.
2. Go to `Authentication` -> `Providers`.
3. Enable `Google`.
4. Enter the Google OAuth Client ID and Client Secret.
5. Go to `Authentication` -> `URL Configuration`.
6. Add every app URL used for OAuth redirect.

Examples:

- `http://localhost:5500/**`
- `http://localhost:3000/**`
- `https://<your-github-username>.github.io/**`
- `https://<your-domain>/**`

For this app, the code redirects to:

```text
window.location.origin + window.location.pathname
```

That exact URL, or a matching wildcard, must be allowed in Supabase.

## Required Auth Settings

Enable:

- Anonymous sign-ins
- Manual identity linking

Manual identity linking is needed because this phase uses `supabase.auth.linkIdentity()` when available. This keeps the anonymous auth user and connects Google as an identity.

## Google Cloud Console

Create an OAuth 2.0 Client ID for a Web application.

Add authorized JavaScript origins for each app origin:

- `http://localhost:5500`
- `http://localhost:3000`
- `https://<your-github-username>.github.io`
- `https://<your-domain>`

Add the Supabase Auth callback URL as an authorized redirect URI:

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

## Failure Behavior

If Google login is cancelled, misconfigured, or fails:

- the app remains usable
- local records are not deleted
- `family_id` is not deleted
- the anonymous/local mode can continue

## Verification Focus

After setup, verify:

- Google connection keeps the existing `family_id`
- existing records are still visible
- no unnecessary new family is created
- current Google auth user has a `family_members` row
- logout does not delete local records or `family_id`
