---
agent: aba-backend-engineer
title: 'Document expanded AI module scope to prevent duplicate service creation'
status: applied
conflict: false
created_at: 2026-05-12
applied_at: 2026-05-22
orchestration_run: 1ac38180-fba6-4353-a294-648a8a09cb0b
---

## What's wrong

The cross-cutting rules for `modules/ai/` in `.claude/agents/aba-backend-engineer.md` only mention the chat confirmation flow. But the module now contains many additional services:

- `services/categorization.service.ts` — auto-categorises transactions
- `services/embedding.service.ts` + `embedding.module.ts` — vector embeddings
- `services/ocr.service.ts` — receipt OCR
- `services/whisper.service.ts` — voice transcription
- `services/goal-planner.service.ts` — savings goal projections
- `services/project-suggestion.service.ts`, `split-suggestion.service.ts`, `tag-suggestion.service.ts` — contextual suggestions

An agent building any AI-adjacent feature (e.g. "suggest a category", "transcribe a note") will not know these already exist and may create parallel implementations.

## Proposed change

- Expand the `## Cross-cutting rules / AI module` bullet with a short roster of existing AI services.
- Add a rule: "Before adding any ML/AI service, check `modules/ai/services/` for an existing one that overlaps."
- Mention `embedding.module.ts` as a separate lazy-loaded module inside `ai/` that other modules can import.
- Note that the module count comment ("29 existing modules") should be bumped; `health/` is now a real module too.

## Rationale

The AI module is the fastest-growing area of the codebase. Without a map, agents will proliferate duplicate services, diverge on prompts/models, and make it harder to enforce usage limits consistently. A quick roster in the agent file costs one paragraph and prevents hours of cleanup.
