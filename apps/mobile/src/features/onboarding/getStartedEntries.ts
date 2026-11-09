import { ROUTE_IMPORT } from '@/features/dashboard/dashboardDialogs';

/**
 * Which first-run entry leads, and the order of the rest (ABA-735).
 *
 * The phone leads with a receipt scan, then typing by hand. Statement import
 * led everywhere since ABA-643, but on a phone the CSV/PDF is rarely at hand:
 * import was the first transaction for 2 users ever, against 33 by hand and 14
 * by scan — and scan-first users stayed longest (7.1 active weeks on average
 * against 2.5). Desktop web keeps import first: there the file is on the same
 * machine, and the import report is the strongest first impression.
 *
 * Voice sits below typing: voice-first users were the shortest-lived (9 users,
 * 1.0 active weeks) — a small sample, so it is demoted, not removed.
 */
export type GetStartedLead = 'scan' | 'import';

export type GetStartedEntryId = 'import' | 'scan' | 'manual' | 'voice' | 'autoCapture';

export interface GetStartedEntry {
  id: GetStartedEntryId;
  route: string;
}

const ROUTES: Record<GetStartedEntryId, string> = {
  import: ROUTE_IMPORT,
  scan: '/expense/receipt',
  manual: '/expense/new',
  voice: '/expense/voice',
  autoCapture: '/settings/auto-capture',
};

const ORDER: Record<GetStartedLead, GetStartedEntryId[]> = {
  scan: ['scan', 'manual', 'import', 'voice', 'autoCapture'],
  import: ['import', 'scan', 'manual', 'voice', 'autoCapture'],
};

/**
 * @param lead          'scan' on the phone and narrow web, 'import' on desktop web
 * @param isAndroid     bank-notification capture exists only on Android
 */
export function resolveGetStartedEntries(
  lead: GetStartedLead,
  isAndroid: boolean,
): { primary: GetStartedEntry; secondary: GetStartedEntry[] } {
  const entries = ORDER[lead]
    .filter((id) => id !== 'autoCapture' || isAndroid)
    .map((id) => ({ id, route: ROUTES[id] }));
  return { primary: entries[0], secondary: entries.slice(1) };
}
