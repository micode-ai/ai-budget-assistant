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
  | 'rate_alert_create';

export type TelemetryStatus = 'started' | 'completed' | 'failed' | 'abandoned';
