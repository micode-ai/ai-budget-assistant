# Security Policy

AI Budget Assistant handles people's financial records — receipts, bank-statement
imports, balances, and in some accounts end-to-end-encrypted data. We take reports
seriously and would rather hear about a problem early and informally than late and
politely.

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Report it privately, either way:

- **GitHub** — Security → *Report a vulnerability* (private advisory) on this repository.
- **Email** — perevertkinma@gmail.com, subject prefixed `SECURITY`.

Encrypting the report is welcome but not required; if you want to exchange keys, say so
in a first message with no details in it.

Please include, as far as you have it:

- what an attacker can do, and what they need to start (an account? a shared account? a
  guest link? nothing at all?)
- the exact request, screen, or steps that reproduce it
- the affected surface — API, mobile app (with version, from Settings → About), admin
  dashboard, the Telegram / WhatsApp / Slack bot, the public guest-link page, or the
  static site
- whether you accessed, modified, or retained any data that is not yours

## What to expect

| | |
|---|---|
| Acknowledgement | within 3 working days |
| First assessment | within 7 working days |
| Fix for a critical issue | as fast as we can ship and deploy, typically days |

This is a small team, not a 24/7 security desk. If you have not heard back in a week,
send a reminder rather than assuming the report was ignored.

We will tell you what we found, when it is fixed, and — if you want the credit — name
you in the release notes. We do not currently run a paid bug-bounty programme.

## Scope

In scope:

- `api.ai-budget.pl` — the REST API
- `app.ai-budget.pl` — the web app
- `admin.ai-budget.pl` — the admin dashboard
- `ai-budget.pl` — the marketing site, blog, and help centre
- the public guest-link pages served at `/s/<token>`
- the Android and iOS applications
- the Telegram, WhatsApp, and Slack bots
- this source code

Particularly interesting to us: anything that crosses an account boundary (data from one
`accountId` reachable from another), a write reachable by a `viewer` member, a guest link
that reveals more than its own participant's share, a token or webhook signature that is
not actually verified, and anything that weakens the client-side encryption of a tier-2
account.

Out of scope:

- reports from an automated scanner with no demonstrated impact
- missing hardening headers, cookie flags, or TLS-configuration nitpicks with no
  exploitable consequence
- rate limiting on endpoints where abuse costs the reporter more than us
- denial of service, volumetric or otherwise
- social engineering of our staff or our users, and physical attacks
- vulnerabilities in a third-party dependency with no working path through our code —
  report those upstream, and tell us if we are the ones exposing them

## Ground rules

Please stay inside accounts you own, and use test data. Do not run denial-of-service
tests, do not attempt to reach another person's financial records, and if you stumble
into someone else's data, stop and tell us instead of exploring further. Do not exfiltrate
or retain data that is not yours.

Research conducted in good faith under these rules is not something we will pursue legal
action over, and we will say so in writing if you need it.

## Supported versions

Only the current production deployment of the backend and the latest published release of
each app receive security fixes. There are no long-term-support branches, and an older
mobile build is expected to update — the in-app update gate can force it when a release
carries a security fix.
