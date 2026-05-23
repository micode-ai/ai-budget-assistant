---
id: chat-service-god-class
title: ChatService is a 1,395-line god class mixing five concerns
status: closed
priority: P2
module: apps/api
created_at: 2026-05-11
orchestration_run: 12a1af4f-f52d-4301-aff9-322a5d4cc9eb
---

# ChatService is a 1,395-line god class mixing five concerns

## What's wrong

`apps/api/src/modules/ai/services/chat.service.ts` has grown to 1,395 lines and handles: (1) building per-user financial context from five other services, (2) constructing OpenAI tool/function schemas, (3) executing confirmed write-actions (create expense/income/budget/category), (4) executing read-actions (get expenses/budget status/category breakdown), (5) prompt engineering (system prompt, language detection, safety instructions), and (6) Redis-caching of conversation history. All of this lives in a single `@Injectable` class with a six-service constructor.

## Why it matters

- Every new AI function or prompt tweak touches the same 1,400-line file, causing frequent merge conflicts.
- Unit-testing a single concern requires mocking all six constructor dependencies even when only one is relevant.
- The context-building logic (lines ~60–200) duplicates field-selection that the individual services already expose, creating a second maintenance surface.
- Adding the planned voice or image AI paths will push the file past 2,000 lines.

## Proposed fix

- Extract a `UserContextBuilder` service (or use the existing `AnalyticsService`) that assembles the `UserContext` object; inject it into `ChatService` as a single dependency.
- Extract an `AiFunctionRegistry` or `AiToolsService` that holds function schemas and dispatches confirmed/read actions — remove all `case` branches from `ChatService`.
- Keep `ChatService` responsible only for the OpenAI call lifecycle: message assembly → API call → response parsing → pending-action management.
- No new public API surface needed; this is an internal restructure within `apps/api/src/modules/ai/services/`.

## Files involved

- `apps/api/src/modules/ai/services/chat.service.ts`
- `apps/api/src/modules/ai/services/` (new files to be created)
