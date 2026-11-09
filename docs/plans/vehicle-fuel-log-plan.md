# Plan: vehicle fuel log (`vehicle-fuel-log`)

Decisions (open questions from the idea):
- **Separate tables, not `Expense` columns.** `Vehicle` + `FuelLog` (1:1 with an expense by `expenseId`). Keeps the hot,
  E2EE-encrypted, synced `Expense` row untouched; no migration risk on the transactions list.
- **Not a tag.** A tag cannot hold litres/odometer or compute consumption.
- **Multiple vehicles per account:** yes (a `Vehicle` row each).
- Scope of this task: API main path. Mobile screen, OCR prefill, trend chart, community-price comparison and the tax-export
  mileage line are follow-ups (listed below).

## Checklist
- [x] Plan (this file)
- [x] Contract `docs/contracts/vehicle-fuel-log.md`
- [x] Prisma models `Vehicle`, `FuelLog` + migration in the same commit
- [x] Pure stats util `fuel-stats.util.ts` + spec
- [x] `modules/vehicles` (service, controller, DTOs), registered in `AppModule`
- [x] Shared types `Vehicle`, `FuelLog`, `VehicleStats`
- [x] Wiki page + log line, user docs note
- [ ] Follow-up: mobile Vehicle screen (phone + desktop web), SQLite mirror, i18n x9
- [ ] Follow-up: OCR litres prefill; trend chart; community-price comparison; tax export mileage
