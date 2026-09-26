import { decideShareNavigation, shouldAnnounceDropped } from '../shareIntakeGate';

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

describe('shouldAnnounceDropped', () => {
  const ready = { lastDropped: 1, pendingNavigation: false, screenOpen: false, coldStartGateReady: true };
  it('announces a share whose every file was dropped, once the app is ready', () => {
    expect(shouldAnnounceDropped(ready)).toBe(true);
  });
  it('stays quiet when nothing was dropped', () => {
    expect(shouldAnnounceDropped({ ...ready, lastDropped: 0 })).toBe(false);
  });
  it('leaves it to the receipt screen when a queue is about to open or is open', () => {
    expect(shouldAnnounceDropped({ ...ready, pendingNavigation: true })).toBe(false);
    expect(shouldAnnounceDropped({ ...ready, screenOpen: true })).toBe(false);
  });
  it('waits for the cold-start gate', () => {
    expect(shouldAnnounceDropped({ ...ready, coldStartGateReady: false })).toBe(false);
  });
});
