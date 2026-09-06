import { resolveChecklistDismissed, resolveSeen } from '../firstRunStore';

/**
 * The pure readers behind `firstRunStore`'s persisted flags.
 *
 * Every test names the single production change that would make it fail. A
 * test that cannot be broken by a named one-line edit pins nothing — this
 * project has shipped one that passed against a deliberately broken
 * implementation — so if a case here has no such note, delete it.
 *
 * These take a `read` function precisely so MMKV never loads here.
 */

/** A store where only the given key has been written. */
const only = (key: string, value: string) => (k: string) => (k === key ? value : undefined);

/** Nothing has ever been written — a fresh install, or a cleared browser. */
const empty = () => undefined;

describe('resolveChecklistDismissed', () => {
  it('defaults to NOT dismissed when nothing has been stored', () => {
    // Breaks if: the default is inverted (`!== 'false'`, `?? true`). Hiding
    // by default would silently remove, from every fresh install, the only
    // surface that explains why Safe to Spend reads 0,00.
    expect(resolveChecklistDismissed(empty)).toBe(false);
  });

  it('is dismissed once the flag has been written', () => {
    // Breaks if: `dismissChecklist` stops writing the literal `'true'`, or
    // the comparison is dropped. Without this the X does nothing that
    // survives a reload, and the card returns on every visit.
    expect(resolveChecklistDismissed(only('checklistDismissed', 'true'))).toBe(true);
  });

  it('reads its OWN key, not `seen`', () => {
    // Breaks if: the key constant is a copy-paste of `resolveSeen`'s `'seen'`.
    // That is the plausible bug in a reader written beside an identical one,
    // and it would hide the checklist from every user who has ever finished
    // onboarding — i.e. from everyone the card is meant to outlive first-run
    // for. Nothing else here would catch it: both flags are booleans in the
    // same MMKV instance.
    expect(resolveChecklistDismissed(only('seen', 'true'))).toBe(false);
  });

  it('treats a corrupted or hand-edited value as NOT dismissed', () => {
    // Breaks if: `=== 'true'` is loosened to a truthy check (`!!read(...)`,
    // `Boolean(...)`). Under that change the string `'false'` — the exact
    // thing a hand-edit or a half-written localStorage value produces —
    // dismisses the card permanently. Nothing is parsed, so no input here can
    // become NaN or throw; the worst case is this default.
    for (const raw of ['false', 'TRUE', 'True', '1', 'yes', '', 'null', 'undefined', '{']) {
      expect(resolveChecklistDismissed(only('checklistDismissed', raw))).toBe(false);
    }
  });
});

describe('resolveSeen is unchanged by the new flag', () => {
  it('still reads only `seen`', () => {
    // Breaks if: the two readers' key constants are swapped while adding the
    // second one. `seen` gates the whole first-run state, so a swap would
    // show onboarding to an established user the moment they dismissed a
    // card — a far louder failure than the one above, and equally invisible
    // in a diff that touches both constants.
    expect(resolveSeen(only('seen', 'true'))).toBe(true);
    expect(resolveSeen(only('checklistDismissed', 'true'))).toBe(false);
  });
});
