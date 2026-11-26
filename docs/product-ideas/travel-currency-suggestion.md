---
id: travel-currency-suggestion
title: 'Suggest the local currency when the user logs expenses abroad'
status: building
priority: P3
created_at: 2026-11-26
jira_ticket:
orchestration_run: ee02e431-0910-41d6-ad9e-2f0c51c38116
---

# Suggest the local currency when the user logs expenses abroad

## User story
As a traveller, I want the app to notice I am in another country and offer that country's currency on new expenses, so that I do not log a Prague coffee in złoty by mistake.

## Value hypothesis
The expense form defaults to the base currency, and the currency chip is editable, but nothing reacts to the user being somewhere else. A wrong default is the most likely error abroad, and it silently corrupts totals because changing the currency relabels rather than converts. A small nudge prevents it without needing the full trip wallet.

## Sketch
- When the device locale region or a recent geo fix (only if the user already granted location for expense maps) maps to a supported currency different from the base currency, show a one-line chip on the create form: "In Czechia? Use CZK".
- One tap switches the form's currency; the choice is remembered for 14 days as the default for that account.
- A dismiss option turns the suggestion off for that country.
- Falls back to nothing when the country maps to an unsupported currency or when no permission was granted. It never asks for location itself.
- Optionally suggests creating a trip wallet after three suggestions in a row.

## Open questions
- Is device region a good enough signal? Roaming users often keep their home region setting, so geo is the real signal, and it is optional.
- Eurozone countries map to one currency, but a few supported currencies are used in several countries.
- Privacy copy for anything that reads coordinates.

## Cost estimate
About 3 days: a country-to-currency table in shared-utils, a hook on the create form, i18n in 11 locales.
