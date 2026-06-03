# Baby Life Log PWA - Phase 5 Release Notes

Release package: Phase 5.27  
Display version: v5.27  
Deployment target: GitHub Pages PWA for the Play-distributed TWA

## Summary

Phase 5 packages the record-based analysis and reporting work implemented across Phase 5.0 through Phase 5.26. Phase 5.27 does not add new product features. It prepares the existing Phase 5 release candidate for PWA deployment, refreshes PWA version metadata, refreshes the service worker cache version, documents rollback handling, and records release verification status.

## Major Phase 5 Areas

- Shared analysis engine and preprocessing foundations.
- Per-baby baseline analysis.
- Sleep, feeding/burp, and diaper analysis reports.
- Safe report message generation.
- Baby rhythm reference score.
- Daily, weekly, and monthly parent reports.
- Missing-record detection and confidence guidance.
- Age-aware report tone adjustment.
- Doctor visit summary for caregiver reference.
- Cry helper, recent attempt checks, feedback learning, similar situation review, and next-event prediction.
- Predictive alert state for pre-cry review.
- Caregiver handoff summary.
- Family share report.
- Report hub UI.
- Premium boundary, preview, and preview-only guidance.
- Share image preview.
- Browser print/PDF-oriented report preview.

## PWA/TWA Release Principle

- Product updates are shipped from the PWA repository.
- GitHub Pages is the release target.
- The Android wrapper is not changed for this release package.
- No new AAB is required.
- No Play Console upload is required.
- TWA reflection should be checked after GitHub Pages deploys the updated PWA.

## Safety Notes

- Reports are record-based reference views, not medical judgment.
- The app does not diagnose health status.
- Parent/caregiver judgment and the baby's actual signals take priority over report text.
- Existing user data structure is preserved.
- No DB schema, RLS, auth, or family sharing structure changes are included in this package.
- Premium previews do not add billing, subscription verification, Play Billing, or purchase-required flows.

## Cache And Update Notes

- The Phase 5.27 service worker cache name is `baby-life-log-v5-27-release`.
- `ASSETS_TO_CACHE` must contain only files that exist in the PWA repository.
- If an older PWA appears after deployment, update the service worker from browser DevTools or use hard reload/cache clear.
- For the Play-installed TWA, close and reopen the app after the GitHub Pages deployment has completed. If the previous version remains visible, allow the service worker to update or clear the app/browser cache through the normal device settings flow.

## Rollback

Rollback target before this package: `228b486`.

If a deployment issue is found:

1. Revert the release package commit in the PWA repository with `git revert <release-commit>`.
2. Push the revert commit to GitHub.
3. Wait for GitHub Pages deployment.
4. Recheck the PWA URL and the Play-installed TWA.
5. Do not change the Android wrapper or build a new AAB for rollback unless a separate Android-native phase explicitly allows it.

## Verification Scope

The release is ready only when:

- PWA repository changes are committed and pushed.
- GitHub Pages serves v5.27.
- The Play-installed TWA displays the updated PWA.
- Core record, localStorage, Supabase sync, report hub, cry helper, share image preview, and print/PDF preview smoke tests pass or show safe fallback states.
- Android wrapper and native build files remain unchanged.
- Critical issue count is zero.
