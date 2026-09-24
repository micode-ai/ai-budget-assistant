# Web build and hosting

*Hub: [mobile-app](../mobile-app.md)*

## What this is

The Expo app also builds for the browser. That build is a real product — `app.ai-budget.pl` — not
a preview, and it ships on every push to `development`. This page covers the platform split in the
source, how the bundle is built, and the two nginx containers that serve it alongside the
marketing site.

## Entry points

- `scripts/build-web.sh` — `expo export --platform web` → `apps/mobile/dist/`
- `.github/workflows/web-deploy.yml` — builds on the runner, rsyncs to the VPS
- `apps/mobile/scripts/inject-pwa-tags.js` — PWA tags, called from `build-web.sh`
- `apps/mobile/public/manifest.webmanifest` — copied verbatim into `dist/`
- Platform variants: `secureStorage.web.ts`, `db/client.web.ts`, `useBiometric.web.ts`

Runbook: `docs/ops/web-deploy.md`.

## Key concepts

**Platform splits are per file, never per route.** A `.web.tsx` / `.web.ts` sibling replaces the
native module in the web bundle. `secureStorage` uses `localStorage`, `db/client.web.ts` is an
in-memory mock, `useBiometric` is a no-op. `expo-notifications`,
`react-native-android-widget` and `expo-screen-orientation` are guarded by `Platform.OS === 'web'`
or a platform file.

**Two containers, one reverse proxy.** `ai-budget-app-prod` serves the SPA at
`app.ai-budget.pl` from `/opt/ai-budget-app/html`; `ai-budget-web-prod` serves the apex
`ai-budget.pl` (marketing landing, blog, help) from `/opt/ai-budget-web/html`. Both sit behind the
shared `shared-nginx`, whose config lives at `/opt/shared-nginx/conf.d/ai-budget.conf`. The apex is
canonical: `www` has its own 443 block that 301s to it.

**`web-deploy.yml` has two rsync targets** — the SPA bundle to the app container's root, and the
assembled apex tree (landing + `/blog` + `/help` + sitemap/robots) to the web container's. It
**copies the committed `site/` trees and never runs the generators**.

## Invariants

**`shared-nginx` has no `default_server`.** Any new `*.ai-budget.pl` host needs its own server
block or it silently lands on an unrelated site on the same box.

**The SPA is `noindex`.** `app.ai-budget.pl`'s block adds `X-Robots-Tag: noindex, nofollow`, and so
does `admin.ai-budget.pl`. Only the apex is indexable. The apex container uses
`try_files $uri $uri/ =404` with a real `404.html` — not the SPA fallback, which would produce soft
404s; the app container keeps `try_files … /index.html` for client routing.

**`docs/marketing` is gitignored**, so a newly generated asset needs `git add -f` or it 404s in
production while looking correct locally. `web-deploy.yml` carries a `test -f` guard for at least
one such asset after a badge shipped blank for two deploys.

**`app/+html.tsx` does not work here and must not be re-added.** With `web.output: "single"` —
the setting the nginx SPA fallback assumes — Expo SDK 54 renders its own shell and ignores that
file. Verified by building with `--clear` and diffing, not assumed. PWA tags are injected by a
script instead, which fails the build when `</head>` is absent, and `build-web.sh` greps the result
afterwards: a silent no-op would ship an app nobody can install.

**The PWA exists because there is no native iOS app.** "Add to Home Screen" is the only way an
iPhone gets an app-shaped AI Budget Assistant, so the manifest and icons are not decoration. The
manifest's `background_color: #000000` matches `expo-splash-screen.backgroundColor` in `app.json` so
launch does not flash; `orientation` is deliberately **omitted**, because `useOrientationLock`
already locks phones to portrait and unlocks tablets from JS, and a manifest value would fight it.
`apple-mobile-web-app-status-bar-style` is `default`, never `black-translucent` — translucent puts
content under the status bar, and the web layout has none of the native app's safe-area handling.

**Icons come in three shapes for three consumers**, all regenerated from `assets/icon.png` by
`apps/mobile/scripts/generate-web-icons.py`: `icon-192`/`icon-512` for the manifest;
`icon-maskable-512` scaled into the inner **80% safe zone**, because a maskable slot is cropped to
the launcher's shape and a full-bleed icon loses the top of the wallet; and `apple-touch-icon.png`
flattened opaque, because **iOS reads none of the manifest** — without that `<link>` an installed
shortcut uses a screenshot of the page as its icon.

**A single-file bind mount does not survive `sed -i`.** `nginx.conf` is mounted as one file, so an
edit that replaces the inode leaves the container reading the old one — truncate in place. And
neither `nginx -s reload` nor `SIGHUP` reliably cycles the workers here; only
`docker restart shared-nginx` applied a config change, at the cost of 1–3 s across every site on
the box. `nginx -t` passing proves nothing about whether your edit landed — grep the file from
inside the container.

**Do not run `docker volume prune` or `docker image prune -a` on this host.** One Docker daemon is
shared with several unrelated projects; the volumes include the production database and
unused-but-tagged images are another project's rollback target.

## Known gaps

- Offline-first flows are inert on web: `db/client.web.ts` returns `[]` for every read, so anything
  that gates on a local-row count behaves as if the account were empty. Several bugs have come from
  code that reads a persisted value on a path only native reaches.
- No service worker, so Chrome shows "Add to home screen" rather than an install prompt; iOS
  installs from the manifest alone. Deliberate: a naive shell-caching worker risks serving a stale
  JS bundle, and the web app has no offline story to cache for (no SQLite on web).
- Logging limits are set on the four compose-managed containers only; the two hand-created
  ai-budget web containers and `shared-nginx` have no `max-size`, and one had reached 244 MB.

## History

ABA-213 (static hosting) · ABA-234 (`www` → apex, cert expanded) · ABA-235 (web has no biometric,
so both the session-restore and the logout paths must gate token retention on
`Platform.OS !== 'web'` — otherwise a logout keeps tokens and the next refresh signs the user back
in) · ABA-269 (SPA moved to `app.ai-budget.pl`, apex became the marketing landing) · ABA-271 (real
404s, SPA noindex) · ABA-488 (PWA manifest and icons) · ABA-522 (the API rate limit that made cold
starts fail invisibly on web).
