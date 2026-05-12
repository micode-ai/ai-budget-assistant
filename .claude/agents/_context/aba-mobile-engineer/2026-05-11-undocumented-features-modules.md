---
agent: aba-mobile-engineer
title: 'Document biometric, voice, receipt, and chat feature modules in scope'
status: proposed
conflict: false
created_at: 2026-05-11
---

## What's wrong

The agent's scope section mentions `src/features/` only in passing. Four significant feature modules are completely undocumented: `src/features/auth/useBiometric.ts` (with `.native.ts` / `.web.ts` platform splits), `src/features/voice/useVoiceInput.ts`, `src/features/receipt/useReceiptScanner.ts`, and `src/features/chat/useChat.ts`. An agent tasked with chat or voice/OCR work has no guidance on where these live or what patterns they use (e.g., platform-split `.native.ts` / `.web.ts` files, cost confirmation via `useAiCostConfirmation`).

## Proposed change

- In the "Your scope" section, expand the `src/features/` bullet to enumerate existing modules: `analytics/` (`useAnalytics`, `useDrillDown`), `auth/` (`useBiometric` with native/web split), `voice/` (`useVoiceInput`), `receipt/` (`useReceiptScanner`), `chat/` (`useChat`), `scenario/` (`useScenarioProjection`).
- Add a pattern note: platform-variant features use `.native.ts` / `.web.ts` suffixes — the bare `.ts` file is the web/shared fallback.
- Cross-reference `useAiCostConfirmation` hook for AI-cost-bearing operations (cost ≥ 2.0 shows a one-time dialog).

## Rationale

Without this documentation, an agent working on a voice or receipt task may implement a parallel hook instead of extending the existing one, leading to duplication and broken cost-gate logic.
