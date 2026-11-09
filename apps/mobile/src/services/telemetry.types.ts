/** Platform-free so both `telemetry.ts` and `telemetry.web.ts` can import it
 *  without either platform file importing the other. Mirrors
 *  `attribution.types.ts`. These names must match the server allow-list in
 *  `apps/api/src/modules/telemetry/telemetry.validator.ts` — a value missing
 *  there is dropped silently. */
export type TelemetryFlow =
  | 'expense_manual'
  | 'expense_voice'
  | 'expense_receipt'
  | 'income_manual'
  | 'import_bank'
  | 'budget_create'
  | 'chat_message'
  | 'rate_alert_create'
  | 'ios_install'
  | 'import_report'
  | 'capture_suggestion';

export type TelemetryStatus = 'started' | 'completed' | 'failed' | 'abandoned';

/** Why a `failed` happened — which form check tripped, or the save itself.
 *  A closed list, never free text (an error message could carry user data).
 *  Must match `STRING_PROPS.reason` in the API validator. */
export type TelemetryFailReason = 'amount' | 'categories' | 'save';

/** Coarse device class, from the window width alone (ABA-683). Never the raw
 *  dimensions or the user agent: those fingerprint, a three-way bucket does not.
 *  Must match `STRING_PROPS.formFactor` in the API validator. */
export type TelemetryFormFactor = 'phone' | 'tablet' | 'desktop';

/** Installed PWA (`standalone`) or a browser tab. Must match
 *  `STRING_PROPS.display` in the API validator. */
export type TelemetryDisplay = 'standalone' | 'browser';
