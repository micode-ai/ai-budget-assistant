import type { GroupBudgetLinksView, GroupCashLegView, GroupCashSuggestionView } from '@budget/shared-types';
import {
  addedByOtherName,
  buildManualLinkDto,
  canMoveExpenseRow,
  doubleCountLegs,
  groupTransactionMark,
  isMirrorOwnedRow,
  legKey,
  legSide,
  manualLinkCandidates,
  manualLinkWindow,
  mirrorAccountCandidates,
  mirrorErrorReason,
  pausedReasonKey,
  resolveShareRowGroup,
  showBudgetLinksCard,
  splitByEncryption,
  stripMirrorOwnedFields,
} from '../groupBudgetMirror';
import en from '../../../i18n/locales/en';

const leg = (over: Partial<GroupCashLegView> = {}): GroupCashLegView => ({
  kind: 'payer_expense',
  groupExpenseId: 'ge1',
  settlementId: null,
  label: 'Pizza',
  amount: 120,
  currencyCode: 'PLN',
  date: '2026-10-05',
  ...over,
});

const suggestion = (id: string, l: GroupCashLegView): GroupCashSuggestionView => ({
  id,
  leg: l,
  personal: {
    expenseId: `e-${id}`,
    incomeId: null,
    amount: l.amount,
    currencyCode: l.currencyCode,
    date: l.date,
    description: null,
    merchant: null,
    source: 'notification',
  },
});

const mirrorOn = { status: 'active', pausedReason: null, accountId: 'a1', categoryId: null, from: '2026-10-01', shareRowCount: 2 } as const;

describe('groupTransactionMark (ABA-661)', () => {
  it('marks a share row, a linked expense and a linked income', () => {
    expect(groupTransactionMark({ source: 'group' }, 'expense')).toBe('share');
    expect(groupTransactionMark({ source: 'notification', isSplitReceivable: true }, 'expense')).toBe('linked');
    expect(groupTransactionMark({ source: 'manual', isSplitReceivable: true }, 'income')).toBe('linked');
  });

  it('leaves a receipt-split receivable (isDebt + isSplitReceivable) and plain rows unmarked', () => {
    expect(groupTransactionMark({ source: 'ocr', isSplitReceivable: true, isDebt: true }, 'expense')).toBeNull();
    expect(groupTransactionMark({ source: 'manual' }, 'expense')).toBeNull();
    // Absent flags read as false.
    expect(groupTransactionMark({}, 'income')).toBeNull();
  });

  it('a share row and a linked payment cannot be moved; a receivable or plain row can', () => {
    expect(canMoveExpenseRow({ source: 'group' })).toBe(false);
    expect(canMoveExpenseRow({ source: 'manual', isSplitReceivable: true })).toBe(false);
    expect(canMoveExpenseRow({ source: 'manual', isSplitReceivable: true, isDebt: true })).toBe(true);
    expect(canMoveExpenseRow({ source: 'manual' })).toBe(true);
  });
});

describe('stripMirrorOwnedFields', () => {
  it('drops amount, currency and date from a share-row edit only', () => {
    const patch = { amount: 5, currencyCode: 'EUR', date: new Date(), categoryId: 'c1', description: 'x' };
    expect(stripMirrorOwnedFields(patch, true)).toEqual({ categoryId: 'c1', description: 'x' });
    expect(stripMirrorOwnedFields(patch, false)).toBe(patch);
    expect(isMirrorOwnedRow({ source: 'group' })).toBe(true);
    expect(isMirrorOwnedRow({ source: 'ocr' })).toBe(false);
  });
});

describe('resolveShareRowGroup', () => {
  const groups = [
    { id: 'g1', name: 'Flat' },
    { id: 'g2', name: 'Flat: Kraków' },
    { id: 'g3', name: 'Trip' },
    { id: 'g4', name: 'Trip' },
  ];

  it('takes the longest group name that prefixes the description', () => {
    expect(resolveShareRowGroup('Flat: Kraków: rent', groups)).toEqual({ groupId: 'g2', name: 'Flat: Kraków' });
    expect(resolveShareRowGroup('Flat: groceries', groups)).toEqual({ groupId: 'g1', name: 'Flat' });
  });

  it('gives no id for two groups with the same name, or a rewritten description', () => {
    expect(resolveShareRowGroup('Trip: fuel', groups)).toEqual({ groupId: null, name: 'Trip' });
    expect(resolveShareRowGroup('my own words', groups)).toEqual({ groupId: null, name: null });
    expect(resolveShareRowGroup(null, groups)).toEqual({ groupId: null, name: null });
  });
});

describe('mirror account candidates', () => {
  const acc = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    name: id,
    type: 'personal' as const,
    myRole: 'owner' as const,
    isActive: true,
    ...over,
  });

  it('keeps my owned accounts and an editor single-member personal one, active and not archived', () => {
    const list = [
      acc('own'),
      acc('ed', { myRole: 'editor' }),
      acc('ed-shared', { myRole: 'editor' }),
      acc('ed-family', { myRole: 'editor', type: 'shared' }),
      acc('view', { myRole: 'viewer' }),
      acc('off', { isActive: false }),
      acc('trip-old', { type: 'trip', tripStatus: 'archived' }),
      acc('trip-now', { type: 'trip', tripStatus: 'active' }),
    ];
    expect(
      mirrorAccountCandidates(list as never[], { ed: 1, 'ed-shared': 2 }).map((a: { id: string }) => a.id),
    ).toEqual(['own', 'ed', 'trip-now']);
    // Unknown member count: offered, the server decides.
    expect(mirrorAccountCandidates([acc('x', { myRole: 'editor' })] as never[]).length).toBe(1);
  });

  it('names the member who added an entry', () => {
    expect(addedByOtherName({ addedByOther: true, addedByName: ' Ann ' })).toBe('Ann');
    expect(addedByOtherName({ addedByOther: true, addedByName: null })).toBeNull();
    expect(addedByOtherName({ addedByOther: false, addedByName: 'Ann' })).toBeUndefined();
    expect(addedByOtherName(undefined)).toBeUndefined();
  });

  it('does not offer an end-to-end encrypted account (tier 1 included); an unknown tier is offered', () => {
    const { offered, encrypted } = splitByEncryption([acc('a'), acc('b'), acc('c'), acc('d')], {
      a: 0,
      b: 1,
      c: 2,
    });
    expect(offered.map((a) => a.id)).toEqual(['a', 'd']);
    expect(encrypted.map((a) => a.id)).toEqual(['b', 'c']);
  });
});

describe('errors and pause copy', () => {
  it('maps every server code, and anything else to null', () => {
    expect(mirrorErrorReason({ status: 403, code: 'MIRROR_ACCOUNT_ENCRYPTED' })).toBe('encrypted');
    expect(mirrorErrorReason({ status: 409, code: 'LEG_ALREADY_LINKED' })).toBe('legAlreadyLinked');
    expect(mirrorErrorReason({ status: 404, code: 'LINK_NOT_FOUND' })).toBe('gone');
    expect(mirrorErrorReason({ status: 500 })).toBeNull();
    expect(mirrorErrorReason(null)).toBeNull();
  });

  it('every reason and pause key exists in en', () => {
    const gb = (en as unknown as { groupBudget: Record<string, string> }).groupBudget;
    for (const code of [
      'ACCOUNT_NOT_FOUND', 'MIRROR_ACCOUNT_READ_ONLY', 'MIRROR_ACCOUNT_ENCRYPTED', 'MIRROR_ACCOUNT_ARCHIVED',
      'MIRROR_ACCOUNT_SHARED_NEEDS_OWNER', 'CATEGORY_NOT_FOUND', 'MIRROR_OFF', 'LEG_ALREADY_LINKED', 'ROW_NOT_LINKABLE', 'LEG_NOT_FOUND',
      'ROW_NOT_FOUND', 'SUGGESTION_NOT_FOUND', 'LINK_INVALID',
    ]) {
      const reason = mirrorErrorReason({ code });
      expect(gb[`error_${reason}`]).toBeTruthy();
    }
    for (const r of ['viewer', 'encrypted', 'archived', 'account_unavailable', null] as const) {
      expect(gb[pausedReasonKey(r).replace('groupBudget.', '')]).toBeTruthy();
    }
  });
});

describe('doubleCountLegs', () => {
  it('groups suggestions under their unlinked leg, newest leg first, nothing dropped', () => {
    const a = leg({ groupExpenseId: 'ge1', date: '2026-10-02' });
    const b = leg({ kind: 'settlement_in', groupExpenseId: null, settlementId: 's1', date: '2026-10-07' });
    const orphan = leg({ groupExpenseId: 'ge9', date: '2026-10-04' });
    const view: Pick<GroupBudgetLinksView, 'unlinked' | 'suggestions'> = {
      unlinked: [a, b, a],
      suggestions: [suggestion('x', a), suggestion('y', a), suggestion('z', orphan)],
    };
    const out = doubleCountLegs(view);
    expect(out.map((e) => e.key)).toEqual(['settlement_in:s1', 'payer_expense:ge9', 'payer_expense:ge1']);
    expect(out[2].suggestions.map((s) => s.id)).toEqual(['x', 'y']);
    expect(out[0].suggestions).toEqual([]);
    expect(doubleCountLegs(null)).toEqual([]);
  });

  it('shows the card while the mirror is on or paused, not when off', () => {
    expect(showBudgetLinksCard({ mirror: mirrorOn })).toBe(true);
    expect(showBudgetLinksCard({ mirror: { ...mirrorOn, status: 'paused' } })).toBe(true);
    expect(showBudgetLinksCard({ mirror: { ...mirrorOn, status: 'off' } })).toBe(false);
    expect(showBudgetLinksCard(null)).toBe(false);
  });

  it('keys and sides', () => {
    expect(legKey(leg())).toBe('payer_expense:ge1');
    expect(legSide('settlement_in')).toBe('income');
    expect(legSide('settlement_out')).toBe('expense');
    expect(legSide('payer_expense')).toBe('expense');
  });
});

describe('manual link', () => {
  const row = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    userId: 'me',
    accountId: 'a1',
    amount: 120,
    currencyCode: 'PLN',
    date: '2026-10-05',
    source: 'manual',
    ...over,
  });

  it('offers only my linkable rows in the account, inside the window, closest first', () => {
    const rows = [
      row('far-amount', { amount: 50 }),
      row('exact'),
      row('other-currency', { currencyCode: 'EUR' }),
      row('later', { date: '2026-10-09' }),
      row('debt', { isDebt: true }),
      row('repay', { isDebtRepayment: true }),
      row('planned', { isPlanned: true }),
      row('flagged', { isSplitReceivable: true }),
      row('share', { source: 'group' }),
      row('deleted', { isDeleted: true }),
      row('not-mine', { userId: 'ann' }),
      row('other-account', { accountId: 'a2' }),
      row('out-of-window', { date: '2026-12-01' }),
    ];
    const out = manualLinkCandidates(leg(), rows, { userId: 'me', accountId: 'a1' });
    expect(out.map((r) => r.id)).toEqual(['exact', 'later', 'far-amount', 'other-currency']);
  });

  it('the fetch window is 30 days either side', () => {
    expect(manualLinkWindow('2026-10-05')).toEqual({ startDate: '2026-09-05', endDate: '2026-11-04' });
  });

  it('builds the body for each kind', () => {
    expect(buildManualLinkDto(leg(), 'e1')).toEqual({ kind: 'payer_expense', groupExpenseId: 'ge1', expenseId: 'e1' });
    expect(
      buildManualLinkDto(leg({ kind: 'settlement_out', groupExpenseId: null, settlementId: 's1' }), 'e2'),
    ).toEqual({ kind: 'settlement_out', settlementId: 's1', expenseId: 'e2' });
    expect(
      buildManualLinkDto(leg({ kind: 'settlement_in', groupExpenseId: null, settlementId: 's2' }), 'i1'),
    ).toEqual({ kind: 'settlement_in', settlementId: 's2', incomeId: 'i1' });
  });
});
