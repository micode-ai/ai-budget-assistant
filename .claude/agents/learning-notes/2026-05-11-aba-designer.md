# Self-Study Note: aba-designer — 2026-05-11

## Role

Produces structured text-based design specs (not mockups) for new screens and features in the AI Budget Assistant, targeting `aba-mobile-engineer` or an admin engineer for implementation.

## Watchlist

When this agent is invoked, check these repo-specific things before approving output:

1. **`docs/design/` directory existence** — the agent writes to `docs/design/YYYY-MM-DD-<topic>.md`, but this directory does not currently exist. The agent must create it on first use. Verify the file was actually written.
2. **Theme token coverage** — all color/spacing decisions should reference tokens in `apps/mobile/src/theme/` (`colors.ts`, `spacing.ts`, `typography.ts`, `shadows.ts`, `borderRadius.ts`). Any raw pixel or hex value not mapped to a token is a red flag.
3. **Dark-mode counterpart** — `apps/mobile/src/theme/colors.ts` presumably has light/dark variants; every color decision in the spec should name both. Audit the spec for lone light-mode colors.
4. **i18n cost awareness** — 8 locales × every new key is the tax. Check the spec's "Localization notes" section counts new keys and avoids redefining strings that already exist in `apps/mobile/src/i18n/locales/en.ts`.
5. **Subscription gate / paywall state** — if the feature is Pro or Business tier, the spec must include a `free` / locked state referencing the `Paywall` component (`apps/mobile/src/components/`). Missing paywall designs are a common omission.

## Clarifying Question

Before designing a new screen: **Is this mobile-only, admin-only, or does it need to appear in both surfaces?** The design spec structure differs — mobile needs portrait-lock + tablet considerations + 8-locale i18n + dark mode, while admin is desktop-first Next.js with Recharts and shadcn/ui. Conflating the two leads to specs that half-apply.

## Agent File Issues

- **`docs/design/` is never created upfront.** The agent assumes the directory exists but it's missing from the repo right now. No guard-rail in the spec to `mkdir -p docs/design/` before writing. Low risk but will fail silently if the Write tool requires an existing parent on some platforms.
- **Icon library not verified.** Step 3 instructs the agent to reference `lucide-react-native` names for icons on mobile, but the agent file doesn't confirm that's the icon library actually imported in this project. If the project uses a different library (e.g., `@expo/vector-icons`), this instruction would produce wrong icon names in every spec.
- **`ui-ux-pro-max` skill invocation** — the agent description says "Leverages ui-ux-pro-max skill" and Step 1 says to invoke `ui-ux-pro-max:ui-ux-pro-max`, but there is no enforcement (no "MUST" / hard gate). An engineer could skip Step 1 and the agent would still produce a plausible-looking spec that diverges from the project's curated palette.
- **Admin path is slightly stale** — agent says `apps/admin/src/app/` which is correct for the current Next.js 16 App Router structure, but it doesn't mention shadcn/ui as a primitive source for admin (only "existing components"). A designer new to the admin could miss that shadcn/ui is the component library and propose custom components unnecessarily.
- **No mention of `interactive-charts/`** in the visual language / chart guidance section (only in Step 2 audit). A designer specifying a drill-down chart might not know to reference `apps/mobile/src/components/interactive-charts/` patterns.
