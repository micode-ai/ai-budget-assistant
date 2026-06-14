# Smart Merchant Normalization & Merge — Design

**Date:** 2026-06-14
**Status:** Approved (design)
**Issue:** ABA-XXX (to be created at task finish)

## Problem

Bank statements (Wise/PL banks) store the merchant raw, so a single chain shows up
as many separate sellers — e.g. `BIEDRONKA 1234 WARSZAWA`, `BIEDRONKA 5678 KRAKOW`.
The Merchant analytics (ABA-174, donut + sums) therefore splits one brand into many
slices, and the merge tooling (ABA-141, Settings → Merchants) only renames/merges
**one row at a time**, which is tedious for a chain with dozens of store variants.

We want to (a) prevent the mess at the source for known brands, and (b) make cleaning
up existing variants fast — without ever silently merging the wrong sellers.

## Decisions (from brainstorm)

1. **Both mechanisms** — auto-normalize at import *and* manual multi-merge for
   already-accumulated data.
2. **Dictionary + heuristic**, but with different trust levels:
   - **Dictionary** (curated brand list) is reliable → may run automatically.
   - **Heuristic** (strip store numbers / city) is risky → **only suggests**, never
     auto-merges.
3. **Heuristic lives only as suggestions** in the Merchants screen; the user confirms
   every merge.
4. Dictionary auto-normalization is scoped to **bank import only** (PL). Wise / OCR /
   voice are out of scope for now.
5. Heuristic suggestions live **client-side** (mobile) only.

## Block 1 — Auto-normalization at import (API, dictionary)

File: `apps/api/src/modules/import-bank/merchants/merchants-pl.ts`

- Add a **second map** `MERCHANT_CANONICAL_PL: Record<string, string>` — uppercase
  substring key → canonical display name. Examples:
  - `BIEDRONKA → 'Biedronka'`, `ZABKA`/`ŻABKA → 'Żabka'`, `LIDL → 'Lidl'`,
    `ORLEN → 'Orlen'`, `MEDIA MARKT`/`MEDIAMARKT → 'Media Markt'`, `ROSSMANN → 'Rossmann'`, …
  - Seed it from the brands already present in `MERCHANTS_PL`.
- Add `normalizeMerchantPL(name?: string): string | undefined`:
  - If `name` contains a brand substring (uppercase compare), return the canonical name.
  - Otherwise return the original `name` unchanged. **No heuristic here** — dictionary
    only, so it is safe to apply automatically.
- Hook point: build of preview rows so the cleaned name is **visible in the import
  preview** before the user confirms; the commit path (`import-bank.service.ts:362`,
  `merchant: row.merchant ?? null`) persists the same normalized value.
- Leave `MERCHANTS_PL` (brand→category) and `suggestCategoryFromMerchantPL` untouched —
  separate concern.
- **No DB schema change** — `merchant` is already a text column.
- Tests: extend `merchants-pl.spec.ts` (canonical resolution + passthrough for unknown).

## Block 2 — Manual multi-merge (Mobile, Merchants screen)

File: `apps/mobile/app/settings/merchants.tsx`

- Add a **selection mode** (same pattern as the bulk-expense multi-select):
  - Checkboxes on rows, header switches to "Selected N · Cancel", bottom **"Merge"** button.
  - Merge modal: pick the canonical name (default = the variant with the highest count,
    editable), show "N expenses will be moved".
- New store action `expenseStore.mergeMerchants(sources: string[], target: string)`:
  - One pass over in-memory rows, one account-scoped SQL `UPDATE` via a new
    `bulkMergeMerchants(accountId, sources, target)` in `expenseRepository.ts`, marks
    affected rows `pending`, then `syncPendingExpenses()` (re-encrypts for E2EE — same
    as `renameMerchant`).
  - Existing `renameMerchant` stays for single rename / delete.

## Block 3 — Grouping suggestions (Mobile, heuristic, suggest-only)

File: `apps/mobile/src/utils/merchant.ts`

- New pure util `suggestMerchantGroups(merchants: { merchant: string; count: number }[])`:
  - Compute a fingerprint per name: uppercase → strip trailing digits / store codes /
    punctuation → take the significant prefix.
  - Group merchants sharing a fingerprint where the group has **≥2 variants**.
  - Return groups with a suggested canonical name (default = highest-count variant).
- Merchants screen renders a top **suggestion banner** per group:
  "Looks like one seller: Biedronka 1234, Biedronka 5678 … → Merge into Biedronka"
  with **Merge** / **Dismiss** buttons. Merge calls the same `mergeMerchants`.
  **Never auto-merges.** (Dismiss is session-local; no persistence needed for v1.)

## Block 4 — Analytics

No change needed. `MerchantBreakdown` (ABA-174) already aggregates by `merchant`; once
variants collapse via normalization/merge, the brand becomes a single slice and a single
sum automatically.

## Block 5 — Scope / YAGNI / i18n

- Dictionary is **PL-only** (extend the existing PL map). Global brands deferred.
- Auto-normalization is **bank-import only**. Wise / OCR / voice deferred (same
  `normalizeMerchantPL` can be wired later if wanted).
- No retro-migration of existing rows — old data is cleaned via Blocks 2–3.
- i18n: new `merchants.*` keys (merge UI, suggestions, confirmations) added to **all 9
  locales** (en/de/es/fr/pl/ru/ua/be/nl).

## Out of scope

- Wise/OCR/voice normalization.
- Non-PL brand dictionary.
- Server-side heuristic / suggestions.
- Persisting dismissed suggestions across sessions.
- Editing `MERCHANTS_PL` brand→category mappings.
