# Web deploy — host the mobile app as a static site

The Expo mobile app can be exported to a **static web bundle** and served by the
existing `accounting-nginx` with ~zero extra RAM (no new app process — nginx just
hands out files; all app logic runs in the visitor's browser, data still comes
from the live `api.ai-budget.pl`).

This is intentionally lightweight infra: a folder of files + one nginx `server`
block. Nothing here adds a container or memory pressure to the prod stack.

## Domain: serve at the apex `ai-budget.pl`

Use the **apex** `ai-budget.pl`, not a subdomain. Reason: prod `CORS_ORIGIN`
already includes `https://ai-budget.pl` (see CLAUDE.md → Production → CORS), so the
browser's cross-origin calls to `api.ai-budget.pl` work **without any CORS change
or `api` restart**. A new subdomain (e.g. `app.ai-budget.pl`) would require adding
it to `CORS_ORIGIN` in `.env.production` and force-recreating the `api` container.

> ⚠️ **Confirm what currently serves `ai-budget.pl`.** If a landing/marketing page
> lives there today, this replaces it. If it's empty/placeholder, you're clear.

## Web caveats (already known, see CLAUDE.md → Mobile → Platforms)

Web is for UI/quick testing, not full functional use: SQLite/offline-first is
disabled (in-memory mock), and receipts/voice/biometric are degraded. API-backed
screens (auth, subscriptions, lists, etc.) work normally.

---

## 1. Build the static bundle

```bash
scripts/build-web.sh
```

- Output: `apps/mobile/dist/` (gitignored — never committed).
- `EXPO_PUBLIC_API_URL` is baked in at build time; the script defaults to
  `https://api.ai-budget.pl/api/v1`. Override only to point at a local API.
- Contents: `index.html`, one `_expo/static/js/web/index-*.js` bundle (~9 MB),
  `favicon.ico`, and hashed assets. SPA (`web.output: "single"` in `app.json`) →
  all routing is client-side, so nginx must fall back to `index.html`.

## 2. One-time VPS setup

### a. Place + mount the web root

Pick a host path, e.g. `/srv/ai-budget-web/`, and mount it **read-only** into the
`accounting-nginx` container (in that stack's compose file):

```yaml
    volumes:
      - /srv/ai-budget-web:/usr/share/nginx/html/ai-budget:ro
```

Recreate nginx once after adding the mount:

```bash
docker compose -f <accounting-nginx-compose>.yml up -d --force-recreate <nginx-service>
```

### b. nginx server block for ai-budget.pl

Add to the `accounting-nginx` config (alongside the existing `api.`/`admin.`
blocks). TLS lines assume Let's Encrypt the same way the other vhosts get certs —
issue/extend the cert to cover `ai-budget.pl` (and `www.` if desired) first
(`certbot --nginx -d ai-budget.pl -d www.ai-budget.pl`, or your existing flow).

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name ai-budget.pl www.ai-budget.pl;
    # ACME challenge handled by your existing certbot setup; redirect the rest:
    return 301 https://ai-budget.pl$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ai-budget.pl;

    ssl_certificate     /etc/letsencrypt/live/ai-budget.pl/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ai-budget.pl/privkey.pem;

    root /usr/share/nginx/html/ai-budget;   # = the mounted /srv/ai-budget-web
    index index.html;

    # Hashed JS/assets are immutable — cache hard.
    location /_expo/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }
    location ~* \.(?:js|css|png|jpg|jpeg|gif|svg|ico|woff2?)$ {
        expires 30d;
        add_header Cache-Control "public";
        try_files $uri =404;
    }

    # SPA fallback — every unknown path serves index.html (client-side routing).
    # index.html itself must NOT be cached, so new deploys are picked up.
    location / {
        try_files $uri $uri/ /index.html;
    }
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
}
```

Reload nginx after editing the config:

```bash
docker exec <nginx-container> nginx -t && docker exec <nginx-container> nginx -s reload
```

## 3. Deploy / update (each release)

```bash
scripts/build-web.sh
rsync -avz --delete apps/mobile/dist/ <SSH_USER>@<SSH_HOST>:/srv/ai-budget-web/
```

No nginx reload needed for content updates (static files are served directly).
`--delete` removes stale hashed bundles. Because `index.html` is sent
`no-cache`, visitors get the new bundle on their next load.

## 4. (Optional) CI automation

Mirror `deploy.yml`'s SSH pattern (`appleboy/ssh-action`, secrets `SSH_HOST` /
`SSH_USER` / `SSH_PRIVATE_KEY`). A `workflow_dispatch` job that runs
`scripts/build-web.sh` then rsyncs `apps/mobile/dist/` to the web root. Deferred
until the host path + mount above are settled — wire it up once the manual flow
is verified.

## Rollback

Keep the previous `dist/` (or re-run `build-web.sh` on the prior git tag) and
rsync it back. Static files have no migrations/state, so rollback is instant.
