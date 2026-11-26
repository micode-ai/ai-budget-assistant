# Travel currency suggestion

## What this is
A one-line chip on the expense create form ("In Czechia? Use CZK") when the user's location maps to a supported currency other than their base currency.

## Entry points
- `packages/shared-utils/src/formatting/country-currency.ts` - table and `suggestLocalCurrency`
- `apps/mobile/src/hooks/useTravelCurrencySuggestion.ts`, `apps/mobile/src/features/travelCurrency/`
- `apps/mobile/src/components/expenses/create/ExpenseCreateForm.tsx`

## Key concepts
The signal is the GPS fix the form already captures for expense maps, reverse-geocoded by the OS. Accepting remembers the currency for 14 days per account (it seeds the next form); the X dismisses that country permanently.

## Invariants
- Never request location: no permission or capture toggle off means no chip. Device region is deliberately not used, since roaming users keep their home region.
- Accepting relabels the form currency, never converts.
- Unsupported-currency countries show nothing.

## Known gaps
No web signal. The trip-wallet nudge after three suggestions is counted in the store but not rendered.

## History
ABA-855.
