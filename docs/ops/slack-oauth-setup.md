# Slack Multi-Workspace OAuth — Setup Checklist (ABA-200)

What to do to make "Add to Slack" work for **other** workspaces. The original
workspace keeps working without any of this (env-token fallback).

Order matters: **deploy the code first**, then set env, then configure Slack.

---

## 1. Generate the token-encryption key (once)

- [ ] Generate a 32-byte key:
  ```bash
  openssl rand -hex 32
  ```
- [ ] Save it somewhere safe. **Never change it later** — rotating it makes every
      already-stored workspace token undecryptable, breaking those bots.

## 2. Get the Slack OAuth credentials

In https://api.slack.com/apps → your app → **Basic Information → App Credentials**:

- [ ] Copy **Client ID** → `SLACK_CLIENT_ID`
- [ ] Click **Show** on **Client Secret** → copy → `SLACK_CLIENT_SECRET`

## 3. Configure the Slack app dashboard

- [ ] **OAuth & Permissions → Redirect URLs → Add** →
      `https://api.ai-budget.pl/slack/oauth/callback` → **Save URLs**
- [ ] **OAuth & Permissions → Bot Token Scopes** — confirm these exist
      (already configured): `chat:write`, `im:history`, `im:read`, `im:write`, `files:read`
- [ ] **Add `files:write`** (voice digest audio upload). It is not yet in `SCOPES` in
      `slack-oauth.service.ts` or on already-installed workspaces; without it the weekly
      voice digest falls back to a text-only message (the audio upload fails `missing_scope`).
      After adding it here, add it to `SCOPES` and have workspaces re-install.
- [ ] **Manage Distribution → Activate Public Distribution**
      (required so other workspaces can install; the shareable "Add to Slack" link lives here)

## 4. Merge & deploy the code

- [ ] Merge `feature/slack-oauth` → `development` and push.
      The deploy **will** run this time (it touches `apps/api/**`).
- [ ] Wait for the *Deploy to VPS* workflow to go green.

## 5. Set the env vars on the server

SSH to the VPS (`root@46.225.23.232`), then:

- [ ] Add the four vars to `/opt/ai-budget/.env.production`:
  ```bash
  SLACK_CLIENT_ID=<from step 2>
  SLACK_CLIENT_SECRET=<from step 2>
  SLACK_OAUTH_REDIRECT_URL=https://api.ai-budget.pl/slack/oauth/callback
  SLACK_TOKEN_ENC_KEY=<from step 1>
  ```
- [ ] Recreate the api container so it picks up the new env
      (`docker restart` does NOT reload `env_file`):
  ```bash
  cd /opt/ai-budget
  docker compose -f docker-compose.prod.yml --env-file .env.production up -d --force-recreate api
  ```

## 6. Verify

- [ ] Open `https://api.ai-budget.pl/slack/install` in a browser →
      should redirect to the Slack OAuth consent screen.
      (If you get a "Not available / not configured" page, the client id/secret/redirect
      didn't load — re-check step 5 and that the container was recreated.)
- [ ] Click through the consent → you should land on the
      "AI Budget Assistant installed 🎉" success page.
- [ ] In the mobile app: **Settings → Chat bots → Slack → Add to Slack** opens the same flow.

---

## Notes

- **Existing keys stay:** `SLACK_BOT_TOKEN` (now the fallback for the original
  manually-installed workspace) and `SLACK_SIGNING_SECRET` (global, unchanged).
- **Per-user linking is unchanged:** after a workspace is installed, each member still
  connects their personal account with a 6-character code (`link YOUR_CODE` in a DM).
- **Graceful degradation:** if any OAuth var is missing, `/slack/install` shows a
  "not configured" page and the original workspace keeps working as before.
- **Full App Directory listing** (public marketplace) is a separate Slack-side review
  process — not required for the install link to work.
