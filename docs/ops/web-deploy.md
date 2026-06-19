# Web deploy — mobile app hosted as a static site at ai-budget.pl

**Status: LIVE at https://ai-budget.pl** (ABA-213).

The Expo mobile app is exported to a static SPA and served on the prod VPS with a
tiny dedicated nginx container, fronted by the shared reverse proxy. All app logic
runs in the visitor's browser; data comes from the live `api.ai-budget.pl`.

## Live setup (what's actually deployed)

- **Build**: `scripts/build-web.sh` → `npx expo export --platform web` → `apps/mobile/dist/`
  (SPA, `web.output: "single"`). `EXPO_PUBLIC_API_URL` is baked in at build time
  (defaults to `https://api.ai-budget.pl/api/v1`). Bundle ~24 MB (incl. bundled
  help images).
- **Static container** `ai-budget-web-prod` — `nginx:alpine`, 32 MB limit, on the
  `ai-budget_budget-network`. Compose + SPA config live on the VPS at
  `/opt/ai-budget-web/` (`docker-compose.yml`, `default.conf`, `html/` = the dist).
  Serves the files with SPA `try_files … /index.html` + asset caching.
- **Shared proxy** `shared-nginx` (container; configs at `/opt/shared-nginx/conf.d/`)
  has an apex `server { listen 443 ssl; server_name ai-budget.pl; … proxy_pass
  http://ai-budget-web-prod:80; }` block appended to `ai-budget.conf`. TLS uses the
  existing `/etc/letsencrypt/live/ai-budget.pl/` cert — its SANs already cover the
  apex (`ai-budget.pl`, `admin.`, `api.`), so **no new cert** was needed.
- **CORS**: prod `CORS_ORIGIN` already contains `https://ai-budget.pl`, so the
  browser's calls to `api.ai-budget.pl` are allowed — **no CORS / api change**.

> Before this, the apex had no 443 block and fell through to the first 443 server
> (`www.eksiegowyai.pl`), which 301-redirected to `eksiegowyai.pl`. The new exact
> `server_name ai-budget.pl` block intercepts the apex ahead of that fallback.

> VPS access + specs: see the `prod-vps-ssh-access` memory. The box also hosts the
> live `eksiegowyai.pl` and `marketing-ai` — changes here use graceful `nginx -s
> reload` (never recreate `shared-nginx`).

## Web caveats (CLAUDE.md → Mobile → Platforms)

SQLite/offline-first is disabled on web (in-memory mock); receipts/voice/biometric
degraded. API-backed screens (auth, subscriptions, lists…) work normally.

---

## Deploy an update

**Automatic (CI):** `.github/workflows/web-deploy.yml` runs on every push to
`development` and via `workflow_dispatch`. It builds the bundle **on the GitHub
runner** (not the VPS — no prod load), guards that `dist/index.html` + a JS bundle
exist, then `rsync --delete`s `apps/mobile/dist/` to `/opt/ai-budget-web/html/`
over SSH (same `SSH_HOST`/`SSH_USER`/`SSH_PRIVATE_KEY` secrets as `deploy.yml`),
and verifies `https://ai-budget.pl` returns 200. No container restart / nginx
reload (the `html/` dir is bind-mounted; nginx serves new files immediately;
`index.html` is `no-cache`, hashed assets immutable). Concurrency-guarded so two
web deploys can't race.

**Static SEO blog (ABA-267):** after building `dist/`, the workflow copies the
pre-generated `docs/marketing/seo/site/.` (crawlable HTML `/blog/`, `sitemap.xml`,
`robots.txt`, OG image) into `dist/` so it ships in the same rsync. These are real
files served by the inner nginx's `try_files $uri $uri/ /index.html` before the SPA
fallback — no nginx change. Regenerate after editing any article:
`python docs/marketing/seo/build_blog.py` (needs `markdown` + `Pillow`), then commit
`docs/marketing/seo/site/`.

**Manual fallback** (if CI is unavailable):

```bash
scripts/build-web.sh
rsync -avz --delete -e 'ssh -i ~/.ssh/id_ed25519' \
  apps/mobile/dist/ root@46.225.23.232:/opt/ai-budget-web/html/
```

## Rollback

- **Content**: re-deploy a previous `dist/` (rebuild on the prior git tag, push).
- **Take the app down / restore old behavior**: remove the apex `server` block from
  `/opt/shared-nginx/conf.d/ai-budget.conf` (a timestamped `*.bak.*` backup is kept
  next to it) and `docker exec shared-nginx nginx -t && docker exec shared-nginx
  nginx -s reload`. Stop the container with `docker compose -f
  /opt/ai-budget-web/docker-compose.yml down`.

## One-time setup (already done — recorded for rebuild/DR)

On the VPS:

1. `mkdir -p /opt/ai-budget-web/html` and place the dist (see deploy step).
2. `/opt/ai-budget-web/default.conf` — inner nginx SPA config:

   ```nginx
   server {
       listen 80;
       server_name _;
       root /usr/share/nginx/html;
       index index.html;
       location /_expo/ { expires 1y; add_header Cache-Control "public, immutable"; try_files $uri =404; }
       location ~* \.(?:js|css|png|jpg|jpeg|gif|svg|ico|woff2?)$ { expires 30d; add_header Cache-Control "public"; try_files $uri =404; }
       location = /index.html { add_header Cache-Control "no-cache, no-store, must-revalidate"; }
       location / { try_files $uri $uri/ /index.html; }
   }
   ```

3. `/opt/ai-budget-web/docker-compose.yml`:

   ```yaml
   services:
     web:
       image: nginx:alpine
       container_name: ai-budget-web-prod
       volumes:
         - ./html:/usr/share/nginx/html:ro
         - ./default.conf:/etc/nginx/conf.d/default.conf:ro
       restart: unless-stopped
       deploy:
         resources:
           limits:
             memory: 32M
       networks:
         - budget-network
   networks:
     budget-network:
       external: true
       name: ai-budget_budget-network
   ```
   `cd /opt/ai-budget-web && docker compose up -d`

4. Append to `/opt/shared-nginx/conf.d/ai-budget.conf` (back it up first):

   ```nginx
   # Mobile web app (static SPA) — apex ai-budget.pl (ABA-213)
   server {
       listen 443 ssl;
       server_name ai-budget.pl;
       ssl_certificate     /etc/letsencrypt/live/ai-budget.pl/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/ai-budget.pl/privkey.pem;
       ssl_protocols       TLSv1.2 TLSv1.3;
       ssl_ciphers         HIGH:!aNULL:!MD5;
       ssl_session_cache   shared:SSL_BUDGET_WEB:10m;
       add_header X-Content-Type-Options nosniff always;
       add_header Strict-Transport-Security "max-age=31536000" always;
       resolver 127.0.0.11 valid=30s;
       set $upstream_budget_web http://ai-budget-web-prod:80;
       location / {
           proxy_pass $upstream_budget_web;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```
   Then `docker exec shared-nginx nginx -t && docker exec shared-nginx nginx -s reload`.
   (Apex HTTP→HTTPS is already handled by the existing port-80 block in the same file.)
