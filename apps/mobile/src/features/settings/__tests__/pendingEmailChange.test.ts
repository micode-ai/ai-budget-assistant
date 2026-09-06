import {
  PENDING_EMAIL_CHANGE_KEY,
  resolvePendingEmailChange,
} from '../pendingEmailChange';

/**
 * This function decides whether a user who has already been mailed a 6-digit
 * code gets taken back to the field for it, or is silently returned to step 1
 * with the code in their inbox now useless. Every case below names the
 * production change it catches, because a test that cannot fail is worse than
 * no test.
 */
const NOW = new Date('2026-09-06T12:00:00.000Z');

const stored = (newEmail: string, expiresAt: string) => JSON.stringify({ newEmail, expiresAt });

describe('resolvePendingEmailChange', () => {
  // Catches: the expiry comparison being inverted or dropped. Inverted, every
  // live request reads as spent and the user can never finish a change without
  // requesting a second code; and since `discard` clears the key, the record
  // proving which address was used would be destroyed on the way past.
  it('resumes a request that has not expired', () => {
    expect(
      resolvePendingEmailChange(stored('new@example.com', '2026-09-06T12:25:00.000Z'), NOW),
    ).toEqual({ status: 'resume', newEmail: 'new@example.com' });
  });

  // Catches: the expiry check being removed. Without it a 30-minute-old record
  // resumes forever, sending the user to a code field whose every submission
  // the API will reject, with no wording anywhere explaining why.
  it('discards a request whose 30 minutes have passed', () => {
    expect(
      resolvePendingEmailChange(stored('new@example.com', '2026-09-06T11:59:59.000Z'), NOW),
    ).toEqual({ status: 'discard' });
  });

  // Catches: `>=` in place of `>`. The boundary is spent, not live - resuming
  // a code the server has already let go leads only to a failing field.
  it('treats a deadline of exactly now as spent', () => {
    expect(
      resolvePendingEmailChange(stored('new@example.com', NOW.toISOString()), NOW),
    ).toEqual({ status: 'discard' });
  });

  // Catches: the try/catch being removed. `JSON.parse` would then throw inside
  // the screen's mount effect, whose `.then` also clears the loading flag - so
  // the screen would sit on its spinner permanently, with no way to start a
  // change at all.
  it('discards a record that is not JSON rather than throwing', () => {
    expect(resolvePendingEmailChange('{ this is not json', NOW)).toEqual({ status: 'discard' });
  });

  // Catches: trusting the parsed shape. `JSON.parse('null')` and a bare string
  // both parse without throwing and carry no deadline; an unreadable record is
  // an unusable one and must not resume with an undefined address, which the
  // confirm step would then write over the user's real email.
  it.each([['null'], ['"just a string"'], ['{"newEmail":"a@b.c"}']])(
    'discards a parseable record with no usable deadline: %s',
    (raw) => {
      expect(resolvePendingEmailChange(raw, NOW)).toEqual({ status: 'discard' });
    },
  );

  // Catches: collapsing `none` into `discard`. They differ by exactly one side
  // effect - `discard` clears the key - and clearing a key that was never set
  // is a pointless write to secure storage on every single open of the screen.
  it('reports nothing stored separately from something unusable', () => {
    expect(resolvePendingEmailChange(null, NOW)).toEqual({ status: 'none' });
  });

  // Catches: renaming the key on one side only. The write happens in the
  // screen and the read here; a drift between them silently ends every resume,
  // and there is no other record of which address a code was sent to.
  it('names the one key both the write and the read use', () => {
    expect(PENDING_EMAIL_CHANGE_KEY).toBe('pendingEmailChange');
  });
});
