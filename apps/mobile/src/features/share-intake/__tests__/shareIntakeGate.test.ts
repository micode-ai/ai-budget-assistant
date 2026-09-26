import { decideShareNavigation } from '../shareIntakeGate';

const base = { pendingNavigation: true, screenOpen: false, coldStartGateReady: true, firstRunSeen: true, canEdit: true };

describe('decideShareNavigation', () => {
  it('idle when nothing is pending', () => {
    expect(decideShareNavigation({ ...base, pendingNavigation: false })).toBe('idle');
  });
  it('idle while the share screen is already open (it consumes the flag itself)', () => {
    expect(decideShareNavigation({ ...base, screenOpen: true })).toBe('idle');
  });
  it('waits for the cold-start gate (signed out / initialising / fonts)', () => {
    expect(decideShareNavigation({ ...base, coldStartGateReady: false })).toBe('wait');
  });
  it('waits while first-run onboarding is still pending', () => {
    expect(decideShareNavigation({ ...base, firstRunSeen: false })).toBe('wait');
  });
  it('viewer → block', () => {
    expect(decideShareNavigation({ ...base, canEdit: false })).toBe('block_viewer');
  });
  it('navigates when everything is ready', () => {
    expect(decideShareNavigation(base)).toBe('navigate');
  });
});
