import type { GroupDetail, GroupMember } from '@budget/shared-types';
import {
  canMergeMember,
  linkMergeOffer,
  mergeCandidates,
  mergedBalancePreview,
  mergeErrorReason,
  mergePair,
  mergePartners,
} from '../groupMerge';
import en from '../../../i18n/locales/en';
import pl from '../../../i18n/locales/pl';
import de from '../../../i18n/locales/de';
import es from '../../../i18n/locales/es';
import fr from '../../../i18n/locales/fr';
import nl from '../../../i18n/locales/nl';
import ru from '../../../i18n/locales/ru';
import ua from '../../../i18n/locales/ua';
import be from '../../../i18n/locales/be';

const member = (id: string, over: Partial<GroupMember> = {}): GroupMember => ({
  id,
  groupId: 'g',
  displayName: id,
  isAppUser: false,
  isClaimed: false,
  paymentMethod: null,
  paymentHandle: null,
  removedAt: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  ...over,
});

const OWNER = member('owner', { isAppUser: true });
const APP = member('app', { isAppUser: true });
const ANN = member('ann', { isClaimed: true });
const PH = member('ph');

const detail = (over: Partial<GroupDetail> = {}) =>
  ({
    status: 'active',
    isOwner: true,
    myMemberId: OWNER.id,
    members: [OWNER, APP, ANN, PH],
    balances: [
      { memberId: OWNER.id, netAmount: 12.5 },
      { memberId: ANN.id, netAmount: -20 },
      { memberId: PH.id, netAmount: 7.49 },
    ],
    ...over,
  }) as GroupDetail;

describe('mergePair (ABA-657, mirrors the server consent rule)', () => {
  it('keeps the app-user row and refuses two app users', () => {
    expect(mergePair(detail(), OWNER, ANN)).toEqual({ from: ANN, into: OWNER });
    expect(mergePair(detail(), ANN, OWNER)).toEqual({ from: ANN, into: OWNER });
    expect(mergePair(detail(), OWNER, APP)).toBeNull();
  });

  it('the owner may merge two guests, but never onto another app user', () => {
    expect(mergePair(detail(), ANN, PH)).toEqual({ from: ANN, into: PH });
    expect(mergePair(detail(), ANN, APP)).toBeNull();
  });

  it('a non-owner may only absorb an UNCLAIMED guest into their own row', () => {
    const d = detail({ isOwner: false, myMemberId: APP.id });
    expect(mergePair(d, PH, APP)).toEqual({ from: PH, into: APP });
    expect(mergePair(d, APP, PH)).toEqual({ from: PH, into: APP });
    expect(mergePair(d, ANN, APP)).toBeNull();
    expect(mergePair(d, PH, ANN)).toBeNull();
  });

  it('offers nothing on an archived group, for the same member, or for a removed one', () => {
    expect(mergePair(detail({ status: 'archived' }), ANN, PH)).toBeNull();
    expect(mergePair(detail(), ANN, ANN)).toBeNull();
    expect(mergePair(detail(), ANN, member('gone', { removedAt: '2026-10-02T00:00:00.000Z' }))).toBeNull();
  });
});

describe('mergeCandidates / mergePartners', () => {
  it('lists who a member can go with, in list order, and the partner the picker shows', () => {
    expect(mergeCandidates(detail(), ANN).map((p) => [p.from.id, p.into.id])).toEqual([
      ['ann', 'owner'],
      ['ann', 'ph'],
    ]);
    expect(mergePartners(detail(), ANN).map((m) => m.id)).toEqual(['owner', 'ph']);
    expect(mergePartners(detail(), OWNER).map((m) => m.id)).toEqual(['ann', 'ph']);
    // Another app user: every pair would push a balance onto them, which only they can consent to.
    expect(canMergeMember(detail(), APP)).toBe(false);
  });

  it('a non-owner viewing someone else sees nothing to merge', () => {
    const d = detail({ isOwner: false, myMemberId: APP.id });
    expect(canMergeMember(d, ANN)).toBe(false);
    expect(mergePartners(d, PH).map((m) => m.id)).toEqual(['app']);
    expect(mergePartners(d, APP).map((m) => m.id)).toEqual(['ph']);
  });
});

describe('mergedBalancePreview', () => {
  it('is the sum of the two balances, rounded to the cent', () => {
    expect(mergedBalancePreview(detail(), { from: ANN, into: PH })).toBe(-12.51);
    expect(mergedBalancePreview(detail(), { from: APP, into: OWNER })).toBe(12.5);
  });
});

describe('mergeErrorReason', () => {
  const err = (status: number, code?: string) => Object.assign(new Error('x'), { status, code });
  it('maps the server refusals', () => {
    expect(mergeErrorReason(err(403, 'MERGE_NOT_ALLOWED'))).toBe('notAllowed');
    expect(mergeErrorReason(err(409, 'BOTH_APP_USERS'))).toBe('bothAppUsers');
    expect(mergeErrorReason(err(409, 'MERGE_CHANGED'))).toBe('changed');
    expect(mergeErrorReason(err(404))).toBe('gone');
    expect(mergeErrorReason(err(500, 'MERGE_INVARIANT'))).toBeNull();
    expect(mergeErrorReason(null)).toBeNull();
  });
});

describe('owner consent mirror (ABA-657 review M2)', () => {
  it('the owner may not merge a guest into a guest row another person has claimed', () => {
    const claimed = member('claimed', { isClaimed: true });
    expect(mergePair(detail({ members: [OWNER, ANN, claimed] }), ANN, claimed)).toBeNull();
    expect(mergePair(detail({ members: [OWNER, ANN, PH] }), ANN, PH)).toEqual({ from: ANN, into: PH });
    expect(mergePair(detail({ members: [OWNER, ANN] }), ANN, OWNER)).toEqual({ from: ANN, into: OWNER });
  });
});

describe('linkMergeOffer', () => {
  const err = (status: number, code: string, details?: unknown) => Object.assign(new Error('x'), { status, code, details });
  it('reads the offer from a 409 ALREADY_MEMBER that allows it', () => {
    expect(linkMergeOffer(err(409, 'ALREADY_MEMBER', { canMerge: true, guestName: 'Ania', myName: 'Ania K' }))).toEqual({
      guestName: 'Ania',
      myName: 'Ania K',
    });
  });

  it('carries the guest row balance (numbers only) when the server sends it', () => {
    expect(
      linkMergeOffer(err(409, 'ALREADY_MEMBER', { canMerge: true, guestName: 'Ania', myName: 'Ania K', guestBalance: -20, currencyCode: 'PLN' })),
    ).toEqual({ guestName: 'Ania', myName: 'Ania K', guestBalance: -20, currencyCode: 'PLN' });
    // A non-numeric balance is dropped, the offer itself survives.
    expect(linkMergeOffer(err(409, 'ALREADY_MEMBER', { canMerge: true, guestName: 'A', myName: 'B', guestBalance: '5', currencyCode: 'PLN' }))).toEqual({
      guestName: 'A',
      myName: 'B',
    });
  });

  it('offers nothing otherwise', () => {
    expect(linkMergeOffer(err(409, 'ALREADY_MEMBER', { canMerge: false, guestName: 'A', myName: 'B' }))).toBeNull();
    expect(linkMergeOffer(err(409, 'ALREADY_MEMBER'))).toBeNull();
    expect(linkMergeOffer(err(410, 'LINK_CODE_INVALID', { canMerge: true, guestName: 'A', myName: 'B' }))).toBeNull();
    expect(linkMergeOffer(null)).toBeNull();
  });
});

describe('merge copy in all 9 locales', () => {
  const keys = [
    'mergeWith',
    'mergePickTitle',
    'mergePickHint',
    'mergeConfirmTitle',
    'mergeConfirmBody',
    'mergeIrreversible',
    'mergeConfirmAction',
    'mergeDone',
    'mergeNotAllowed',
    'mergeBothAppUsers',
    'mergeChanged',
    'linkMergeTitle',
    'linkMergeBody',
    'linkMergeBalance',
    'linkMergeAction',
    'linkMergeNotNow',
    'linkMergeFailed',
  ];
  it.each(Object.entries({ en, pl, de, es, fr, nl, ru, ua, be }))('%s has every key with the same placeholders', (_lang, loc) => {
    const groups = (loc as { groups: Record<string, string> }).groups;
    const ph = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort();
    for (const k of keys) {
      expect(typeof groups[k]).toBe('string');
      expect(ph(groups[k])).toEqual(ph((en as { groups: Record<string, string> }).groups[k]));
    }
  });
});
