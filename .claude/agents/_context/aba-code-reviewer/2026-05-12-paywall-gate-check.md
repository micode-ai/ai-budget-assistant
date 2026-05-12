---
agent: aba-code-reviewer
title: 'Add Paywall component gate check for premium mobile features'
status: proposed
conflict: false
created_at: 2026-05-12
---

## What's wrong

`apps/mobile/src/components/Paywall.tsx` exports a `<Paywall feature requiredTier onDismiss>` component that should gate screens and features behind subscription tiers. The agent's mobile checklist has no item for verifying this gate is present. A new pro/business-only screen merged without a Paywall wrapper silently grants free-tier users access to premium functionality — a revenue and product-integrity risk.

## Proposed change

- Add a bullet to the "Mobile (apps/mobile) checks" section:
  `**Paywall gating**: screens or features that are documented as pro/business-tier must render the <Paywall> component (src/components/Paywall.tsx) when the user's subscription tier is insufficient. New premium screens without any subscription check are a warning.`
- Note the caveat: not all screens require a gate — only those flagged as premium in product intent or CLAUDE.md. Reviewers should use judgment or ask if unclear.
- Suggested grep to surface candidates: `grep -r "requiredTier\|SubscriptionTier" apps/mobile/src/` to understand what's already gated as a reference point.

## Rationale

The Paywall component exists precisely to enforce tier gating, but there is no review pressure to use it. As new premium features are added, this gap means tier enforcement is inconsistent and dependent on individual developer awareness rather than a systematic check.
