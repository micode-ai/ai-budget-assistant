import { alertsBadgeCount, buildAlertsPanelItems } from '../alertsPanelItems';
import { selectUnreadAlerts } from '../alertPresentation';
import type { AnomalyAlert } from '@budget/shared-types';
import type { MyInvitation } from '@/services/accounts.api';

function alert(over: Partial<AnomalyAlert> = {}): AnomalyAlert {
  return {
    id: 'a1',
    accountId: 'acc1',
    type: 'duplicate_charge',
    params: {},
    expenseId: 'e1',
    readAt: null,
    dismissedAt: null,
    createdAt: '2026-09-06T10:00:00Z',
    ...over,
  } as AnomalyAlert;
}

function invitation(over: Partial<MyInvitation> = {}): MyInvitation {
  return {
    id: 'i1',
    accountName: 'Family',
    inviterName: 'Kolya',
    role: 'editor',
    ...over,
  } as MyInvitation;
}

/**
 * The production changes these catch, named before writing:
 *  - dropping the `!readAt` filter, which fills the inbox with things the user
 *    has already seen (`alertStore.alerts` is `GET /alerts` verbatim);
 *  - dropping `!dismissedAt`, which resurrects a dismissed alert on the next
 *    load — criterion 53 says it must stay gone;
 *  - putting alerts above invitations, which makes this panel and the
 *    dashboard's attention panel disagree about what is most urgent
 *    (criterion 51);
 *  - losing the newest-first sort;
 *  - `.sort()` mutating live store state;
 *  - the badge reverting to `unreadCount` alone, which is the defect this pass
 *    fixes: an invitation behind an unlit bell (criterion 54).
 */
describe('buildAlertsPanelItems', () => {
  it('puts invitations above alerts', () => {
    const items = buildAlertsPanelItems({
      invitations: [invitation({ id: 'i1' })],
      alerts: [alert({ id: 'a1' })],
    });
    expect(items.map((i) => i.kind)).toEqual(['invitation', 'alert']);
  });

  it('hides alerts the user has already read', () => {
    const items = buildAlertsPanelItems({
      invitations: [],
      alerts: [alert({ id: 'read', readAt: '2026-09-06T11:00:00Z' }), alert({ id: 'fresh' })],
    });
    expect(items.map((i) => i.key)).toEqual(['alert:fresh']);
  });

  it('hides dismissed alerts, so a dismissal survives a reload', () => {
    const items = buildAlertsPanelItems({
      invitations: [],
      alerts: [alert({ id: 'gone', dismissedAt: '2026-09-06T11:00:00Z' })],
    });
    expect(items).toEqual([]);
  });

  it('orders alerts newest first regardless of the order they arrive in', () => {
    const items = buildAlertsPanelItems({
      invitations: [],
      alerts: [
        alert({ id: 'old', createdAt: '2026-09-01T10:00:00Z' }),
        alert({ id: 'new', createdAt: '2026-09-06T10:00:00Z' }),
      ],
    });
    expect(items.map((i) => i.key)).toEqual(['alert:new', 'alert:old']);
  });

  it('preserves the order invitations arrive in', () => {
    // The store holds them newest-first from the server; re-sorting them here
    // would be a second, competing opinion about invitation order.
    const items = buildAlertsPanelItems({
      invitations: [invitation({ id: 'i1' }), invitation({ id: 'i2' })],
      alerts: [],
    });
    expect(items.map((i) => i.key)).toEqual(['invitation:i1', 'invitation:i2']);
  });

  it('is empty when nothing is pending, rather than throwing', () => {
    expect(buildAlertsPanelItems({ invitations: [], alerts: [] })).toEqual([]);
  });

  it('does not cap the list', () => {
    // Unlike the attention panel, which competes for dashboard space. An inbox
    // the badge summoned the user to must not withhold rows.
    const alerts = Array.from({ length: 12 }, (_, n) =>
      alert({ id: `a${n}`, createdAt: `2026-09-0${(n % 9) + 1}T10:00:00Z` }),
    );
    expect(buildAlertsPanelItems({ invitations: [], alerts })).toHaveLength(12);
  });

  it('gives every row a distinct key, across both kinds', () => {
    // An invitation and an alert could share a database id; a key collision
    // would silently drop one row from the rendered list.
    const items = buildAlertsPanelItems({
      invitations: [invitation({ id: 'same' })],
      alerts: [alert({ id: 'same' })],
    });
    expect(new Set(items.map((i) => i.key)).size).toBe(2);
  });
});

describe('selectUnreadAlerts', () => {
  it('never mutates the array it is given', () => {
    // It is handed live `alertStore.alerts`. `.sort()` mutates in place, so
    // without the defensive copy a narrowed filter would reorder the store
    // under every other screen reading it.
    const alerts = [
      alert({ id: 'old', createdAt: '2026-09-01T10:00:00Z' }),
      alert({ id: 'new', createdAt: '2026-09-06T10:00:00Z' }),
    ];
    const before = alerts.map((a) => a.id);
    selectUnreadAlerts(alerts);
    expect(alerts.map((a) => a.id)).toEqual(before);
  });
});

describe('alertsBadgeCount', () => {
  it('lights the badge for a pending invitation with no unread alerts', () => {
    expect(alertsBadgeCount({ unreadCount: 0, invitationCount: 1 })).toBe(1);
  });

  it('sums both, matching the phone header', () => {
    expect(alertsBadgeCount({ unreadCount: 3, invitationCount: 2 })).toBe(5);
  });

  it('is zero when nothing is pending', () => {
    expect(alertsBadgeCount({ unreadCount: 0, invitationCount: 0 })).toBe(0);
  });
});
