# Phase 4.2 Kakao Login Notes

## Core Rule

Kakao account is only an identity for accessing the family workspace, not the owner of records.

The app must keep using `family_id` as the owner boundary for babies and records. Kakao OAuth must not replace `family_id` with `auth.uid()`.

## Supabase Setup

1. Open Supabase Dashboard.
2. Go to Authentication > Providers > Kakao.
3. Enable Kakao.
4. Set Kakao REST API Key as the Supabase Kakao Client ID.
5. Set the Kakao Client Secret if the Kakao app has Client Secret enabled.
6. Confirm the Supabase callback URL is registered in Kakao Developers:

```text
https://vburjgyfjhgtkulabrnf.supabase.co/auth/v1/callback
```

## App Redirect URL

The client uses a dynamic redirect target:

```js
window.location.origin + window.location.pathname
```

For the expected GitHub Pages deployment, register this app URL in Supabase Auth redirect URLs:

```text
https://yuni9959.github.io/baby-life-log-pwa/
```

Do not hard-code localhost in the app.

## Local Data Preservation

Before Kakao OAuth starts, the app stores:

```text
babylog_pending_family_id_before_oauth
babylog_oauth_started_at
babylog_oauth_provider
```

After redirect, `restoreAuthAndFamilyAfterLogin()` restores family context in this order:

1. Current local `family_id`
2. Pending OAuth `family_id`
3. Existing server `family_members` row
4. New family only when no prior family context exists

## Known Limitation

Live Kakao success requires Supabase Kakao Provider and Kakao Developers settings to be configured outside the codebase. If those settings are missing or mismatched, OAuth can fail, but local records and `family_id` must remain available.
