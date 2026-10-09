import { groupPushRoute } from '../groupPush';

describe('groupPushRoute', () => {
  it('opens the group for an activity push', () => {
    expect(groupPushRoute('group_activity', { groupId: 'g1' })).toBe('/groups/g1');
  });

  it('falls back to the list without a group id', () => {
    expect(groupPushRoute('group_activity', {})).toBe('/groups');
    expect(groupPushRoute('group_reminder', { groupId: '' })).toBe('/groups');
    expect(groupPushRoute('group_reminder', { groupId: 42 })).toBe('/groups');
  });

  it("opens a debtor's reminder on the settle screen with the suggested pair", () => {
    expect(
      groupPushRoute('group_reminder', { groupId: 'g1', reminder: 'owe', fromMemberId: 'm-ann', toMemberId: 'm-bo' }),
    ).toEqual({ pathname: '/groups/g1/settle', params: { from: 'm-ann', to: 'm-bo' } });
  });

  it("opens a creditor's reminder on Record a payment (no pair)", () => {
    expect(groupPushRoute('group_reminder', { groupId: 'g1', reminder: 'owed' })).toBe('/groups/g1/settle');
  });

  it('ignores half a pair', () => {
    expect(groupPushRoute('group_reminder', { groupId: 'g1', fromMemberId: 'm-ann' })).toBe('/groups/g1/settle');
  });
});
