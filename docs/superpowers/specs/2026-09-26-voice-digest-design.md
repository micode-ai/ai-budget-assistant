# Weekly voice digest in the chat bots — design

Date: 2026-09-26 · Status: approved; corrected 2026-09-27 while planning (see *Corrections*)

## Corrections (verified against the code while planning)

- **WhatsApp 24-hour window is known**: `WhatsAppLink.lastInboundAt` is stamped on every inbound
  message. If it is within the last 23 hours, the digest is sent directly (audio + text) with no
  template and no "Listen" tap; only outside the window is the template used.
- **WhatsApp template languages**: Meta has no Belarusian template locale. The template is sent in
  `be` users' fallback language `ru`; the digest itself (text + voice after "Listen") stays in
  Belarusian. Template language codes: en, pl, de, es, fr, ru, uk (for `ua`), nl.
- **Nothing sends audio or detects a blocked bot today** — both are new. Blocked detection is at send
  time: Telegram error 403; Slack `channel_not_found` / `is_archived` / `account_inactive` /
  `not_in_channel`; WhatsApp Graph error `131026` (undeliverable) or `131047` (window closed —
  retried as the template, not treated as blocked).
- **Slack**: a proactive DM needs `conversations.open({ users })` to get the DM channel id; audio goes
  up with `files.uploadV2` to that channel.
- **Telegram**: the private chat id equals `TelegramLink.telegramUserId`.
- **Cost logging** uses the existing `SubscriptionsService.recordAdditionalUsage(userId, 'voice_digest',
  units, accountId)` — audit only, never touches the user's quota.
- **Weekly spend** has no shared helper; the facts service queries it with the standard exclusions
  (isDeleted, isDebt, isDebtRepayment, isPlanned, isSplitReceivable) and `common/utils/fx.ts`.
- **Implementation is two plans**: API (`plans/2026-09-27-voice-digest-api.md`), then mobile.


## Goal

Retention without opening the app: once a week the user gets a 40–60 second voice note in
their messenger — "Last week you spent 820 zł, 12% below usual. Kaufland went up. You can
spend 64 zł a day until payday. You're running low on milk." — and can answer by voice,
which continues as the ordinary bot chat.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Channels | **Telegram + Slack: voice**; **WhatsApp: approved text template with a "Listen" button** that opens the 24-hour window, then the audio (Meta forbids free-form business-initiated messages outside it, and a template cannot carry audio) |
| Text | **Deterministic facts, LLM narrates only** — numbers verbatim, validated |
| Who / how | **Free, explicit opt-in only** |
| When | **User-chosen day and hour** in their timezone (default Monday 08:00) |
| TTS | **OpenAI `gpt-4o-mini-tts`**, `opus` output (key exists; format matches Telegram `sendVoice` and WhatsApp audio with no ffmpeg) |

Rejected: WhatsApp dropped entirely (largest messenger in PL); in-app push player (loses
"never open the app"); pure templates (9 languages of plural/case agreement); free LLM over raw
data (invented numbers); default-on (spam); voice-only-in-Pro (hides the point of the feature);
Google TTS / ElevenLabs (new vendor, billing, 5–10× cost).

## Data

Migration (same commit as the schema change — ABA-558), fields on `User`:
`voiceDigestEnabled Boolean @default(false)`, `voiceDigestDay Int @default(1)` (0 = Sunday),
`voiceDigestHour Int @default(8)`, `voiceDigestChannel String?` (`telegram|whatsapp|slack` —
the channel the user opted in from), `voiceDigestLastSentAt DateTime?`.

The digest covers the account currently selected in that bot (`/account`).

## Architecture — module `voice-digest`

**Cron** `voice-digest.cron.ts`, hourly. Selects enabled users (via `paginateById`) whose local
day/hour (`User.timezone`) match now. Double-send guard: `lastSentAt` older than 6 days AND
`CacheService.setIfAbsent('vd:{userId}:{isoWeek}', 8d)`; Redis down → `setIfAbsent` returns
false → skip (a missed digest beats a duplicate). Per-user errors are logged with
`logFireAndForget` and never stop the run.

**Pipeline — four small units:**

1. `VoiceDigestFactsService` → pure `assembleDigestFacts` (unit-tested). Facts from existing
   services: week total vs 8-week weekly mean (FX-converted to `user.currencyCode`), largest
   category increase, Safe-to-Spend today + days to next income (`SafeToSpendService`), one
   Inflation Shield item, shopping-list restock predictions, real salary when available.
   **No expenses in the week → no digest** (not marked sent).
2. `VoiceDigestNarrator` — cheap model, `user.language`, ≤ ~130 words, receives facts JSON and
   must quote numbers verbatim. **Number check:** every number in the output must appear in the
   facts (after locale-normalising separators); on failure or model error → deterministic
   fallback text built from the facts.
3. `TtsService` — OpenAI TTS, `opus`.
4. Channel senders; text is always sent alongside the voice (skimming, accessibility).
   - Telegram: `sendVoice` + text.
   - Slack: audio file upload + text in the DM.
   - WhatsApp: template `weekly_digest_ready` with a quick-reply "Listen"; the prepared digest
     (text + audio media id) is kept in Redis `wa:vd:{userId}` for 48 h; the button callback
     sends audio + text.

**Replies** go through the existing `ChatHandler` / `VoiceHandler` — nothing new.

**Commands** in all three bots: `/digest on`, `/digest off`, `/digest now` (a test digest,
at most once per 24 h, Redis-limited).

**Cost.** Not counted against the user's AI limit (system-initiated). Logged to AI usage under
feature `voice_digest` so the admin sees it. ~$0.011 per digest.

## Opt-in surfaces

1. After a successful bot link: "Want a short weekly voice summary?" with Yes / No buttons.
2. Toggle on `settings/bots.tsx`.
3. One-time `WhatsNewSpotlight` entry `voiceDigest` for already-linked users (the id is
   permanent once shipped; copy in all 9 locales).

## Settings

`settings/bots.tsx`: toggle, channel picker (when several bots are linked), weekday + hour
shown in the user's timezone, "Send a test digest" (= `/digest now`).
`GET/PATCH /users/me/voice-digest` — `JwtAuthGuard`, user-level (no account scoping).

## Errors and edge cases

| Case | Behaviour |
|---|---|
| LLM fails / number check fails | Deterministic fallback text, voiced |
| TTS fails | Text only, "voice unavailable" note; week counts as sent |
| Bot blocked (Telegram 403, Slack `channel_not_found`, WhatsApp undeliverable) | `voiceDigestEnabled = false` + one in-app push "Digest turned off — the bot is unreachable" |
| WhatsApp template not approved yet | Env flag `WHATSAPP_DIGEST_TEMPLATE`; unset → WhatsApp not offered and not sent, `Logger.warn` |
| "Listen" pressed after 48 h | "This digest has expired — next one on <day>" or `/digest now` |
| Tier-2 fully encrypted account | Not offered (same as Wrapped / Digest) |
| Viewer role | Allowed — read-only |

## Testing

- `assembleDigestFacts`: week vs mean, empty week → skip, block inclusion and order.
- Narrator number check: an invented number rejects the output → fallback.
- Due-user selection: day/hour across timezones incl. a DST switch; `lastSentAt` guard; lock.
- Senders with mocked clients: blocked bot → disabled; TTS failure → text only; WhatsApp
  template → button → audio.
- Mobile: pure weekday/hour formatting helpers.

## Docs and i18n

~12 bot keys in `common/bot-i18n/shared-messages.ts` (shared by 2+ bots — ABA-462 rule); ~10
mobile keys × 9 locales; the WhatsApp template in 9 languages submitted to Meta; extend the
existing bots help section (no new registration); wiki page
`docs/wiki/features/voice-digest.md`.

## Out of scope (v1)

In-app push with an audio player; daily variant; voice choice; multi-account digest;
per-block content settings.
