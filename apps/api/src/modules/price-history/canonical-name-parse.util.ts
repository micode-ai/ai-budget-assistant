/**
 * Parses the model's reply for the AI canonical-name backfill.
 *
 * Why a keyed map and not a list of lines: the previous contract asked for "one
 * name per line, same order as input" and then matched them **positionally**
 * after `filter(Boolean)` dropped blanks. One stray empty or numbered line
 * shifted the whole tail, so products silently received *other products'*
 * canonical names — worse than receiving none, because a wrong name quietly
 * corrupts the price history that the Personal Inflation Index, Inflation Shield
 * and the receipt price check all read, and nothing logs it.
 *
 * With an explicit 1-based key per entry a shift is structurally impossible: a
 * missing key is a known miss, never a misattribution. Integer keys rather than
 * the description text follow the same lesson `parseMatchedIndices`
 * (`modules/ai/utils/semantic-filter.ts`) learned — small models mangle and
 * truncate long string identifiers, and OCR descriptions are exactly the kind of
 * noisy string (diacritics, punctuation, stray quotes) that does not survive a
 * round trip as a JSON key.
 */
export function parseCanonicalNameMap(raw: string, count: number): Map<number, string> {
  const out = new Map<number, string>();
  if (!raw || count <= 0) return out;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A fenced ```json block or leading prose still yields usable JSON if the
    // outermost object can be isolated.
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end <= start) return out;
    try {
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return out;
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out;

  // Accept either {"1": "Name"} or {"names": {"1": "Name"}} — a wrapper key is a
  // common shape for a model told to answer in JSON.
  const record = parsed as Record<string, unknown>;
  const inner =
    record.names && typeof record.names === 'object' && !Array.isArray(record.names)
      ? (record.names as Record<string, unknown>)
      : record;

  for (const [key, value] of Object.entries(inner)) {
    const idx = Number.parseInt(key, 10);
    if (!Number.isInteger(idx) || idx < 1 || idx > count) continue;
    if (typeof value !== 'string') continue;
    const name = value.trim();
    if (!name) continue;
    out.set(idx, name);
  }

  return out;
}
