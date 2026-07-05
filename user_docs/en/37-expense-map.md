# Expense Map

> See your expenses on a map. Scanned receipts are placed by store address; add your location or drop a pin by hand.

See your spending on a map. Expenses can carry a location — taken from the store address printed on a scanned receipt, from your phone's GPS at the moment you add an expense, or placed by hand — and the app can show any filtered list of expenses as clickable pins on a map.

## Where Locations Come From

An expense gets its location from one of three sources (higher wins):

1. **Manual pin** — you place or move the pin yourself on the expense's location screen.
2. **Receipt address** — when you scan a receipt, the app reads the store address printed on it and converts it to map coordinates automatically. This works even if you scan the receipt at home later.
3. **GPS at entry time** — optionally, the app can silently attach your current position when you add an expense on the spot (manual entry, voice entry, or automatic bank-notification capture).

Imported transactions (bank CSV/PDF files) do not get a location.

## Turning On GPS Capture

GPS capture is **off by default**. To enable it:

1. Open **Settings → Data & Reports**.
2. In the **Location** section, turn on **Attach location to new expenses**.
3. Allow the location permission when the system asks.

When enabled, new expenses you add on the go get your current position automatically. You can always see and remove an expense's location, and you can turn the toggle off at any time.

## Map View on the Expenses Tab

On the **Expenses** tab, tap the map icon next to the search icon to switch from the list to a map. The map shows the same expenses as the list — your period, category, and merchant filters all apply. Tap the icon again to return to the list.

- Nearby expenses are grouped into numbered clusters; tap a cluster to zoom in.
- Tap a pin to see the merchant and amount; tap **Open** to jump to that expense.
- If some filtered expenses have no location, a small banner shows how many.

## Location on the Expense Screen

When an expense has a location, its detail screen shows a small map with the pin and the address (or coordinates). From there you can:

- **Edit location** — opens a full-screen map where you can tap to place the pin, drag it, or use **My location** to jump to where you are.
- **Remove location** — the trash icon next to the map removes the pin in one tap.

An expense without a location shows an **Add location** button instead (editors only).

## Trip Map

Trip accounts get a dedicated entry point: open the trip account and tap **Trip map**. The app switches to that trip and opens the Expenses tab in map mode — a visual diary of where the trip's money went. Combined with receipt scanning and GPS capture, most trip expenses land on the map automatically.

## Privacy

- GPS capture is strictly opt-in and off by default; the permission is only requested when you enable the toggle.
- The receipt-address lookup uses only the address printed on the receipt — no phone location is involved.
- A location is part of the expense record: members of a shared account who can see the expense also see its location.
- You can remove any expense's location at any time.
