/** Platform-free so `telemetry.ts`, `telemetry.native.ts` and `telemetry.web.ts`
 *  can all import it without any platform file importing another. Mirrors
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
  | 'capture_suggestion'
  | 'gazetka';

export type TelemetryStatus = 'started' | 'completed' | 'failed' | 'abandoned';

/** Why a `failed` happened — which form check tripped, or the save itself.
 *  A closed list, never free text (an error message could carry user data).
 *  Must match `STRING_PROPS.reason` in the API validator. */
export type TelemetryFailReason = 'amount' | 'categories' | 'save';

/** Coarse device class (ABA-683). Web buckets the window width; native buckets
 *  the screen's shortest side (`phone` / `tablet` only). Never the raw
 *  dimensions, the user agent or a device model: those fingerprint, a bucket
 *  does not.
 *  Must match `STRING_PROPS.formFactor` in the API validator. */
export type TelemetryFormFactor = 'phone' | 'tablet' | 'desktop';

/** Installed PWA (`standalone`) or a browser tab on web; always `app` from the
 *  native app. Must match `DISPLAYS` in the API validator. */
export type TelemetryDisplay = 'standalone' | 'browser' | 'app';
