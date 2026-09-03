import {
  shouldAskForReview,
  MIN_TRANSACTIONS,
  MIN_DAYS_BETWEEN_ASKS,
} from '../shouldAskForReview';
import { resolveLastAskedAt, resolveLastAskedVersion } from '@/stores/reviewPromptStore';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 3);

const base = {
  transactionCount: MIN_TRANSACTIONS,
  lastAskedAt: null as number | null,
  lastAskedVersion: null as string | null,
  currentVersion: '1.24.0',
  now: NOW,
};

describe('shouldAskForReview', () => {
  it('asks an established user who has never been asked', () => {
    expect(shouldAskForReview(base)).toBe(true);
  });

  it('never asks a user below the transaction floor', () => {
    expect(shouldAskForReview({ ...base, transactionCount: MIN_TRANSACTIONS - 1 })).toBe(false);
  });

  it('treats the floor as inclusive', () => {
    expect(shouldAskForReview({ ...base, transactionCount: MIN_TRANSACTIONS })).toBe(true);
  });

  it('never asks twice on the same app version, however long ago', () => {
    expect(
      shouldAskForReview({
        ...base,
        lastAskedVersion: '1.24.0',
        lastAskedAt: NOW - 400 * DAY_MS,
      }),
    ).toBe(false);
  });

  it('still refuses inside the quota window even after an update', () => {
    expect(
      shouldAskForReview({
        ...base,
        lastAskedVersion: '1.23.0',
        lastAskedAt: NOW - (MIN_DAYS_BETWEEN_ASKS - 1) * DAY_MS,
      }),
    ).toBe(false);
  });

  it('asks again once both throttles have cleared', () => {
    expect(
      shouldAskForReview({
        ...base,
        lastAskedVersion: '1.23.0',
        lastAskedAt: NOW - (MIN_DAYS_BETWEEN_ASKS + 1) * DAY_MS,
      }),
    ).toBe(true);
  });

  it('treats the interval boundary as still throttled', () => {
    expect(
      shouldAskForReview({
        ...base,
        lastAskedVersion: '1.23.0',
        lastAskedAt: NOW - MIN_DAYS_BETWEEN_ASKS * DAY_MS + 1,
      }),
    ).toBe(false);
  });
});

describe('reviewPromptStore resolvers', () => {
  it('reads a stored timestamp back as a number', () => {
    expect(resolveLastAskedAt(() => '1756857600000')).toBe(1756857600000);
  });

  it('reads a missing timestamp as never-asked', () => {
    expect(resolveLastAskedAt(() => undefined)).toBeNull();
  });

  it('reads a corrupted timestamp as never-asked rather than NaN', () => {
    // NaN would compare false against every operand, silently disabling the
    // interval throttle instead of the intended fail-safe of asking again.
    expect(resolveLastAskedAt(() => 'not-a-number')).toBeNull();
  });

  it('reads the stored version, or null when absent', () => {
    expect(resolveLastAskedVersion(() => '1.24.0')).toBe('1.24.0');
    expect(resolveLastAskedVersion(() => undefined)).toBeNull();
  });
});
