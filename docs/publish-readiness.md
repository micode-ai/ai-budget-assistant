# AI Budget Assistant — Google Play Publication Readiness

**Date:** 2026-04-03

## Ready (no action needed)

- App config (package name `com.budget.assistant`, version 1.0.0, permissions, deep links)
- Firebase/push notifications configured
- Privacy Policy + Terms of Service on 8 languages (hosted on GitHub Pages)
- Account deletion (GDPR) — `DELETE /users/me` endpoint
- Offline-first architecture (SQLite + sync queue)
- i18n — 8 languages (en, ru, ua, pl, de, es, fr, be)
- 4 Android widgets (Small, Medium, Large, QuickAction)
- Biometric authentication (Face ID / Fingerprint)
- 72 screens — full feature set
- ProGuard/R8 minification enabled
- Secure storage for tokens (expo-secure-store)
- HTTPS enforced for API communication
- No hardcoded secrets in mobile code

## Critical — must fix before submission

| # | Issue | Details | Status |
|---|-------|---------|--------|
| 1 | **Console.log in api.ts** | 9 console.log statements with request data — security/performance concern for production | Done |
| 2 | **EAS submit track = "internal"** | `eas.json` submit track set to `"internal"`, needs `"production"` for public release | Done |
| 3 | **No React Error Boundary** | React component crash = white screen for user | Done — `ErrorBoundary.tsx` |
| 4 | **Google Play screenshots** | Minimum 2-8 screenshots required for store listing | Done — `apps/mobile/feature_graphic/` |
| 5 | **Feature graphic** | 1024x500px image required for Google Play Store listing | Done — `feature_graphic.png` |
| 6 | **Google Play Service Account JSON** | Required for automated deployment via EAS Submit | Create in Google Cloud Console |
| 7 | **Release keystore** | EAS manages automatically on first production build, but verify | Verify on first build |

## Recommended improvements

| # | What | Why |
|---|------|-----|
| 8 | Crash reporting (Sentry or Firebase Crashlytics) | See real user errors in production |
| 9 | Google Play Developer Account ($25 one-time) | Required to publish on Google Play |
| 10 | Content Rating questionnaire | Mandatory during Google Play Console submission |
| 11 | Network Security Config XML | Explicit certificate pinning for hardened security |
| 12 | Firebase Analytics | Track user engagement and feature adoption |

## Files reference

| File | Purpose |
|------|---------|
| `apps/mobile/app.json` | Main app configuration |
| `apps/mobile/eas.json` | EAS build & submit profiles |
| `apps/mobile/android/app/build.gradle` | Android build config, signing |
| `apps/mobile/android/app/src/main/AndroidManifest.xml` | Permissions, activities, widgets |
| `apps/mobile/google-services.json` | Firebase config |
| `apps/mobile/src/constants/legal.ts` | Privacy Policy & Terms URLs |
| `apps/mobile/src/services/api.ts` | API client (has console.logs to remove) |
| `apps/mobile/assets/` | Icons, splash, widget previews |

## Google Play Store Requirements Checklist

| Requirement | Status |
|-------------|--------|
| App Name | OK — "AI Budget Assistant" |
| Package Name | OK — com.budget.assistant |
| Version Code | OK — 1 |
| Version Name | OK — 1.0.0 |
| Target SDK | OK — meets current requirements |
| Permissions justified | OK — all have clear use cases |
| Privacy Policy URL | OK — per-language URLs |
| GDPR/Data Deletion | OK — DELETE /users/me |
| Keystore/Signing | Needs release keystore (EAS manages) |
| ProGuard/R8 | OK — enabled |
| Icons | OK — icon.png + adaptive-icon.png |
| Screenshots | OK — 6 in `feature_graphic/` |
| Feature Graphic | OK — `feature_graphic.png` 1024x500 |
| Content Rating | Pending — questionnaire in Play Console |
| Support Email | OK — perevertkinma@gmail.com |
| Developer Account | Needs verification ($25) |

## Overall Readiness: ~75%

The app is **functionally complete**. Remaining issues are administrative/asset related rather than code quality problems. Estimated time to submission: 1-2 days of preparation.
