---
agent: aba-code-reviewer
title: 'Add secureStorage vs AsyncStorage check to mobile review checklist'
status: proposed
conflict: false
created_at: 2026-05-12
---

## What's wrong

The mobile section of the agent enumerates six checks (offline-first, store hydration, API client, i18n, types, help content, orientation) but has no item for the `secureStorage` pattern. The project provides `src/services/secureStorage.native.ts` and `src/services/secureStorage.web.ts` as platform-aware wrappers and does not use `AsyncStorage` directly. Commit `886f7aa` ("fix(mobile): use secureStorage instead of missing AsyncStorage in change-email") documents a real defect caused by exactly this omission.

## Proposed change

- Add a bullet to the "Mobile (apps/mobile) checks" section:
  `**secureStorage**: persistent key-value storage must use src/services/secureStorage (native/web variants), never raw AsyncStorage. Direct @react-native-async-storage/async-storage imports in screens, stores, or services are a critical finding.`
- Place it after the API client bullet (since both are about how mobile code talks to platform services).
- The grep to verify: `grep -r "AsyncStorage" apps/mobile/src/` should return no results in reviewed files other than the secureStorage implementation itself.

## Rationale

The bug was found in production code (`change-email` screen). The fix is documented in git. Without a checklist item, future reviewers have no prompt to look for this pattern and the same class of error can recur in new screens or stores.
