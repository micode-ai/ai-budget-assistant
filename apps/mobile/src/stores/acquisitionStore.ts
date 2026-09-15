import { MMKV } from 'react-native-mmkv';
import { ACQUISITION_KEYS, type Acquisition } from '@/services/attribution.types';

const mmkv = new MMKV({ id: 'acquisition' });

const VALUE_KEY = 'acquisition';
const RAW_KEY = 'acquisitionRaw';
const READ_KEY = 'acquisitionRead';
const PUSHED_KEY = 'acquisitionPushed';

/** The API's own bound. Longer than this is truncated, never dropped: a clipped
 *  referrer still identifies a source, an absent one identifies nothing. */
export const MAX_RAW_LENGTH = 200;

const SAFE = /^[A-Za-z0-9_-]{1,20}$/;

/** Pure so the defaults can be tested without mocking MMKV (firstRunStore's shape). */
export function resolveStored(read: (key: string) => string | undefined): Acquisition | undefined {
  try {
    const raw = read(VALUE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Acquisition;
    const clean: Acquisition = {};
    let found = false;
    for (const k of ACQUISITION_KEYS) {
      const v = parsed?.[k];
      if (typeof v === 'string' && SAFE.test(v)) {
        clean[k] = v;
        found = true;
      }
    }
    return found ? clean : undefined;
  } catch {
    return undefined;
  }
}

/** Strict `=== 'true'`, so an absent or corrupt value resolves to "not yet" and the
 *  work retries. The safe direction: a repeated no-op PATCH costs nothing, a
 *  permanently skipped one loses the attribution for good. */
export function resolvePushed(read: (key: string) => string | undefined): boolean {
  return read(PUSHED_KEY) === 'true';
}

/** Same default and same reason as `resolvePushed`: a transient SERVICE_UNAVAILABLE
 *  must be retried on the next launch, not recorded as "this install has no referrer". */
export function resolveRead(read: (key: string) => string | undefined): boolean {
  return read(READ_KEY) === 'true';
}

export function truncateReferrer(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  return raw.slice(0, MAX_RAW_LENGTH);
}

export const acquisitionFlag = {
  stored: (): Acquisition | undefined => resolveStored((k) => mmkv.getString(k)),
  storedRaw: (): string | undefined => mmkv.getString(RAW_KEY),
  hasRead: (): boolean => resolveRead((k) => mmkv.getString(k)),
  hasPushed: (): boolean => resolvePushed((k) => mmkv.getString(k)),
  markPushed: (): void => mmkv.set(PUSHED_KEY, 'true'),
  /** First touch wins: an existing record is never replaced. */
  save: (value: Acquisition | undefined, raw: string | undefined): void => {
    if (!mmkv.getString(VALUE_KEY) && value) mmkv.set(VALUE_KEY, JSON.stringify(value));
    if (!mmkv.getString(RAW_KEY) && raw) mmkv.set(RAW_KEY, raw);
    mmkv.set(READ_KEY, 'true');
  },
};
