import { decideShareNavigation, shouldAnnounceDropped } from '../shareIntakeGate';

const base = {
  kind: 'text' as const, pendingNavigation: true, screenOpen: false, coldStartGateReady: true, firstRunSeen: true, canEdit: true,
};
const files = { ...base, kind: 'files' as const };

describe('decideShareNavigation — shared files (Receipts / Promo leaflet chooser)', () => {
  it('files pending + ready + editor → choose', () => {
    expect(decideShareNavigation(files)).toBe('choose');
  });
  it('files pending + ready + viewer → choose (a viewer may read leaflets)', () => {
    expect(decideShareNavigation({ ...files, canEdit: false })).toBe('choose');
  });
  it('not ready → wait (cold-start gate)', () => {
    expect(decideShareNavigation({ ...files, coldStartGateReady: false })).toBe('wait');
  });
  it('not ready → wait (first-run onboarding)', () => {
    expect(decideShareNavigation({ ...files, firstRunSeen: false })).toBe('wait');
  });
  it('screenOpen → idle (the receipt screen appends new shares itself)', () => {
    expect(decideShareNavigation({ ...files, screenOpen: true })).toBe('idle');
  });
  it('nothing pending → idle', () => {
    expect(decideShareNavigation({ ...files, pendingNavigation: false })).toBe('idle');
  });
});

describe('decideShareNavigation — shared text', () => {
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
