import type { GroupJoinPreview, GroupSummary } from '@budget/shared-types';
import {
  buildJoinDto,
  canSubmitJoin,
  effectiveSelection,
  findGroupIdForPreview,
  joinViewKind,
  JOIN_NEW_NAME,
} from '../groupJoin';

const base: GroupJoinPreview = {
  groupName: 'Trip',
  emoji: '🏖',
  currencyCode: 'EUR',
  status: 'active',
  alreadyMember: false,
  unclaimed: [{ id: 'm1', displayName: 'Ola' }],
};

describe('joinViewKind', () => {
  it('keeps non-ready states distinct', () => {
    expect(joinViewKind({ status: 'error' })).toBe('error');
    expect(joinViewKind({ status: 'notFound' })).toBe('notFound');
    expect(joinViewKind({ status: 'loading' })).toBe('loading');
  });
  it('archived beats alreadyMember', () => {
    expect(joinViewKind({ status: 'ready', preview: { ...base, status: 'archived', alreadyMember: true } })).toBe('archived');
    expect(joinViewKind({ status: 'ready', preview: { ...base, alreadyMember: true, myMemberId: 'x' } })).toBe('alreadyMember');
    expect(joinViewKind({ status: 'ready', preview: base })).toBe('choose');
  });
});

describe('selection and dto', () => {
  it('needs a pick when names are free', () => {
    expect(canSubmitJoin(null, 'Me', base)).toBe(false);
    expect(buildJoinDto('t', 'm1', '', base)).toEqual({ guestToken: 't', memberId: 'm1' });
  });
  it('new name requires text and is trimmed', () => {
    expect(canSubmitJoin(JOIN_NEW_NAME, '  ', base)).toBe(false);
    expect(buildJoinDto('t', JOIN_NEW_NAME, ' Kim ', base)).toEqual({ guestToken: 't', displayName: 'Kim' });
  });
  it('no free names selects new implicitly; a stale id is dropped', () => {
    const none = { ...base, unclaimed: [] };
    expect(effectiveSelection(null, none)).toBe(JOIN_NEW_NAME);
    expect(effectiveSelection('gone', base)).toBeNull();
    expect(buildJoinDto('t', 'gone', 'x', base)).toBeNull();
  });
});

describe('findGroupIdForPreview — server-provided id', () => {
  it('uses the preview groupId without looking at the list', () => {
    expect(findGroupIdForPreview([], { ...base, alreadyMember: true, myMemberId: 'x', groupId: 'g-9' })).toBe('g-9');
  });
});

describe('findGroupIdForPreview', () => {
  const g = (id: string, name = 'Trip'): GroupSummary => ({
    id, name, emoji: '🏖', currencyCode: 'EUR', status: 'active', memberCount: 2, myBalance: 0,
  });
  it('returns only an unambiguous match', () => {
    expect(findGroupIdForPreview([g('a'), g('b', 'Other')], base)).toBe('a');
    expect(findGroupIdForPreview([g('a'), g('b')], base)).toBeNull();
    expect(findGroupIdForPreview([], base)).toBeNull();
  });
});
