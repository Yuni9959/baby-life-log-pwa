# PWA/TWA Release Policy

Phase: 5.20 Play-distributed TWA/PWA Release Guard v1

## 1. Release Principle

This app is a Play-distributed TWA/PWA app.

Most product updates must be implemented in the PWA repository:

```text
C:\Users\tmddb\baby-life-log-pwa
```

Most product updates are shipped through GitHub Pages. After GitHub Pages deploys the updated PWA, the Play-installed TWA app should receive the updated web app without changing the Android wrapper.

The Android wrapper is protected by default. Do not edit Android wrapper files unless the phase is explicitly declared as an Android native task.

Do not request or build a new AAB unless the phase is explicitly declared as an Android native task or Play Console build task.

## 2. Protected Android Wrapper Areas

The following paths and files are treated as Android wrapper or native build surface. They must not be changed during normal PWA product updates:

```text
app/
android/
gradle/
.gradle/
build.gradle
build.gradle.kts
settings.gradle
settings.gradle.kts
gradle.properties
local.properties
AndroidManifest.xml
MainActivity.kt
MainActivity.java
TWA launcher native files
Gradle wrapper files
Play Console AAB build settings
```

Normal PWA phases must not perform these actions:

```text
Create a new AAB
Change targetSdk
Change minSdk
Change compileSdk
Add native permissions
Change Android package name
Change TWA URL
Change Android app name
Change Android app icon
Change Android native code
Upload to Play Console
```

## 3. Android Native Task Exceptions

Android wrapper changes are allowed only when the phase explicitly targets one of these native concerns:

```text
Android app icon change
Android app name change
AndroidManifest change
Native permission change
targetSdk / compileSdk change
TWA URL change
Android native code change
Play Console / AAB build work
```

If the work is not explicitly one of the above, keep the work in the PWA repository and release through GitHub Pages.

## 4. PWA Release Checklist

Run this checklist before every GitHub Pages release:

- [ ] Changed files are inside the PWA repository.
- [ ] Android wrapper files are unchanged.
- [ ] `build.gradle` and `build.gradle.kts` are unchanged.
- [ ] `AndroidManifest.xml` is unchanged.
- [ ] `MainActivity.kt`, `MainActivity.java`, and native launcher code are unchanged.
- [ ] `index.html` and related JS/CSS load without syntax errors.
- [ ] `service worker` cache version was reviewed and changed if needed.
- [ ] Every `ASSETS_TO_CACHE` entry exists in the PWA repository.
- [ ] `manifest.json` changes are necessary for the current task.
- [ ] App icon, app name, TWA URL, and native permissions were not changed unless this is an Android native task.
- [ ] `git status --short` was reviewed in the PWA repository.
- [ ] GitHub Pages deployment shows the expected version.
- [ ] The Play-installed TWA app reflects the updated PWA after deployment and cache refresh.
- [ ] A new AAB is not needed for this release.

## 5. PWA Deployment Flow

Use this release flow for normal product updates:

```text
1. Generate or update PWA deliverables from my-launchpad.
2. Copy the output into C:\Users\tmddb\baby-life-log-pwa.
3. Include related files only when they are part of the PWA change:
   cloud-supabase.js
   sw.js
   manifest.json
   icons/
   illus/
4. In the PWA repository, review git status.
5. Run the PWA release guard.
6. Commit and push the PWA repository.
7. Confirm the GitHub Pages deployment.
8. Confirm the Play-installed TWA app shows the updated PWA.
```

Example commands:

```powershell
cd C:\Users\tmddb\baby-life-log-pwa
git status --short
.\scripts\check-pwa-release-guard.ps1
git add .
git commit -m "Phase 5.20: add PWA TWA release guard"
git push
```

Adjust the commit message to match the actual release.

## 6. Service Worker Cache Rules

Review the service worker on every release that changes `index.html`, JS, CSS, or major assets.

Rules:

- Review `CACHE_NAME` when `index.html`, JS, CSS, or major assets change.
- Change `CACHE_NAME` when users must receive a new cached app shell.
- Do not add missing files to `ASSETS_TO_CACHE`.
- Every `ASSETS_TO_CACHE` entry must exist in the PWA repository.
- Do not precache every `illus/` image by default.
- Only precache files that are necessary for app startup or reliable offline behavior.
- If GitHub Pages shows the new version but the installed app shows old UI, check hard reload, service worker update, and cache deletion.

Recommended cache name pattern for this phase when an actual service worker update is required:

```js
const CACHE_NAME = "baby-life-log-v5-20-release-guard";
```

This phase does not require a service worker cache version change when only policy documents and guard scripts are added.

## 7. ASSETS_TO_CACHE Validation Rule

Before release, validate that every path listed in `ASSETS_TO_CACHE` maps to an existing file.

Required result:

```text
MISSING: 0
```

If any entry is missing, do not release until one of these fixes is made:

- Restore the missing file.
- Correct the path.
- Remove the entry from `ASSETS_TO_CACHE` if it should not be precached.

Missing precache files can cause `cache.addAll()` to reject and make service worker install fail.

## 8. AAB Decision Rule

New AAB is not needed for:

```text
HTML/CSS/JS feature changes
UI changes
PWA analysis logic changes
Supabase web integration changes
service worker changes
PWA asset changes
Report, cry reason, prediction, handoff, family share PWA feature changes
```

New AAB may be needed only for:

```text
Android app icon change
Android app name change
AndroidManifest change
Native permission addition or change
targetSdk / compileSdk change
TWA URL change
Android native code change
Play Console build work
```

When in doubt, treat the task as a PWA release and do not touch the Android wrapper until the phase explicitly says it is a native task.

## 9. Required Guard

Run this before release:

```powershell
cd C:\Users\tmddb\baby-life-log-pwa
.\scripts\check-pwa-release-guard.ps1
```

Use `-AllowNativeTask` only when the current phase explicitly permits Android native changes:

```powershell
.\scripts\check-pwa-release-guard.ps1 -AllowNativeTask
```

## 10. Phase 5.20 Completion Check

```js
const phase520CompletionCheck = {
  completed: true,
  items: [
    { key: "pwa_twa_release_policy_documented", label: "PWA/TWA release policy documented", status: "done", required: true },
    { key: "pwa_repo_github_pages_principle_documented", label: "PWA repo and GitHub Pages update principle documented", status: "done", required: true },
    { key: "android_wrapper_no_edit_principle_documented", label: "Android wrapper no-edit principle documented", status: "done", required: true },
    { key: "new_aab_not_required_principle_documented", label: "New AAB not required by default", status: "done", required: true },
    { key: "android_wrapper_exception_conditions_documented", label: "Android wrapper exception conditions documented", status: "done", required: true },
    { key: "pwa_release_checklist_created", label: "PWA release checklist created", status: "done", required: true },
    { key: "service_worker_cache_version_rule_documented", label: "Service worker cache version rule documented", status: "done", required: true },
    { key: "assets_to_cache_path_validation_rule_documented", label: "ASSETS_TO_CACHE path validation rule documented", status: "done", required: true },
    { key: "new_aab_decision_rule_documented", label: "New AAB decision rule documented", status: "done", required: true },
    { key: "android_wrapper_change_guard_created", label: "Android wrapper change guard created", status: "done", required: true },
    { key: "phase4_regression_unchanged", label: "Existing Phase 4 functionality not modified", status: "done", required: true },
    { key: "phase5_regression_unchanged", label: "Existing Phase 5 functionality not modified", status: "done", required: true }
  ],
  missingRequiredItems: [],
  notes: [
    "Phase 5.20 adds policy and guard artifacts only.",
    "No Android wrapper, AAB, Play Console, DB, auth, RLS, RPC, or product feature changes are required."
  ]
};
```
