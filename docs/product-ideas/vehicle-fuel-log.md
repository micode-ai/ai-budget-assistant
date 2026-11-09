---
id: vehicle-fuel-log
title: 'Log fill-ups and see real fuel cost per 100 km'
status: building
priority: P3
created_at: 2026-11-08
jira_ticket:
orchestration_run: e32ef1e4-b54b-4c57-bceb-bde773f6da58
---

# Log fill-ups and see real fuel cost per 100 km

## User story
As a car owner, I want to add litres and an odometer reading to a fuel expense and see my consumption and cost per 100 km, so that I know what the car actually costs me.

## Value hypothesis
Fuel is one of the biggest recurring categories, and receipt OCR already reads quantities and unit prices for line items. Today the total is shown but not the answer people want: how much the car costs per kilometre. No odometer, mileage or fuel-economy feature exists in the app or the backlog.

## Sketch
- Optional "Vehicle" entity (name, fuel type), with no new account type.
- On a fuel-category expense, optional litres and odometer fields, prefilled by OCR when the receipt shows litres.
- Vehicle screen: consumption in l/100 km, cost per km, trend chart, last fill-up price against the community price.
- Mileage included in the business tax package export.

## Open questions
- New columns on `Expense` or a separate `FuelLog` table linked by expense id?
- Is the audience big enough, or can a tag cover it?
- Multiple vehicles per account.

## Cost estimate
About 2 weeks: a migration, the sync path, one screen, a chart and nine locales.
