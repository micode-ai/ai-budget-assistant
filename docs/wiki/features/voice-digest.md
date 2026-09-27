# Voice digest

## What this is
An opt-in weekly voice note — text always alongside it — summarizing the account's last 7 days:
spend vs. usual, the category that rose most, today's safe-to-spend + days to payday, one
Inflation Shield item, a shopping-list restock name, and (when available) the real-salary change.
Sent by whichever chat bot the user linked it from (Telegram, WhatsApp or Slack) on a user-chosen
weekday/hour in their own timezone. The facts are computed deterministically; a cheap LLM only
narrates them, and its output is number-checked before it is trusted. Spec:
`docs/superpowers/specs/2026-09-26-voice-digest-design.md` (its *Corrections* section overrides
the body — verified against the code while planning); plan:
`docs/superpowers/plans/2026-09-27-voice-digest-api.md`.

## Entry points
- Orchestrator: `apps/api/src/modules/voice-digest/voice-digest.service.ts` —
  `VoiceDigestService.runForUser` (one user, one outcome), `getSettings`/`updateSettings`
  (backs the app API), `enableFrom`/`disable` (back the bot commands and the link-success offer).
- Cron: `apps/api/src/modules/voice-digest/voice-digest.cron.ts` — hourly `VoiceDigestCron`.
- Facts: `apps/api/src/modules/voice-digest/voice-digest-facts.service.ts` (IO — queries + the
  existing insight services) feeding the pure, unit-tested
  `apps/api/src/modules/voice-digest/digest-facts.util.ts` `assembleDigestFacts`.
- Narration: `apps/api/src/modules/voice-digest/voice-digest-narrator.service.ts` (the OpenAI
  call + the accept/reject gate) over
  `apps/api/src/modules/voice-digest/digest-text.util.ts` (`fallbackText`, `isFaithful`,
  `allowedNumbers`, `templateLanguage`, the per-language templates).
- TTS: `apps/api/src/modules/voice-digest/tts.service.ts` — OpenAI `gpt-4o-mini-tts`, opus output.
- Schedule math: `apps/api/src/modules/voice-digest/digest-schedule.util.ts` — `localParts`,
  `isoWeekKey`, `isDue`.
- Registry: `apps/api/src/modules/voice-digest/digest-channel.registry.ts` —
  `DigestChannelRegistry`, the `DigestSender` interface, `DigestBlockedError`/`DigestUnavailableError`.
- Module: `apps/api/src/modules/voice-digest/voice-digest.module.ts` (`@Global()`).
- Channel senders: `apps/api/src/modules/telegram/digest/telegram-digest.sender.ts`,
  `apps/api/src/modules/whatsapp/digest/whatsapp-digest.sender.ts`,
  `apps/api/src/modules/slack/digest/slack-digest.sender.ts`.
- Bot commands: each bot's `handlers/command.handler.ts` `handleDigest` — `/digest on|off|now`
  (WhatsApp/Slack take the same words without the leading `/`).
- App settings API: `GET`/`PATCH /users/me/voice-digest` on
  `apps/api/src/modules/users/users.controller.ts` (`JwtAuthGuard` only — user-level, no
  `AccountContextGuard`), DTO in `apps/api/src/modules/users/dto/index.ts`, shared shape
  `packages/shared-types/src/dto/voice-digest.ts` (`VoiceDigestSettings`/`UpdateVoiceDigestDto`/
  `VoiceDigestChannel`).
- Env: `WHATSAPP_DIGEST_TEMPLATE` (`.env.example`, next to the other `WHATSAPP_*` vars).
- Mobile settings UI: not built yet — see *Known gaps*.

## Key concepts
- **Four independently-degrading stages.** Facts → narrate → synthesize → send. Every facts
  loader in `VoiceDigestFactsService` catches its own failure and nulls/empties that one fact
  rather than failing the digest; the narrator falls back to deterministic text; TTS returns
  `null` on any failure rather than throwing, so a digest can still go out as text-only.
- **Fact assembly is pure.** `assembleDigestFacts` computes the week total from 9 rolling 7-day
  windows (the current week plus 8 prior), only derives `usualWeek`/`changePct` from at least 4
  active prior weeks, only names a `topRise` category above a 5%-of-usual floor and a 1.2× rise,
  and caps the restock list at 3. A week with no spend returns `null` — no digest, not marked sent.
- **The narrator treats the facts as untrusted data.** Its system prompt states plainly that
  category/product/merchant labels came from the user and must never be followed as instructions,
  on top of the number check described in *Invariants*.
- **Cost accounting is separate from correctness.** Every real delivery logs a fixed usage entry
  regardless of whether the model or the fallback text was used — the OpenAI calls happened
  either way.

## Invariants
- **Opt-in only, never on by default.** `User.voiceDigestEnabled` defaults `false`; it flips to
  `true` only via `PATCH /users/me/voice-digest`, a bot's `/digest on`, or
  `VoiceDigestService.enableFrom` (the link-success offer) — nothing auto-enables it for an
  existing or a newly-linked channel.
- **The schedule is local time, with a 6-day resend guard and a weekly lock.** `VoiceDigestCron`
  runs hourly and checks `isDue` against the user's own `User.timezone`; a match still isn't
  enough on its own — `voiceDigestLastSentAt` must be null or older than the 6-day resend guard,
  AND the cron must win a per-ISO-week Redis lock (`vd:{userId}:{isoWeekKey}`, 8-day TTL, via
  `CacheService.setIfAbsent`) before it calls `runForUser`. A Redis outage makes `setIfAbsent`
  return `false` — the run is skipped, never sent unlocked. A missed week beats a duplicate.
- **The cron pages over a predicate the sweep never mutates.** The page query is
  `{voiceDigestEnabled:true, id:{gt:cursor}}` ordered by id — no `voiceDigestLastSentAt` filter
  and no Prisma `cursor`+`skip:1`. The resend guard is applied in JS by `isDue`. The sweep itself
  stamps `voiceDigestLastSentAt` (a send) and clears `voiceDigestEnabled` (a block); with either
  in the SQL filter, a cursor row that stopped matching made `skip:1` drop the NEXT eligible user
  — silently, once per page boundary (final review I2). Any `paginateById` caller whose loop
  writes a column its own filter reads has the same hazard.
- **Every narrated number is checked; an unfaithful reply falls back.** `VoiceDigestNarratorService`
  accepts the model's text only when every number in it is within 0.5 of some number in
  `allowedNumbers(facts)`, and it contains no URL-like substring and no `@`. Any rejection, a
  thrown call, an empty reply, or output over 1200 characters all fall back to the deterministic
  `fallbackText(facts, lang)` — proven (own test) to itself pass `isFaithful` in every supported
  language, so the fallback can never be rejected by its own gate. Category/product/merchant
  labels are explicitly told to the model as data, never as instructions, and a reply containing a
  link or an `@`-mention is rejected even if the numbers all check out.
- **Text is always sent alongside the voice note, never audio alone.** Every sender sends the
  narrated text with the audio; a TTS failure degrades to text-only and still counts as `'sent'` —
  the week is still marked delivered.
- **WhatsApp: the 24h customer-service window decides direct-send vs. template, and two locales
  remap.** `WhatsAppDigestSender.send` delivers directly (audio + text, no button) when
  `WhatsAppLink.lastInboundAt` is within 23h (a safety margin under Meta's 24h rule); otherwise —
  or if Meta itself returns Graph error `131047` ("outside window") — it falls back to the
  approved template with a "Listen" quick-reply. `templateLanguage` remaps `ua`→`uk` and `be`→`ru`
  for the **template call only** (Meta has no `be` locale); the digest itself, after "Listen", is
  still narrated and voiced in the user's real language.
- **A template quick-reply tap arrives as `type: 'button'`, not `interactive`.** Meta delivers a
  tap on a TEMPLATE button as `{type:'button', button:{payload, text}}`;
  `interactive.button_reply` is only for session-message buttons. `WhatsAppBotService.dispatch`
  routes `msg.button.payload` through the same `routeCallback` as interactive ids, so
  `vd--listen` reaches `deliverPending`. Before this (final review C1) every outside-window "Listen"
  tap was dropped and the digest expired unheard — the test had built the tap in the wrong shape.
- **WhatsApp is never enabled while it cannot deliver.** With `WHATSAPP_DIGEST_TEMPLATE` unset,
  every send outside the 23 h window is `'unavailable'`, so `enableFrom(userId, 'whatsapp')`
  returns `false` without writing (the bot's `digest on` replies `digestUnavailable`), and
  `updateSettings` rejects `channel:'whatsapp'` — explicit or stored — with a 400 and never
  auto-picks it. Opting in to silence is worse than being told no.
- **A WhatsApp block usually arrives asynchronously, and is handled there.** Graph returns 200
  on `POST /messages` and reports 131026 later in a `statuses[]` webhook carrying only the wamid.
  So every digest message the sender sends (audio, text, template) stores
  `wa:vdmsg:{wamid}` → userId (3-day TTL, from the `messages[0].id` the client now returns).
  `WhatsAppBotService.handleUpdate` processes `statuses[]` before messages: a `failed` status with
  error code 131026 whose wamid maps to a user (claimed with `GETDEL`, so a redelivered status
  acts once) calls `VoiceDigestService.handleBlocked(userId, 'whatsapp')` — the same
  disable-and-push as a send-time block, but only while the digest is still on AND still on
  WhatsApp, so a late status never switches off a digest the user has since moved.
- **The "Listen" delivery is exactly-once, and a failed delivery is restored.** The pending
  digest (text + base64 audio) sits in Redis (`wa:vd:{userId}`, 48h TTL) until the button callback
  claims it with an atomic `GETDEL` — two simultaneous taps, or a webhook redelivery, can only
  deliver it once. If the delivery itself then throws, the entry is written back with a fresh TTL
  and the error is rethrown, so a transient failure doesn't silently lose the digest.
- **An unconfigured channel client is `'unavailable'`, never a silent `'sent'`.** A missing
  WhatsApp client config or an unset `WHATSAPP_DIGEST_TEMPLATE` throws `DigestUnavailableError`,
  which `runForUser` maps straight to the `'unavailable'` outcome.
- **A permanent block disables the digest and sends exactly one push; a transient error never
  does.** Each sender classifies its own provider's "this recipient is gone" signal — Telegram
  HTTP 403, WhatsApp Graph code `131026`, or one of Slack's `channel_not_found`/`is_archived`/
  `account_inactive`/`not_in_channel`/`user_not_found`/`invalid_auth`/`token_revoked` — into
  `DigestBlockedError`. Only that error flips `voiceDigestEnabled:false` and fires one
  `voice_digest_disabled` push. Every other thrown error is caught by `runForUser`'s own
  try/catch, reported as `'failed'` for that run only, and leaves the setting untouched — next
  week's cron gets another try.
- **The channel link's stored account is re-checked every run, never trusted.** Before use,
  `VoiceDigestService.resolveAccountId` re-validates the link's account with
  `account.findFirst({id, isActive:true, members:{some:{userId}}})`, falling back once to the
  user's own `defaultAccountId` under the same check; if neither resolves, the outcome is
  `'no_channel'`. This exists because a stale `link.defaultAccountId` — the user left the account,
  was removed from it, or it was soft-deleted, and nothing updates the link when that happens —
  was found leaking a left account's data in review (Task 9).
- **Tier-1 accounts never narrate a name.** Tier ≥ 2 is skipped outright (`'encrypted'`). At
  tier 1, category and product names are encrypted text fields and may be ciphertext, so
  `runForUser` drops `topRise`, `shieldItem` and `restock` from the facts before narrating; the
  totals, safe-to-spend and income countdown are plain numbers and stay.
- **Spend uses the standard exclusion set, not `isDebt`.** `VoiceDigestFactsService.loadSpend`'s
  `where` is `{accountId, isDeleted:false, isPlanned:false, isRecurring:false,
  ...EXCLUDE_SPLIT_RECEIVABLE, date:{gte:...}}` (`common/utils/expense-filters.ts` — the same
  exclusion analytics uses, plus `isRecurring:false` — see the next invariant). A standalone
  lent/borrowed debt row **is** counted as an outflow, and a planned expense never is.
- **The weekly comparison is everyday spend only — excludes `isRecurring` and CP04
  housing/utilities; the usual week is the median of active weeks, not the mean.** A real user's
  week once narrated as "you spent 250 PLN, usually 2753 PLN, 91% less" purely because monthly rent
  landed in 2 of the 8 prior windows: a MEAN drags the "usual" figure up for every week rent
  appears in and reports a false underspend the other 6 weeks (and, symmetrically, a false huge
  overspend in the 2 rent weeks themselves). Two independent fixes, both in
  `VoiceDigestFactsService.gather`/`loadSpend`: (1) `isRecurring:true` rows are excluded from the
  Prisma `where` outright, and any attributed part (own category, or a split part) whose category's
  `coicopDivision === 'CP04'` is dropped in JS after `attributeToCategories` — a split whose ONE
  part is CP04 drops only that part, keeping the rest. `CoicopClassifierService.ensureClassified`
  is called (try/catch, `Logger.warn` with no amounts, continue unclassified on failure) before the
  query so newly-created categories have a division to check; `CoicopClassifierService` is exported
  from `InsightsModule` for this. (2) `digest-facts.util.ts`'s `usualWeek` is now the MEDIAN of
  active prior weeks (still requiring ≥4), not their mean — for an even count, the mean of the two
  middle values — so an outlier week can shift the comparison for the weeks it lands in, but can no
  longer drag every OTHER week's "usual" figure toward it. `categoryUsual` (the per-category
  `topRise` comparison) is unchanged — still a mean over prior windows, and still reads whatever
  spend survives the same isRecurring/CP04 exclusion. The fallback wording and narrator prompt both
  state the comparison is everyday spending, name the direction on THIS week only (never on the
  usual amount), and state the usual amount alongside it (`digest-text.util.ts`,
  `voice-digest-narrator.service.ts`).
- **`/digest now` is a preview, throttled once per 24h, on the command's own channel.** Each bot's
  `handleDigest` calls `runForUser(userId, {force:true, channel:<this bot>, preview:true})` after
  claiming a `vd:now:{userId}` Redis key (24h TTL). `preview:true` skips the
  `voiceDigestLastSentAt` stamp — the real weekly send still fires on schedule — while the usage
  cost is still recorded. The explicit `channel` override sends the test digest on whichever bot
  the command arrived on, even if that differs from (or the user never set)
  `user.voiceDigestChannel`.
- **Cost is audit-only, never billed against the user's AI limit.** Every real delivery (`'sent'`
  or `'template'`) logs a fixed 0.5-unit `voice_digest` usage entry via
  `SubscriptionsService.recordAdditionalUsage` — regardless of whether the narration used the
  model or the deterministic fallback — so the admin AI-usage view sees it, but it never touches
  the user-facing quota.
- **The registry keeps the core module independent of the three bot modules.**
  `DigestChannelRegistry` lives in the `@Global()` `voice-digest.module.ts`; each bot's own
  `*DigestSender` registers itself in its `onModuleInit()`. `VoiceDigestModule` imports no
  telegram/whatsapp/slack code — there is no import cycle. A fourth channel adds its own
  `DigestSender` and a registration call, not a new case anywhere in the core module.

## Known gaps
- **Subscription renewals are not excludable from the everyday-spend comparison.**
  `subscription-renewal.cron.ts` books a renewal's cloned expense with `source:'manual'` and no
  `isRecurring` flag — nothing on the `Expense` row marks it as a subscription renewal — so the
  `isRecurring:false` filter in `VoiceDigestFactsService.loadSpend` cannot catch it, and a
  subscription (Netflix, gym, etc.) still counts as everyday spend in the weekly comparison even
  though it recurs exactly like an `isRecurring:true` expense does.
- The WhatsApp template must be approved in Meta before `WHATSAPP_DIGEST_TEMPLATE` is set — until
  then WhatsApp is never offered as a digest channel (`whatsappAvailable` stays `false` even for a
  linked user) and cannot be enabled.
- The Slack app's token needs the `files:write` scope to upload the audio note. It is not yet in
  `SCOPES` (`slack-oauth.service.ts`) or on installed workspaces (see
  [`slack-bot.md`](../slack-bot.md) and `docs/ops/slack-oauth-setup.md`). Without it,
  `files.uploadV2` fails `missing_scope` and `SlackDigestSender` falls back to a text-only message
  with one warn line — the digest still arrives, just without the voice note.
- An async WhatsApp `131047` ("outside the window") in `statuses[]` is only logged: no template
  retry is attempted from a status. Rare, since the direct path already keeps a 1 h margin under
  Meta's 24 h window.
- A claimed weekly lock followed by a failure inside `runForUser` loses that week — the lock and
  the `lastSentAt` guard both assume a run either succeeds or is retried by next week's own
  schedule match, not a same-week retry.
- Restoring a WhatsApp "Listen" pending entry after a partial failure (audio delivered, the text
  send then threw) re-sends the whole pending payload on the next tap — the audio can be
  delivered twice.
- The faithfulness check is numeric only. It cannot catch a narration that attaches a correct
  number to the wrong fact, or inverts a stated direction (rise vs. fall) — both are forbidden in
  the prompt but not independently verified the way the numbers are.
- The per-language templates in `digest-text.util.ts` were translated but not native-reviewed.
- There is no mobile settings UI yet — `settings/bots.tsx` has no digest toggle or schedule
  picker. That is plan 2 of this feature; today the settings are reachable only through
  `GET`/`PATCH /users/me/voice-digest` directly or a bot's own `/digest on|off|now`.
- No in-app audio player and no daily variant — out of scope for v1 by design.

## History
[ABA-610](https://github.com/micode-ai/ai-budget-assistant/issues/637) — weekly voice digest across
Telegram, WhatsApp and Slack: opt-in schedule, deterministic facts narrated by a cheap model
(number-checked, deterministic fallback), OpenAI TTS, and the WhatsApp 24h-window/template split.
Learned in review: a stale channel-link account id had leaked a left account's data (now
re-checked every run); the WhatsApp "Listen" delivery needed an atomic claim to stay exactly-once.
Spec `docs/superpowers/specs/2026-09-26-voice-digest-design.md`; plan
`docs/superpowers/plans/2026-09-27-voice-digest-api.md`.
