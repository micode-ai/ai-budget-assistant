# Promo leaflets (Gazetka match) — ops runbook

Feature page: `docs/wiki/features/gazetka-match.md`. Reading a leaflet in the app and the admin upload
work as soon as the code is deployed. Only the **community layer** (confirmed promos and the daily push)
is behind a flag, and it ships OFF.

## 1. nginx body size (do this before announcing admin upload or PDF reading)

`shared-nginx` sets `client_max_body_size 10M` globally in `/etc/nginx/nginx.conf`; only `marketing.conf`
raises it. A user PDF of 10 MB becomes about 13.3 MB once base64-encoded, and an admin upload can be 50 MB,
so both would be refused by nginx with a 413 before they reach the API. The app code keeps the product
limits (10 MB PDF, 10 pages per share, 60 pages / 50 MB for admins); nginx needs a per-location override
for `api.ai-budget.pl`.

**The nginx container is shared by several projects (eksiegowyai.pl, marketing-ai and others). Get the
owner's explicit OK first, and use only a graceful reload — never recreate `shared-nginx`.**

1. SSH to the VPS and back up the config: `cp /opt/shared-nginx/conf.d/ai-budget.conf /opt/shared-nginx/conf.d/ai-budget.conf.bak-leaflets`.
2. In the `api.ai-budget.pl` `server { … }` block, before the catch-all `location /`, add:

   ```nginx
   # Promo leaflets: base64 PDFs (user) and multi-page uploads (admin).
   # No trailing slash: `location /api/v1/leaflets/` makes nginx 301-redirect
   # POST /api/v1/leaflets (create) to the slashed URL, which breaks it.
   location /api/v1/leaflets {
       client_max_body_size 60M;
       set $upstream_budget_api http://budget-api-prod:3000;
       proxy_pass $upstream_budget_api;
       proxy_http_version 1.1;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   }
   location /api/v1/admin/leaflets {
       client_max_body_size 60M;
       set $upstream_budget_api http://budget-api-prod:3000;
       proxy_pass $upstream_budget_api;
       proxy_http_version 1.1;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
   }
   ```

   Copy the `proxy_*` lines and the upstream variable from the existing `location /` in the same block
   rather than from this page if they differ (timeouts, headers); only `client_max_body_size` is new.
3. `docker exec shared-nginx nginx -t` — must report `syntax is ok` and `test is successful`.
4. `docker exec shared-nginx nginx -s reload`.
5. Check: a `curl -s -o /dev/null -w "%{http_code}" -X POST https://api.ai-budget.pl/api/v1/leaflets` without a token must answer 401, not 413 or 404.

Rollback: restore the `.bak-leaflets` file, `nginx -t`, reload.

## 2. Enabling the community layer

Prerequisites: `COMMUNITY_PRICE_SALT` set (at least 32 characters; the layer is skipped without it) and
the first deploy smoked (the `LeafletsModule` DI graph, the daily push cron at 09:00 and the prune cron
registered, `GET /api/v1/leaflets/budget` answering 200).

1. In `.env.production` on the VPS set `COMMUNITY_PROMOS_ENABLED=true`. Optionally set
   `COMMUNITY_PROMO_K` (default 3) and `COMMUNITY_PROMO_MIN_TRUSTED` (default 2). For a test period with
   a few accounts, lower K and trusted the way `COMMUNITY_PRICE_K` was lowered, and remove the overrides
   when real users arrive.
2. `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate api`
   (`docker restart` does not reload `env_file`).
3. Verify: an admin publish on the dashboard Leaflets page confirms its promos at once; a user who bought at
   that chain in the last 90 days with the "Leaflet promos" notification on gets one push at the next 09:00 run.

Admin leaflets published while the flag was OFF wait as rows and are picked up when it is turned on.

## 3. Rollback

Set `COMMUNITY_PROMOS_ENABLED=false` (or remove it) and force-recreate `api` with the same command as
above. Contribution, confirmation and the push stop; reading a leaflet in the app keeps working. Nothing
needs to be deleted — a promo is never shown after its `validTo`, and the prune cron removes old rows.
To withdraw one wrong admin leaflet, use **Unpublish** on the dashboard. Rows written by an admin reading
in the app (not through the dashboard) have no leaflet id and cannot be withdrawn that way — delete them by hand.

## 4. Notes

- Admin read progress is held in memory, so run one `api` instance. A read interrupted by a deploy is
  marked failed after 30 minutes and can be uploaded again.
- A deploy force-recreates `api`; do not deploy while an admin read is in flight if you can avoid it.
