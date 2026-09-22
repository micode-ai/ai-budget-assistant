# Report periods and export

*Hub: [analytics-insights](../analytics-insights.md)*

## What this is

The reports screen's range selection, the PDF/Excel/CSV generation behind it, and the file export
that saves or shares the result.

## Entry points

- `apps/mobile/src/features/reports/reportDateRange.ts` — the whole pure module:
  `resolveReportDateRange`, `reportSelectionFromAnalytics`, `buildRecentMonthAnchors`,
  `formatMonthLabel`, `formatDigestPeriod`
- `apps/mobile/src/services/fileExport.{ts,native.ts,web.ts}` + `fileExport.utils.ts`
- `apps/api/src/modules/reports/report-currency.util.ts`
- `apps/api/src/modules/reports/generators/pdf-row-layout.util.ts` — `planTransactionRows`

## Key concepts

**The screen holds only chips and pickers**; every boundary is resolved by the pure module. Five
modes: the presets, `specificMonth` (a 24-month picker) and `custom` (an arbitrary pair).

**Report generation in all three formats is FREE**, as is backup export/restore. The only paid part
is scheduled e-mail delivery: the weekly summary is `business`, the monthly digest e-mail `pro`+.
The in-app digest card is free. The orphaned `tierBadge` styles on the reports screen are dead
leftovers of an abandoned gate — do not wire them up.

**The report is computed in the CALLER's display currency**, taken from `req.user.currencyCode`,
never inferred from a row.

## Invariants

**Format every boundary with `toDateInputValue`, never `toISOString()`.** The screen used to build a
local-midnight `Date` and ISO-format it, so on any positive UTC offset the start date fell a day
early — "this month" began on the last day of the previous month and "this year" on 31 December —
while on a negative offset the end date resolves to *yesterday*, silently dropping today's rows.

**`quarter` is the closed PREVIOUS calendar quarter.** It used to be `new Date(y, m-3, 1)`, i.e.
about 3.5 months, under a label that says "last quarter" in all nine locales. Being closed also
means its figures stop moving day to day.

**Return `null` for a half-picked or backwards custom range**, and disable Generate rather than
sending it.

**Print the resolved `startDate — endDate` under the chips**, so a preset label can never silently
disagree with the file's own header.

**The monthly-digest card is always the current month**, regardless of the selection, and says so —
it sits directly under the Generate button.

**Convert every amount before aggregating.** `reduce((s,e) => s + Number(e.amount), 0)` added a
EUR 12.00 charge to a PLN report as 12 złoty, and the category table, the percentages and the Excel
summary all inherited the blend. Rates are fetched only when the rows actually mix currencies; an
unknown rate **excludes** the amount and sets `fxApproximate`. Transaction rows keep their own
native currency, because the list is a ledger — which is why the output carries an explicit note.

**Plan PDF row heights; do not advance by a constant.** The table advanced by a fixed 14 while the
description cell wraps, so a long merchant name printed its second line on top of the next row.
`planTransactionRows` measures, breaks pages height-aware, does not loop forever on a row taller
than a page, and degrades to one line on a `NaN` measurement.

**Never call `expo-file-system` from a store.** Its `File`/`Directory`/`Paths` API has **no web
implementation** — `new File(Paths.cache, name)` throws `TypeError: this.validatePath is not a
function` — which broke report sharing, report download AND backup creation from three call sites.
Everything goes through the `fileExport` three-file split.

**Generate must export, not open a share sheet.** `handleGenerate` calls `downloadReport`, not
`shareReport`; sharing stays on the report's own row.

**A cancelled picker is not a failure.** `isPickerCancelled` matches Expo's `ERR_PICKER_CANCELLED`
or a `/cancel/i` message and returns `{status:'cancelled'}` so the UI stays silent, while a real
write failure still falls through to the share sheet.

**When entering from Analytics, a still-running period maps to the preset that ends today**, and a
finished one to its exact full span — a report generated on the 17th must not print "1–31 August".
`week` maps to a **custom** range from `getStartOfWeek`, not the `week` preset: Analytics means the
Monday-based calendar week, the preset means trailing 7 days, and on a Monday those differ by a week.

## Known gaps

- Column headers are not repeated after a PDF page break.
- The PDF label table has **no `nl`** — Dutch falls back to English.
- Excel sheet names and column headers are hardcoded English.
- The screen does not expose the DTO's `categoryIds` / `tagIds` / `projectIds` / `currencyCode`
  filters.
- Analytics' `selectedCurrency` and drill-down state are not carried over.

## History

ABA-409 (periods) · ABA-410 (tiering corrected — reports are free, only the e-mail schedule is paid;
user docs had claimed PDF/Excel were Pro in all nine locales) · ABA-411 (the Analytics hand-off) ·
ABA-412 (the file-export platform split) · ABA-413 (report currency and PDF row layout).
