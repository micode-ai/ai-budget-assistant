export const TRACKED_FIELDS = [
  'amount',
  'currencyCode',
  'categoryId',
  'description',
  'merchant',
  'date',
] as const;

/** Fields that hold client-side ciphertext on an account at encryption tier 1 or above. */
export const TIER1_ENCRYPTED_FIELDS: ReadonlySet<string> = new Set(['description', 'merchant']);

export type RevisionChanges = Record<string, { from: unknown; to: unknown }>;

/** Normalises a column value so Decimal / Date / null compare and serialise stably. */
function norm(v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const n = Number(String(v));
    return Number.isNaN(n) ? String(v) : n; // Prisma Decimal
  }
  return v;
}

/**
 * Pure diff of the tracked plaintext fields. Returns null when nothing changed, or when either
 * side is an E2EE row (its plaintext columns are zeroed/blank, so a diff would be meaningless
 * and the real values must never be copied into a plaintext history table).
 * With `textEncrypted` (account `encryptionTier >= 1`), `description` and `merchant` hold
 * client-side ciphertext, so they are left out rather than shown to members as "from → to".
 */
export function diffTransaction(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  opts: { textEncrypted?: boolean } = {},
): RevisionChanges | null {
  if (before.encryptedPayload || after.encryptedPayload) return null;
  const changes: RevisionChanges = {};
  for (const f of TRACKED_FIELDS) {
    if (opts.textEncrypted && TIER1_ENCRYPTED_FIELDS.has(f)) continue;
    const a = norm(before[f]);
    const b = norm(after[f]);
    if (a !== b) changes[f] = { from: a, to: b };
  }
  return Object.keys(changes).length ? changes : null;
}
