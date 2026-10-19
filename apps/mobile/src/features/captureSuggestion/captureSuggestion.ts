import type { ExpenseSource } from '@budget/shared-types';

/**
 * ABA-682: after enough expenses typed in by hand, show once the faster ways
 * to capture one. Manual entry is where people burn out — the most engaged web
 * user in the telemetry typed dozens of expenses in a day, came back twice and
 * left, never having met the receipt scan, voice, the bots or the import.
 *
 * Pure, so the decision is tested without MMKV or React.
 */

/** Manual saves through the create form before the suggestion appears. */
export const MANUAL_SAVES_THRESHOLD = 10;

/**
 * Sources that mean the user already found a faster way in. `import` covers
 * both bank and competitor-app imports; `notification` is Android auto-capture.
 */
const FASTER_SOURCES: ReadonlySet<ExpenseSource> = new Set<ExpenseSource>([
  'voice',
  'ocr',
  'import',
  'telegram',
  'whatsapp',
  'slack',
  'notification',
]);

export function hasUsedFasterCapture(expenses: readonly { source?: ExpenseSource | null }[]): boolean {
  return expenses.some((e) => e.source != null && FASTER_SOURCES.has(e.source));
}

export interface SuggestionInput {
  manualSaves: number;
  alreadyShown: boolean;
  usedFasterCapture: boolean;
}

/** Once ever, only past the threshold, never to someone already using a faster way. */
export function shouldSuggestFasterCapture({ manualSaves, alreadyShown, usedFasterCapture }: SuggestionInput): boolean {
  return !alreadyShown && !usedFasterCapture && manualSaves >= MANUAL_SAVES_THRESHOLD;
}

export type CaptureOptionKey = 'receipt' | 'voice' | 'bots' | 'import' | 'notifications';

export interface CaptureOption {
  key: CaptureOptionKey;
  route: string;
  icon: string;
}

/**
 * What to offer on this platform. Bank-notification capture reads Android
 * notifications, so it exists nowhere else. Every destination gates itself
 * (tier limits included), as the What's New spotlight's destinations do.
 */
export function captureOptionsFor(os: string): CaptureOption[] {
  const options: CaptureOption[] = [
    { key: 'receipt', route: '/expense/receipt', icon: 'receipt-outline' },
    { key: 'voice', route: '/expense/voice', icon: 'mic-outline' },
    { key: 'bots', route: '/settings/bots', icon: 'chatbubbles-outline' },
    { key: 'import', route: '/settings/import', icon: 'document-text-outline' },
  ];
  if (os === 'android') {
    options.push({ key: 'notifications', route: '/settings/auto-capture', icon: 'notifications-outline' });
  }
  return options;
}
