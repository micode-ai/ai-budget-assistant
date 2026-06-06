import {
  QUICK_ACTION_KEYS,
  DEFAULT_VISIBILITY,
  resolveVisibility,
  resolveOrder,
} from '../quickActionStore';

describe('quickActionStore default resolution', () => {
  it('defaults voice_income and scan_invoice to hidden, everything else visible', () => {
    const vis = resolveVisibility(() => undefined);
    expect(vis.voice_income).toBe(false);
    expect(vis.scan_invoice).toBe(false);
    expect(vis.add_expense).toBe(true);
    expect(vis.scan_receipt).toBe(true);
    expect(vis.voice_expense).toBe(true);
    expect(vis.exchange).toBe(true);
    expect(vis.converter).toBe(true);
    expect(vis.transfers).toBe(true);
  });

  it('DEFAULT_VISIBILITY covers every key', () => {
    for (const k of QUICK_ACTION_KEYS) {
      expect(typeof DEFAULT_VISIBILITY[k]).toBe('boolean');
    }
  });

  it('explicit stored value wins over the default', () => {
    const read = (k: string) => (k === 'voice_income' ? 'true' : undefined);
    expect(resolveVisibility(read).voice_income).toBe(true);
  });

  it('explicit "false" hides a default-on action', () => {
    const read = (k: string) => (k === 'add_expense' ? 'false' : undefined);
    expect(resolveVisibility(read).add_expense).toBe(false);
  });

  it('order defaults to QUICK_ACTION_KEYS when unset', () => {
    expect(resolveOrder(undefined)).toEqual([...QUICK_ACTION_KEYS]);
  });

  it('order drops unknown keys and appends missing ones', () => {
    const stored = JSON.stringify(['transfers', 'bogus', 'add_expense']);
    const out = resolveOrder(stored);
    expect(out[0]).toBe('transfers');
    expect(out[1]).toBe('add_expense');
    expect(out).not.toContain('bogus');
    expect([...out].sort()).toEqual([...QUICK_ACTION_KEYS].sort());
  });

  it('order falls back to default on malformed JSON', () => {
    expect(resolveOrder('{not json')).toEqual([...QUICK_ACTION_KEYS]);
  });

  it('explicit "false" on a default-off action stays false', () => {
    const read = (k: string) => (k === 'voice_income' ? 'false' : undefined);
    expect(resolveVisibility(read).voice_income).toBe(false);
  });
});
