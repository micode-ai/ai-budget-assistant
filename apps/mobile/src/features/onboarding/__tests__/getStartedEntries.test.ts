import { resolveGetStartedEntries } from '../getStartedEntries';
import { ROUTE_IMPORT } from '@/features/dashboard/dashboardDialogs';

const ids = (r: ReturnType<typeof resolveGetStartedEntries>) => [r.primary.id, ...r.secondary.map((e) => e.id)];

describe('resolveGetStartedEntries', () => {
  it('leads the phone with a receipt scan, then typing, with import and voice after', () => {
    expect(ids(resolveGetStartedEntries('scan', true))).toEqual(['scan', 'manual', 'import', 'voice', 'autoCapture']);
  });

  it('keeps desktop web leading with the statement import', () => {
    const r = resolveGetStartedEntries('import', false);
    expect(r.primary).toEqual({ id: 'import', route: ROUTE_IMPORT });
    expect(ids(r)).toEqual(['import', 'scan', 'manual', 'voice']);
  });

  it('offers bank-notification capture only on Android', () => {
    expect(ids(resolveGetStartedEntries('scan', false))).not.toContain('autoCapture');
  });

  it('still offers every entry, so a demoted one is never lost', () => {
    const routes = [resolveGetStartedEntries('scan', true).primary, ...resolveGetStartedEntries('scan', true).secondary].map(
      (e) => e.route,
    );
    expect(routes).toEqual(
      expect.arrayContaining([ROUTE_IMPORT, '/expense/receipt', '/expense/new', '/expense/voice', '/settings/auto-capture']),
    );
  });
});
