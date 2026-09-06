# Settings Desktop Shell — Wave 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the three heavier settings leaves into the shell — `security`, `bots`, `profile` — taking the pane count from six to nine.

**Architecture:** Nothing about the shell changes. Each task extracts one screen from `app/settings/` into `src/components/settings/`, leaves the route a thin wrapper, and flips one word in the registry. Wave 1 proved the pattern across five extractions with the test count unmoved every time.

**Tech Stack:** Expo Router, React Native Web, TypeScript, Jest (nothing renders a component in CI).

**Spec:** `docs/design/2026-09-06-settings-desktop-web.md`
**Language:** `docs/contracts/desktop-web-design-language.md` — 5e is what wave 1 established, including how to read the native bundle check.

## Order, and why it differs from the spec's listing

The spec lists security, profile, bots. This plan runs **security, bots, profile**, for the reason wave 1 proved: schedule the risk probe while the wave is still small. `bots` is the mount-lifetime probe — link-status polling and a QR code — and if a pane keeping its component mounted breaks anything, it breaks there. Finding that before the 646-line `profile` extraction is cheaper than after.

## Global Constraints

- **The mobile rendering must not change.** Route files become thin wrappers. Below 1024 the shell does not exist and every screen behaves exactly as today.
- **Zero new i18n keys.** Nothing in this body of work has needed one; the one that was authorised turned out to already exist and was removed.
- Nothing under `src/` may import from `app/`. Every colour, spacing and text style from `useTheme()` tokens.
- **A pure move must not move the test count.** Diff both directions: every line removed reappears, every line added is accounted for.
- **Check what the route renders around the body, and check `app/_layout.tsx`.** Twice on this branch the chrome was in the layout rather than the route, once carrying the only place a paid flow showed its remaining quota.
- The mobile suite stands at **1253 tests across 129 suites**. Record what it reports; never predict.

---

### Task 1: Security — and settle the question wave 1 could not

**Files:**
- Create: `src/components/settings/security/SecuritySettings.tsx`
- Modify: `app/settings/security.tsx`, `src/features/settings/settingsRegistry.ts` and its spec

**Why first:** wave 1's audit verified `products` and `merchants` as account-switch defects and **could not settle `security`** — it flagged it explicitly for its own read before extraction. Answer that before moving it.

- [ ] **Step 1: The three-way read, before the move.** Establish whether this screen's data is account-scoped **the way wave 1 established it for notifications** — what the client sends, what the handler reads, what the service touches — never from an endpoint's name. Notification preferences sounded account-scoped and were twelve `User.notify*` columns behind `req.user.id`. Say what you found either way; a clean answer is as useful as a defect.
- [ ] **Step 2: If it is account-scoped and loads once in a mount effect**, key the pane on `currentAccountId`. If it is not, do not key it — keying discards state and re-fetches to get a byte-identical answer.
- [ ] **Step 3: The move**, same pattern as wave 1's five.
- [ ] **Step 4: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/components/settings apps/mobile/src/features/settings apps/mobile/app/settings/security.tsx
git commit -m "ABA-510 Move the security settings into a pane"
```

---

### Task 2: Bots — the mount-lifetime probe

**Files:**
- Create: `src/components/settings/bots/BotsSettings.tsx`
- Modify: `app/settings/bots.tsx`, `src/features/settings/settingsRegistry.ts` and its spec

**Why here:** 564 lines, and the one screen in this wave that holds something over time. It polls link status and renders a QR code. In a pane it can stay mounted for as long as the shell is open on another screen, and it unmounts when a pane switches rather than when the user navigates away.

- [ ] **Step 1: The lifetime question, before the move.** Is there a poll, an interval, a subscription or a request that assumed "the screen goes away when the user leaves"? The voice extraction found a microphone held open by exactly that assumption, and it turned out to be two leaks rather than one because it was thought about rather than rushed. **If you find something, report it before fixing** — a resource left held is a behaviour change and needs authorising.
- [ ] **Step 2: `data` came back clean for a structural reason** worth checking for here too: its flags live in `reportStore` rather than `useState`, so work in flight resolves into something that outlives any mount. If `bots` keeps its polling state in the component, that is the difference.
- [ ] **Step 3: The move.** Note that wave 1 found `scrollEnabled` is inert inside a pane, because the pane branch renders a plain `View`. If this screen relies on any prop that only means something to a `ScrollView`, say so rather than losing it silently.
- [ ] **Step 4: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
git add apps/mobile/src/components/settings apps/mobile/src/features/settings apps/mobile/app/settings/bots.tsx
git commit -m "ABA-510 Move the chat bot settings into a pane"
```

---

### Task 3: Profile — and the first dialog inside a pane

**Files:**
- Create: `src/components/settings/profile/ProfileSettings.tsx`, `src/components/settings/profile/ChangeEmailDialog.tsx`
- Modify: `app/settings/profile.tsx`, `app/settings/change-email.tsx`, `src/features/settings/settingsRegistry.ts` and its spec

**Why last:** 646 lines, the largest, and it introduces a mechanism rather than repeating one.

- [ ] **Step 1: The move**, same pattern.
- [ ] **Step 2: `change-email` becomes a dialog**, because in a pane there is no back. The spec makes it one for exactly that reason. **Host the existing component through a ref handle; do not reimplement the screen** — `src/components/expenses/desktop/ExpenseDialog.tsx` is the reference, and this branch has eight dialogs that all follow it. `change-email` is a two-step flow with a code and a 30-minute pending state persisted in `secureStorage`; that state must survive the dialog closing exactly as it survives an app restart today.
- [ ] **Step 3: The completion signal.** The set-balance extraction found a screen whose save never signals completion, because it signalled by navigating. Profile's saves currently end in a `showAlert` and should keep doing so — confirm rather than assume.
- [ ] **Step 4: `app/settings/change-email.tsx` stays a route** and keeps working on mobile and below 1024.
- [ ] **Step 5: Verify and commit.**

```bash
cd apps/mobile && npx tsc --noEmit && npx jest
cd /d/Work/micode/ai-budget-assistant && bash scripts/build-web.sh
git add apps/mobile/src/components/settings apps/mobile/src/features/settings apps/mobile/app/settings
git commit -m "ABA-510 Move the profile settings into a pane and its email change into a dialog"
```

---

### Task 4: Verification, docs, and the issue

- [ ] **Step 1: Look at it** — all nine panes, both themes, with an account switch performed while a pane is open.
- [ ] **Step 2: Confirm the phone is untouched** below 1024.
- [ ] **Step 3: The native bundle check, read properly.** "Expect 0" is wrong and trains people to ignore it — the registry and every native no-op half legitimately appear. What must be absent is the desktop UI:

```bash
cd apps/mobile && npx expo export --platform android --output-dir /tmp/native-check-510 --clear
HBC=$(ls /tmp/native-check-510/_expo/static/js/android/index-*.hbc | head -1)
for n in SettingsShell SettingsNav SettingsOverviewPane WebTopBar; do echo "$n $(grep -c -a $n $HBC)"; done   # expect 0
```

- [ ] **Step 4: Update the design language doc** with anything this wave established or contradicted. It is gitignored: `git add -f`.
- [ ] **Step 5: Create ABA-510.** Name what waves 3 and 4 still hold, so nine-of-seventeen reads as deliberate rather than unfinished.

---

## Deployment notes

- Stays on `feature/desktop-web-screen`. A push to `development` rebuilds and ships the SPA with no separate step — a push IS a release, and that is the product owner's call.
- **Verify in a browser served from a private build directory**, never `apps/mobile/dist`. And do not trust the export's exit code: check that `index.html` exists, because a build run from the wrong directory reports success and produces nothing.
