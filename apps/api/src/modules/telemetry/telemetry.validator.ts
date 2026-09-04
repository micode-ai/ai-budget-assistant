/**
 * The privacy boundary. Everything a client sends passes through here, and
 * anything not explicitly allowed is DROPPED rather than rejected: one unknown
 * event name must not cost the other events in the same batch, and a client that
 * is a version behind must not have its whole batch fail.
 *
 * This is the reason a money-handling app can carry client telemetry at all —
 * an amount has nowhere to land, rather than merely being something we agreed
 * not to send.
 */

export type TelemetryEventName = 'session_start' | 'screen_view' | 'action';

export interface CleanEvent {
  name: TelemetryEventName;
  screen: string | null;
  props: Record<string, string | number> | null;
}

export const MAX_EVENTS_PER_BATCH = 40;

const EVENT_NAMES: ReadonlySet<string> = new Set<TelemetryEventName>([
  'session_start',
  'screen_view',
  'action',
]);

/** The one list. `STRING_PROPS.status` is built from it, and the funnel read
 *  path imports it rather than re-declaring the four literals. */
export const FUNNEL_STATUSES = ['started', 'completed', 'failed', 'abandoned'] as const;
export type FunnelStatus = (typeof FUNNEL_STATUSES)[number];

/** Allow-listed prop keys and, for string keys, their enumerated values. */
const STRING_PROPS: Record<string, ReadonlySet<string>> = {
  flow: new Set([
    'expense_manual',
    'expense_voice',
    'expense_receipt',
    'income_manual',
    'import_bank',
    'budget_create',
    'chat_message',
    'rate_alert_create',
  ]),
  status: new Set(FUNNEL_STATUSES),
};
const NUMBER_PROPS: ReadonlySet<string> = new Set(['ms']);

const SCREEN_MAX_LEN = 120;
/**
 * Route patterns only: letters, digits, / _ - and the [] () of expo-router.
 *
 * A `.` is deliberately NOT allowed. Every route name under `apps/mobile/app/`
 * was enumerated and none contains one, while allowing it let a decimal
 * (`42.50`, `12345.`) and a dotted merchant string (`Lidl.Warszawa`) through —
 * the dot was the one character that made an amount-shaped value look like a
 * path. Dropping it costs nothing real and closes both.
 */
const SCREEN_ALLOWED = /^[A-Za-z0-9/_\-[\]()]+$/;
/**
 * A segment must LOOK LIKE A ROUTE SEGMENT, not merely fail to look like an id.
 *
 * This started as a blacklist (`\d+` | long hex run | UUID) and that is the
 * wrong direction: a blacklist only rejects the id shapes somebody thought of,
 * so `1234.56`, `-99.99` and `.12345` all passed because the all-digit test was
 * per-segment while `.` and `-` were legal INSIDE a segment. A positive rule
 * inverts the default — anything not shaped like a route name is rejected — and
 * an expo-router segment always begins with a letter, `_` (`_layout`), `[`
 * (`[id]`) or `(` (`(tabs)`). No amount or signed number can start that way.
 *
 * It is NOT sufficient on its own for ids: a UUID whose first nibble happens to
 * be `a`-`f` starts with a letter and sails straight through, which is why both
 * checks below are still required alongside it.
 */
const SEGMENT_STARTS_LIKE_ROUTE = /^[A-Za-z_[(]/;
/**
 * Still needed on top of the positive rule, for a letter-leading hex id
 * (`deadbeefcafe`). Eight, not thirteen: an eleven-character `8f3c1d2e4a5` is a
 * perfectly ordinary short id, and no real route segment is eight-plus
 * characters of nothing but [0-9a-f].
 */
const SEGMENT_HEX_RUN = /^[0-9a-f]{8,}$/i;
/**
 * The hyphenated UUID shape — and it is a SEPARATE check, not something
 * `SEGMENT_HEX_RUN` subsumes, which is the mistake that shipped and had to be
 * reverted. `SEGMENT_HEX_RUN` requires the WHOLE segment to be contiguous hex,
 * so a UUID's four hyphens break the match; the only thing left rejecting a
 * UUID was then `SEGMENT_STARTS_LIKE_ROUTE`, which catches only the ~62% whose
 * first nibble is a digit. Measured over 20 000 `crypto.randomUUID()` values
 * under `expense/<uuid>`: 0 accepted by the original blacklist, 7 374 (~37%)
 * accepted without this constant, 0 with it. That is exactly the leak spec
 * decision 6 exists to prevent, so all three checks apply together.
 *
 * This cannot collide with a real route name even though this app has plenty of
 * hyphenated ones (`rate-alerts`, `set-balance`, `auto-capture`,
 * `forgot-password`): the shape pins hex-only groups of exactly 8-4-4-4-12.
 */
const SEGMENT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Known limit, and the honest boundary of shape validation: a bare token that
 * is indistinguishable from a word by shape alone is accepted — `Biedronka`,
 * and equally a cuid-style id. What the rule guarantees is that no number,
 * path, query string, contiguous hex run or UUID can land — not that no
 * word-shaped token can. The call site is the other half of that guarantee:
 * `trackScreen` is only ever handed `getCurrentRoute()?.name`.
 *
 * Deliberately NOT closed with a general "long token containing digits" rule:
 * it would catch cuids, but a future route like `v2-onboarding` would fall in
 * with them and silently stop reporting, which is the invisible failure spec
 * decision 6 refuses. The UUID shape is the right level of specificity.
 */
export function isSafeScreen(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > SCREEN_MAX_LEN) return false;
  if (!SCREEN_ALLOWED.test(value)) return false;
  return value
    .split('/')
    .every(
      (segment) =>
        segment.length === 0 ||
        (SEGMENT_STARTS_LIKE_ROUTE.test(segment) &&
          !SEGMENT_HEX_RUN.test(segment) &&
          !SEGMENT_UUID.test(segment)),
    );
}

function sanitizeProps(raw: unknown): Record<string, string | number> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const allowedStrings = Object.prototype.hasOwnProperty.call(STRING_PROPS, key)
      ? STRING_PROPS[key]
      : undefined;
    if (allowedStrings) {
      if (typeof value === 'string' && allowedStrings.has(value)) out[key] = value;
      continue;
    }
    if (NUMBER_PROPS.has(key) && typeof value === 'number' && Number.isFinite(value)) {
      out[key] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function sanitizeEvents(raw: unknown): CleanEvent[] {
  if (!Array.isArray(raw)) return [];
  const clean: CleanEvent[] = [];
  for (const entry of raw) {
    if (clean.length >= MAX_EVENTS_PER_BATCH) break;
    if (!entry || typeof entry !== 'object') continue;
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.name !== 'string' || !EVENT_NAMES.has(candidate.name)) continue;
    clean.push({
      name: candidate.name as TelemetryEventName,
      screen: isSafeScreen(candidate.screen) ? candidate.screen : null,
      props: sanitizeProps(candidate.props),
    });
  }
  return clean;
}
