# Public API + OAuth: enable, roll back, pilot

Third-party apps (first: AI Accounting) read and write a user's expenses through `/public/v1`, authorised by OAuth
(consent page `app.ai-budget.pl/authorize`, token endpoints `/oauth/token|revoke`, Swagger at `/public/docs/{en,pl,ru}`).
Everything is behind one flag: **`PUBLIC_API_ENABLED`** (default off; must be `true`, case-insensitive, trimmed). Off means
every `/public/*` and `/oauth/*` route 404s and the Developers / Connected apps settings entries are hidden.
Feature page: `docs/wiki/features/public-api.md`.

## Prerequisites

- The release containing the public-api work is deployed (migrations applied by `scripts/deploy.sh`; the flag is still off).
- SSH to the VPS and a window for an nginx reload (shared-nginx serves every site on the box).
- `docker/nginx/api-public.conf` reviewed. **Not deployed by CI**, and **nothing in this repo has been applied to the VPS.**
- A fresh `.env.production` backup, and the existing nginx files backed up beside the originals.

## Enable sequence

1. **nginx** (window). Back up `/opt/shared-nginx/nginx.conf` and `conf.d/ai-budget.conf` with a timestamp suffix. Apply the three
   parts of `docker/nginx/api-public.conf`: the `budget_public` zone at http level, keyed on the existing `$budget_limit_key` map
   (so CORS preflights are exempt) and declared after it; `location /public/` and `location /oauth/` in the
   `api.ai-budget.pl` server above `location /`. **Copy the proxy lines of the live `location /` exactly** into both new locations
   (`proxy_pass` in the same form, the `resolver` line if `proxy_pass` uses a variable, every `proxy_set_header`, the timeouts,
   `proxy_buffering`, `client_max_body_size`); the snippet's proxy lines are only an illustration. Third, the `frame-ancestors`/`X-Frame-Options` headers in the `app.ai-budget.pl` server
   (repeat them in any location that has its own `add_header`). Edit in place (`cat new > file`, never `sed -i`; see
   `docs/ops/api-rate-limit.md`). Then `docker exec shared-nginx nginx -t`; reload, and confirm the workers cycled (`docker exec
   shared-nginx ps` before and after) or fall back to `docker restart shared-nginx`. Re-check every site afterwards.
2. **Flag.** Set `PUBLIC_API_ENABLED=true` in `/opt/ai-budget/.env.production`, then (`docker restart` does not reload env_file):
   ```bash
   cd /opt/ai-budget
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate api
   ```
3. **Verify** from outside the VPS:
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' https://api.ai-budget.pl/public/docs/en            # 200
   curl -s -w '\n%{http_code}\n' https://api.ai-budget.pl/public/v1/account                   # 401, body {"error":{"code":...}}
   curl -I https://app.ai-budget.pl/authorize | grep -i -E 'frame|content-security'           # both headers present
   curl -s -o /dev/null -w '%{http_code}\n' https://api.ai-budget.pl/api/v1/health            # 200
   ```
4. **Register AI Accounting's app** (as a developer, in the app: Settings, Developers). Exact `redirect_uri` strings, `https://` only.
5. **Mark it verified** in admin, API apps: verified, limits **600 per connection / 10,000 per app**. Without this it runs at the
   default 120 / 1,200 per minute.
6. Run the pilot checklist below with AI Accounting.
7. **Publish the help section** (it stays dark until launch, Ruling 32). `user_docs/*/45-connected-apps.md` exist in all nine
   locales but are registered nowhere. Register `45-connected-apps` in the three places: `scripts/generate-help-content.js`
   (`SECTIONS`), `apps/mobile/src/help/sections.ts` (with an icon and colour) and `docs/marketing/help/build_help.py`
   (`SECTIONS`). Then:
   ```bash
   npm run generate:help                                    # apps/mobile/src/help/content.ts (in-app help, ships with the app)
   LANDING_BASE= ROBOTS="index,follow,max-image-preview:large" python docs/marketing/help/build_help.py
   LANDING_BASE= ROBOTS="index,follow,max-image-preview:large" python docs/marketing/landing/build_landing.py  # sitemaps, llms-full
   git add -f docs/marketing/help/site docs/marketing/landing/site   # docs/marketing is gitignored: new pages 404 otherwise
   ```
   The env-less build emits a `noindex` preview over production, so never run it without those two variables.
8. Announce.

AI Accounting is on the same VPS, so all its calls reach nginx from one IP and share one `budget_public` bucket (50 r/s, burst 200).
Watch `limiting requests ... zone "budget_public"` in the nginx error log during the pilot; raise the rate if it shows up.

## Rollback

Set `PUBLIC_API_ENABLED=false` in `.env.production` and force-recreate `api` (same command as above). Every public route 404s and
the settings entries disappear; grants and tokens stay in the database untouched. The nginx snippets can stay: with the flag off
they proxy to 404s, and the header and zone are harmless. Remove them only if they cause trouble, from the timestamped backups.

## Pilot checklist (manual; automated tests cannot cover these)

- [ ] Consent screen renders correctly at phone width and at >= 1024 on web.
- [ ] Sign-in redirect: opening a consent link while signed out returns to `/authorize` after **password** sign-in AND after **Google** sign-in (Ruling 27).
- [ ] Native: a brand-new user registering from a consent link. Known edge (Ruling 26); record what actually happens.
- [ ] Settings, Developers and Connected apps panes on phone and desktop web, including secret reveal and copy.
- [ ] "Added via <app>" shows on the detail of an expense created through the API.
- [ ] Swagger "Authorize" button flow on `/public/docs/en` completes.
- [ ] Receipt download through `receipts:read` works.
- [ ] The changes feed lags by about 10 s: confirm it is acceptable to the integration.
- [ ] The consent page cannot be framed: `curl -I https://app.ai-budget.pl/authorize` shows `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY`; check an asset path (a location with its own `add_header`) too.
- [ ] A 429 from `/public/` carries `Retry-After`, if it can be provoked. Its CORS headers are present only for our own origins
      (`$budget_cors_origin`); a browser client on a third-party origin sees an unreadable 429 (a CORS error), server-side
      clients are unaffected.
