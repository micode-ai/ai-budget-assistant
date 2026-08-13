import { shouldShowFirstRun } from '../shouldShowFirstRun';

const ready = { gateOpen: true, seen: false, hasTransactions: false, canEdit: true };

describe('shouldShowFirstRun', () => {
  it('shows the screen to a brand-new, editable, empty account once the gate is open', () => {
    expect(shouldShowFirstRun(ready)).toBe(true);
  });

  it('waits while the cold-start gate is still closed', () => {
    // Navigating before RootNavigator has mounted its Stack wedges expo-router
    // on a black screen — the same trap both deep-link paths are gated against.
    expect(shouldShowFirstRun({ ...ready, gateOpen: false })).toBe(false);
  });

  it('never shows twice', () => {
    expect(shouldShowFirstRun({ ...ready, seen: true })).toBe(false);
  });

  it('does not show to an account that already has transactions', () => {
    // Reinstall, second device, or an existing user on the release that adds
    // this: they are already activated and must not be sent to onboarding.
    expect(shouldShowFirstRun({ ...ready, hasTransactions: true })).toBe(false);
  });

  it('does not show to a viewer, who cannot create a transaction at all', () => {
    expect(shouldShowFirstRun({ ...ready, canEdit: false })).toBe(false);
  });

  it('requires every condition — no single one is sufficient', () => {
    expect(shouldShowFirstRun({ gateOpen: true, seen: true, hasTransactions: true, canEdit: false })).toBe(false);
    expect(shouldShowFirstRun({ gateOpen: false, seen: false, hasTransactions: false, canEdit: true })).toBe(false);
  });
});
