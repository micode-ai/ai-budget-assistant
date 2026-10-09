# Group short link on the apex (ABA-649)

`https://ai-budget.pl/g/<token>` answers **302** to `https://api.ai-budget.pl/g/<token>`. The guest
page stays on the API host; this is a redirect, **not** a proxy (a proxy would move the page to a new
origin and every existing guest's host-only cookie would stop being sent). `APP_PUBLIC_URL` is never
changed: it builds the `s/` and `sl/` links and the guest controller's own-origin check.

Status: **built, NOT yet activated** (2026-10-09). Until both steps below are done the app keeps
handing out `https://api.ai-budget.pl/g/<token>` links and nothing changes.

Pieces:

- nginx snippet: `docker/nginx/apex-group-short-link.conf` (not deployed by CI; the live config is
  `/opt/shared-nginx/conf.d/ai-budget.conf` on the VPS).
- API env `GROUP_SHARE_BASE_URL` (used only by `GroupsService.buildGuestUrl`; unset falls back to
  `APP_PUBLIC_URL`, then `https://api.ai-budget.pl`).

The redirect matches only `^/g/[A-Za-z0-9_-]{8,128}/?$` and carries over the token alone (no query,
no further path, constant target host). Anything else under `/g/` on the apex is a 404. The redirect
sets `Referrer-Policy: same-origin`, `Cache-Control: no-store`, `X-Robots-Tag: noindex`.

**Order matters: nginx first, verify, then the env.** Setting the env first makes every new QR and
share link 404.

## Gotchas on this box

- `shared-nginx` bind-mounts config as single files. `sed -i` replaces the inode and the container
  keeps reading the old one. Edit in place (`cat new > file` / an editor that truncates), and after
  editing grep the file **from inside the container**.
- `nginx -s reload` / SIGHUP has not reliably applied changes here; only `docker restart shared-nginx`
  did (1-3 s blip on every site on the box). `nginx -t` passing proves nothing about whether the edit
  landed. See `docs/wiki/features/web-build-and-hosting.md`.
- A regex location beats a plain prefix location, but a `^~` prefix beats a regex: do not put `^~`
  on `location /g/`.

## Apply (on the VPS, needs a window of seconds)

1. Back up: `cp /opt/shared-nginx/conf.d/ai-budget.conf /opt/shared-nginx/conf.d/ai-budget.conf.bak.$(date +%F)`
2. Check the apex block has no existing `/g/` location: `grep -n 'location' /opt/shared-nginx/conf.d/ai-budget.conf`.
3. Paste the two `location` blocks from `docker/nginx/apex-group-short-link.conf` into the
   `server_name ai-budget.pl` block above `location /`, editing in place (no `sed -i`).
4. Confirm inside the container: `docker exec shared-nginx grep -n 'gtoken' /etc/nginx/conf.d/ai-budget.conf`
   (adjust the path to wherever the file is mounted) and `docker exec shared-nginx nginx -t`.
5. Apply: `docker exec shared-nginx nginx -s reload`, then re-run the verification below; if it still
   behaves as before, `docker restart shared-nginx`.

## Verify (from your laptop, with a real live token)

```
curl -sI https://ai-budget.pl/g/<token>          # 302, Location: https://api.ai-budget.pl/g/<token>,
                                                 # Referrer-Policy: same-origin, Cache-Control: no-store
curl -sI 'https://ai-budget.pl/g/<token>?x=1'    # same Location, query NOT carried
curl -sI https://ai-budget.pl/g/<token>/         # 302 (trailing slash)
curl -sI https://ai-budget.pl/g/<token>/restore  # 404
curl -sI https://ai-budget.pl/g/short            # 404 (under 8 chars)
curl -sI 'https://ai-budget.pl/g/%2f%2fevil.com' # 404
curl -sI https://ai-budget.pl/                   # unchanged (landing)
```

Then open the apex link in a browser that already joined that group and confirm you are still
identified (same host, same cookie). Only then continue.

## Activate the API side

1. On the VPS add to `/opt/ai-budget/.env.production`: `GROUP_SHARE_BASE_URL=https://ai-budget.pl`
2. `cd /opt/ai-budget && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate api`
   (`docker restart` does not reload `env_file`).
3. Check `GET /groups/:id` returns `guestUrl` with the apex host and the link opens the page.

Old `api.ai-budget.pl/g/...` links keep working forever.

## Rollback

- API: remove the `GROUP_SHARE_BASE_URL` line and force-recreate `api` (new links revert to the API
  host; links already shared on the apex keep working while the nginx block stays).
- nginx: restore the `.bak.<date>` file, check it from inside the container, `docker restart
  shared-nginx`. Do this only after the API rollback, or shared apex links 404.
