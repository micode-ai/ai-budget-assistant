import { createHash } from 'crypto';
import { normalizeMerchantPL } from '../import-bank/merchants/merchants-pl';

/**
 * Monday-of-week bucket for a purchase date (API-local — do NOT import
 * shared-utils at runtime, ABA-317). Mirrors the `startOfWeek` helper in
 * `modules/budgets/budget-period.util.ts`; kept as its own small copy here
 * because that file is private to the budgets module and this bucket has a
 * different purpose (a stable week key for the community price corpus, not a
 * budget rollover boundary). Returns a Date normalized to local midnight —
 * safe to write into a Prisma `@db.Date` column.
 */
export function mondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as first day
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Round to 1 decimal place — a ~11km grid cell, deterministic and network-free. */
function roundGrid(n: number): string {
  return n.toFixed(1);
}

/**
 * Resolve the anonymized region bucket for a store's point-of-sale location.
 * Prefers the reverse-geocoded city (lowercased/trimmed); falls back to a
 * coarse lat/lng grid cell when reverse geocoding is unavailable or returned
 * no match. Never touches the network itself — purely a string-shaping
 * function so it can be unit-tested without mocking geocoding.
 */
export function regionBucket(lat: number, lng: number, city?: string | null): string {
  const cleaned = city?.replace(/\s+/g, ' ').trim().toLowerCase();
  if (cleaned) return cleaned;
  return `grid:${roundGrid(lat)}|${roundGrid(lng)}`;
}

/**
 * Salted SHA-256 hash of the contributing PERSON (ABA-642 D2: keyed on userId,
 * not accountId — personal + business + trip accounts of one human must be one
 * contributor, not three). This is the ONLY link between an observation row and
 * its contributor — a one-way hash, never reversible, never exposed to clients.
 * It enforces the one-vote-per-person-per-week dedup (the unique constraint) and
 * feeds the read-path k-anonymity gate. The `:u:` domain tag keeps it unrelated
 * to the legacy per-account keys; a different salt (rotation) produces entirely
 * unrelated keys, breaking any correlation with historical rows.
 */
export function computeContributorKey(salt: string, userId: string): string {
  return createHash('sha256').update(`${salt}:u:${userId}`).digest('hex');
}

/** Store name as the corpus keys it (shared by the scan attestation and the contribution). */
export function normalizeCommunityMerchant(merchant: string | null | undefined): string | null {
  if (!merchant) return null;
  const n = normalizeMerchantPL(merchant)?.trim().toLowerCase();
  return n ? n : null;
}

/**
 * Contributor-eligibility gate (ABA-335 anti-Sybil, defense-in-depth; ABA-642: evaluated per
 * USER, across all of the user's accounts). A user must be at least `minAgeDays` old AND have at least `minExpenses` real tracked
 * expenses before its contributions count toward the k-anonymity corpus. Age alone
 * is cheap to fake at scale (register + wait); requiring sustained real usage raises
 * the per-identity cost of a Sybil fleet meaningfully. Pure so it's unit-testable;
 * it does NOT fully solve Sybil (a scripted attacker can still simulate usage) — see
 * docs/superpowers/community-price-antisybil.md for the residual risk + full path.
 */
export function isEligibleContributor(
  accountAgeDays: number,
  expenseCount: number,
  minAgeDays: number,
  minExpenses: number,
): boolean {
  return accountAgeDays >= minAgeDays && expenseCount >= minExpenses;
}
