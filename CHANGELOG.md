# Changelog

All notable user-facing changes to the mobile app are documented here.
Versions match the app `versionName` (`apps/mobile/android/app/build.gradle` / `apps/mobile/app.json`).

## [1.11.0] — 2026-07-05

### Added
- **Expense map & geo-location (ABA-310).** Expenses can now carry a location. Scanned receipts are geo-located automatically from the store address printed on the receipt; you can also attach your current GPS position to expenses you add on the spot (opt-in, off by default, toggle in Settings → Data & Reports), or place/adjust the pin by hand.
  - New **List / Map toggle** on the Expenses tab — the map inherits your active period, category and merchant filters, clusters nearby pins, and each pin opens the expense.
  - Expense detail shows a **mini-map** with the location; add, edit (drag/tap or "My location") or remove the pin.
  - Trip accounts get a **"Trip map"** entry showing where the trip's money went.

### Changed / Fixed
- **Structured receipt geocoding (ABA-311).** Store addresses now resolve reliably. Polish receipts print both the store address and the seller company's registered office in one block, which broke the previous free-text lookup; the app now extracts and geocodes the store (point-of-sale) address only, ignoring the company head office.
- Map marker icons now render correctly (previously the pin could appear without its image).

## Notes
- Location for expenses only starts from this version onward; previously created expenses are not back-filled.
- Bank/CSV imports do not attach a location.
