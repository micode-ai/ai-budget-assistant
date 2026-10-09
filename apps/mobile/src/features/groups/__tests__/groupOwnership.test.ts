import type { GroupActivityItem, GroupMemberEventView } from '@budget/shared-types';
import { canAdoptGroup, canMakeOwner, describeGroupEvent, ownerErrorReason } from '../groupOwnership';
import { groupActivityByDay } from '../groupActivityTable';
import en from '../../../i18n/locales/en';

const ev = (over: Partial<GroupMemberEventView> = {}): GroupMemberEventView => ({
  id: 'ev1',
  kind: 'owner_transferred',
  actorMemberId: 'm-ann',
  subjectMemberId: 'm-ann',
  subjectName: 'Ann',
  targetMemberId: 'm-bo',
  targetName: 'Bo',
  actorName: 'Ann',
  createdAt: '2026-10-09T10:00:00.000Z',
  ...over,
});

describe('describeGroupEvent (ABA-650)', () => {
  it('tells the four owner_transferred cases apart by their fields', () => {
    expect(describeGroupEvent(ev())).toEqual({ key: 'groups.event_ownerTransferred', params: { from: 'Ann', to: 'Bo' } });
    expect(describeGroupEvent(ev({ actorMemberId: null, actorName: null }))).toEqual({
      key: 'groups.event_ownerSucceeded',
      params: { from: 'Ann', to: 'Bo' },
    });
    expect(describeGroupEvent(ev({ actorMemberId: null, targetMemberId: null, targetName: null }))).toEqual({
      key: 'groups.event_ownerOrphaned',
      params: { from: 'Ann' },
    });
    expect(
      describeGroupEvent(ev({ actorMemberId: 'm-cy', subjectMemberId: 'm-cy', targetMemberId: 'm-cy', subjectName: 'Cy', targetName: 'Cy' })),
    ).toEqual({ key: 'groups.event_ownerAdopted', params: { to: 'Cy' } });
  });

  it('falls back to the snapshot name when the adopter has no current name', () => {
    expect(
      describeGroupEvent(ev({ subjectMemberId: 'm-cy', targetMemberId: 'm-cy', subjectName: 'Cy', targetName: null })).params,
    ).toEqual({ to: 'Cy' });
  });

  it('covers the merge and claim-reset kinds', () => {
    expect(describeGroupEvent(ev({ kind: 'member_merged' })).key).toBe('groups.event_memberMerged');
    expect(describeGroupEvent(ev({ kind: 'claim_reset' }))).toEqual({
      key: 'groups.event_claimReset',
      params: { from: 'Ann', actor: 'Ann' },
    });
  });

  it('every key it can return exists in the English source', () => {
    const groups = (en as unknown as { groups: Record<string, string> }).groups;
    for (const key of [
      'event_ownerTransferred',
      'event_ownerSucceeded',
      'event_ownerOrphaned',
      'event_ownerAdopted',
      'event_memberMerged',
      'event_claimReset',
    ]) {
      expect(typeof groups[key]).toBe('string');
    }
  });
});

describe('canMakeOwner / canAdoptGroup (ABA-650)', () => {
  const detail = { status: 'active' as const, isOwner: true, myMemberId: 'm-me' };
  const appUser = { id: 'm-bo', isAppUser: true, removedAt: null };

  it('offers Make owner to the owner of an active group, for another live app user only', () => {
    expect(canMakeOwner(detail, appUser)).toBe(true);
    expect(canMakeOwner(detail, { ...appUser, isAppUser: false })).toBe(false);
    expect(canMakeOwner(detail, { ...appUser, id: 'm-me' })).toBe(false);
    expect(canMakeOwner(detail, { ...appUser, removedAt: '2026-10-01T00:00:00.000Z' })).toBe(false);
    expect(canMakeOwner({ ...detail, isOwner: false }, appUser)).toBe(false);
    expect(canMakeOwner({ ...detail, status: 'archived' }, appUser)).toBe(false);
  });

  it('offers adoption only on an orphaned, active group where the server says the caller is eligible', () => {
    expect(canAdoptGroup({ status: 'active', isOrphaned: true, canAdopt: true })).toBe(true);
    expect(canAdoptGroup({ status: 'active', isOrphaned: true, canAdopt: false })).toBe(false);
    expect(canAdoptGroup({ status: 'active', isOrphaned: false, canAdopt: true })).toBe(false);
    expect(canAdoptGroup({ status: 'archived', isOrphaned: true, canAdopt: true })).toBe(false);
    expect(canAdoptGroup(null)).toBe(false);
  });
});

describe('ownerErrorReason (ABA-650)', () => {
  it('maps the server codes', () => {
    expect(ownerErrorReason({ status: 409, code: 'OWNER_LIMIT' })).toBe('limit');
    expect(ownerErrorReason({ status: 409, code: 'OWNER_CHANGED' })).toBe('changed');
    expect(ownerErrorReason({ status: 409, code: 'GROUP_HAS_OWNER' })).toBe('hasOwner');
    expect(ownerErrorReason({ status: 400, code: 'OWNER_TARGET_INVALID' })).toBe('invalidTarget');
    expect(ownerErrorReason({ status: 500 })).toBeNull();
    expect(ownerErrorReason(undefined)).toBeNull();
  });
});

describe('membership events in the desktop activity table (ABA-650)', () => {
  const eventItem: GroupActivityItem = { kind: 'event', at: '2026-10-09T10:00:00.000Z', event: ev() };
  const expenseItem: GroupActivityItem = {
    kind: 'expense',
    at: '2026-10-09T09:00:00.000Z',
    expense: {
      id: 'x1',
      groupId: 'g',
      description: 'Pizza',
      amount: 40,
      date: '2026-10-09',
      paidByMemberId: 'm-ann',
      splitType: 'equal',
      createdByMemberId: 'm-ann',
      shares: [{ memberId: 'm-ann', shareValue: null, shareAmount: 40 }],
      originalAmount: null,
      originalCurrency: null,
      fxRate: null,
      fxRateSource: null,
      fxRateAt: null,
      itemized: false,
      discountAmount: null,
      claimsOpenUntil: null,
      deletedAt: null,
      deletedByMemberId: null,
      createdAt: '2026-10-09T09:00:00.000Z',
      updatedAt: '2026-10-09T09:00:00.000Z',
    },
  };

  it('renders the event row, adds nothing to the subtotal and keeps it out of the keyboard order', () => {
    const { days, order } = groupActivityByDay([eventItem, expenseItem], 'm-ann');
    const rows = days.flatMap((d) => d.rows);
    expect(rows.map((r) => r.id)).toEqual(expect.arrayContaining(['v-ev1', 'e-x1']));
    expect(rows.find((r) => r.id === 'v-ev1')!.myShare).toBeNull();
    expect(days.reduce((s, d) => s + d.subtotal, 0)).toBe(40);
    expect(order).toEqual(['e-x1']);
  });
});
