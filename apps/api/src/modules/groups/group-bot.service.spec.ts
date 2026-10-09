import { createBotT, sharedMessages } from '../../common/bot-i18n/shared-messages';
import type { GroupBotPlatform, GroupBotReply } from './group-bot.service';
import { makeGroupBotWorld } from './__fixtures__/group-bot.fixture';

const t = createBotT(sharedMessages, { markup: 'html' });
const P: GroupBotPlatform = { keyPrefix: 'test:grp', t, escape: (s) => s.replace(/</g, '&lt;'), command: '/group' };
const ME = { userId: 'user-me', language: 'en' };
const OTHER = { userId: 'user-other', language: 'en' };

const asConfirm = (r: GroupBotReply) => {
  if (r.kind !== 'confirm') throw new Error(`expected a confirm card, got ${r.kind}: ${'text' in r ? r.text : ''}`);
  return r;
};
const asPicker = (r: GroupBotReply) => {
  if (r.kind !== 'picker') throw new Error(`expected a picker, got ${r.kind}`);
  return r;
};

describe('GroupBotService (ABA-658)', () => {
  it('answers the usage line when there is no amount', async () => {
    const w = makeGroupBotWorld();
    const r = await w.service.start(P, ME, 'pizza', 'req-00000001');
    expect(r).toEqual({ kind: 'text', text: t('groupUsage', 'en', { command: '/group' }) });
  });

  it('says so when the user has no active group (an archived one does not count)', async () => {
    const w = makeGroupBotWorld();
    w.addGroup({ name: 'Old', status: 'archived' }, [ME.userId, 'x']);
    const r = await w.service.start(P, ME, '120 pizza', 'req-00000001');
    expect(r).toEqual({ kind: 'text', text: t('groupNone', 'en') });
  });

  it('goes straight to the confirm card with one group, then writes through createExpense', async () => {
    const w = makeGroupBotWorld();
    const flat = w.addGroup({ name: 'Flat' }, [ME.userId, 'user-b', null, 'user-c']);
    const card = asConfirm(await w.service.start(P, ME, '120 pizza', 'req-00000001'));
    expect(card.text).toBe(
      t('groupConfirmCard', 'en', { group: 'Flat', amount: '120.00 PLN', description: 'pizza', count: '4' }),
    );

    const done = await w.service.confirm(P, ME, card.draftId);
    expect(done).toEqual({ kind: 'text', text: t('groupAdded', 'en', { group: 'Flat', amount: '120.00 PLN' }) });
    expect(w.expenses).toHaveLength(1);
    const me = w.members.find((m) => m.userId === ME.userId)!;
    const { dto, memberId, groupId } = w.expenses[0];
    expect(groupId).toBe(flat.id);
    expect(memberId).toBe(me.id);
    expect(dto).toMatchObject({
      clientRequestId: expect.stringMatching(/^bot:[a-f0-9]{40}$/),
      amount: 120,
      currencyCode: 'PLN',
      description: 'pizza',
      paidByMemberId: me.id,
      splitType: 'equal',
    });
    // Every live member, guests included, in an equal split.
    expect(dto.shares.map((s: { memberId: string }) => s.memberId).sort()).toEqual(
      w.members.filter((m) => m.groupId === flat.id).map((m) => m.id).sort(),
    );
    expect(dto.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Confirm clears the draft.
    expect(w.draftKeys()).toHaveLength(0);
  });

  it('uses the localized default description and escapes user content on the card', async () => {
    const w = makeGroupBotWorld();
    w.addGroup({ name: '<b>Flat</b>' }, [ME.userId, 'user-b']);
    const card = asConfirm(await w.service.start(P, { ...ME, language: 'pl' }, '10', 'req-00000001'));
    expect(card.text).toContain('&lt;b>Flat');
    expect(card.text).toContain(t('groupExpenseDefault', 'pl'));
  });

  it('offers a picker of at most 10 groups, most recently active first', async () => {
    const w = makeGroupBotWorld();
    for (let i = 1; i <= 12; i += 1) w.addGroup({ name: `G${i}` }, [ME.userId, 'user-b']);
    const picker = asPicker(await w.service.start(P, ME, '50 dinner', 'req-00000001'));
    expect(picker.options).toHaveLength(10);
    expect(picker.options[0].label).toBe('G12');
    expect(picker.options.map((o) => o.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

    const card = asConfirm(await w.service.pick(P, ME, picker.draftId, '1'));
    expect(card.text).toContain('G11');
    await w.service.confirm(P, ME, card.draftId);
    expect(w.expenses[0].groupId).toBe(w.groups.find((g) => g.name === 'G11')!.id);
  });

  it('refuses a picker index outside the draft and a draft id that belongs to someone else', async () => {
    const w = makeGroupBotWorld();
    w.addGroup({ name: 'A' }, [ME.userId, OTHER.userId]);
    w.addGroup({ name: 'B' }, [ME.userId, OTHER.userId]);
    const picker = asPicker(await w.service.start(P, ME, '50 dinner', 'req-00000001'));

    expect(await w.service.pick(P, ME, picker.draftId, '7')).toEqual({ kind: 'text', text: t('groupExpired', 'en') });
    // A group id smuggled in where the index goes is not an index.
    expect(await w.service.pick(P, ME, picker.draftId, w.groups[0].id)).toEqual({ kind: 'text', text: t('groupExpired', 'en') });
    // Another linked user replaying the callback (even a member of the same groups) gets nothing.
    expect(await w.service.pick(P, OTHER, picker.draftId, '0')).toEqual({ kind: 'text', text: t('groupExpired', 'en') });
    expect(await w.service.confirm(P, OTHER, picker.draftId)).toEqual({ kind: 'text', text: t('groupExpired', 'en') });
    expect(w.expenses).toHaveLength(0);
  });

  it('confirm without a chosen group, or on a malformed id, writes nothing', async () => {
    const w = makeGroupBotWorld();
    w.addGroup({ name: 'A' }, [ME.userId]);
    w.addGroup({ name: 'B' }, [ME.userId]);
    const picker = asPicker(await w.service.start(P, ME, '50', 'req-00000001'));
    expect(await w.service.confirm(P, ME, picker.draftId)).toEqual({ kind: 'text', text: t('groupExpired', 'en') });
    expect(await w.service.confirm(P, ME, '../../etc')).toEqual({ kind: 'text', text: t('groupExpired', 'en') });
    expect(w.expenses).toHaveLength(0);
  });

  it('re-resolves membership at confirm: archived in between', async () => {
    const w = makeGroupBotWorld();
    const g = w.addGroup({ name: 'Trip' }, [ME.userId, 'user-b']);
    const card = asConfirm(await w.service.start(P, ME, '30', 'req-00000001'));
    g.status = 'archived';
    expect(await w.service.confirm(P, ME, card.draftId)).toEqual({ kind: 'text', text: t('groupNotAvailable', 'en') });
    expect(w.expenses).toHaveLength(0);
    expect(w.draftKeys()).toHaveLength(0);
  });

  it('re-resolves membership at confirm: removed in between', async () => {
    const w = makeGroupBotWorld();
    w.addGroup({ name: 'Trip' }, [ME.userId, 'user-b']);
    const card = asConfirm(await w.service.start(P, ME, '30', 'req-00000001'));
    w.members.find((m) => m.userId === ME.userId)!.removedAt = new Date();
    expect(await w.service.confirm(P, ME, card.draftId)).toEqual({ kind: 'text', text: t('groupNotAvailable', 'en') });
    expect(w.expenses).toHaveLength(0);
  });

  it('re-resolves membership at the picker choice too', async () => {
    const w = makeGroupBotWorld();
    w.addGroup({ name: 'A' }, [ME.userId]);
    w.addGroup({ name: 'B' }, [ME.userId]);
    const picker = asPicker(await w.service.start(P, ME, '30', 'req-00000001'));
    w.groups.forEach((g) => (g.status = 'archived'));
    expect(await w.service.pick(P, ME, picker.draftId, '0')).toEqual({ kind: 'text', text: t('groupNotAvailable', 'en') });
  });

  it('a double-tapped Confirm (concurrent) creates one expense', async () => {
    const w = makeGroupBotWorld();
    w.addGroup({ name: 'Flat' }, [ME.userId, 'user-b']);
    const card = asConfirm(await w.service.start(P, ME, '20 milk', 'req-00000001'));
    await Promise.all([w.service.confirm(P, ME, card.draftId), w.service.confirm(P, ME, card.draftId)]);
    expect(w.expenses).toHaveLength(1);
  });

  it('a redelivered command (same platform message id) creates one expense', async () => {
    const w = makeGroupBotWorld();
    w.addGroup({ name: 'Flat' }, [ME.userId, 'user-b']);
    const a = asConfirm(await w.service.start(P, ME, '20 milk', 'req-same-msg'));
    const b = asConfirm(await w.service.start(P, ME, '20 milk', 'req-same-msg'));
    await w.service.confirm(P, ME, a.draftId);
    await w.service.confirm(P, ME, b.draftId);
    expect(w.expenses).toHaveLength(1);
  });

  it('cancel clears the draft, and a later confirm writes nothing', async () => {
    const w = makeGroupBotWorld();
    w.addGroup({ name: 'Flat' }, [ME.userId, 'user-b']);
    const card = asConfirm(await w.service.start(P, ME, '20', 'req-00000001'));
    expect(await w.service.cancel(P, ME, card.draftId)).toEqual({ kind: 'text', text: t('groupCancelled', 'en') });
    expect(w.draftKeys()).toHaveLength(0);
    expect(await w.service.confirm(P, ME, card.draftId)).toEqual({ kind: 'text', text: t('groupExpired', 'en') });
    expect(w.expenses).toHaveLength(0);
  });

  it('converts a foreign amount: the card previews it and the write stores the converted figure', async () => {
    const w = makeGroupBotWorld();
    w.addGroup({ name: 'Trip' }, [ME.userId, 'user-b']);
    const card = asConfirm(await w.service.start(P, ME, '100 EUR dinner', 'req-00000001'));
    expect(card.text).toContain('100.00 EUR ≈ 430.00 PLN');
    const done = await w.service.confirm(P, ME, card.draftId);
    expect(w.expenses[0].dto).toMatchObject({ amount: 100, currencyCode: 'EUR' });
    expect(done).toEqual({ kind: 'text', text: t('groupAdded', 'en', { group: 'Trip', amount: '100.00 EUR → 430.00 PLN' }) });
  });

  it('refuses a currency with no rate, before any confirm, with a clear message', async () => {
    const w = makeGroupBotWorld();
    w.addGroup({ name: 'Trip' }, [ME.userId, 'user-b']);
    const r = await w.service.start(P, ME, '100 GBP dinner', 'req-00000001');
    expect(r).toEqual({ kind: 'text', text: t('groupFxUnavailable', 'en', { currency: 'GBP' }) });
    expect(w.draftKeys()).toHaveLength(0);
  });

  it('refuses an unsupported currency code', async () => {
    const w = makeGroupBotWorld();
    w.addGroup({ name: 'Trip' }, [ME.userId, 'user-b']);
    const r = await w.service.start(P, ME, '100 CHF fondue', 'req-00000001');
    expect(r).toEqual({ kind: 'text', text: t('groupCurrencyUnsupported', 'en', { currency: 'CHF' }) });
  });

  it('a rate that disappears between card and confirm is refused and the draft is kept for a retry', async () => {
    const w = makeGroupBotWorld();
    w.addGroup({ name: 'Trip' }, [ME.userId, 'user-b']);
    const card = asConfirm(await w.service.start(P, ME, '100 EUR', 'req-00000001'));
    delete w.rates.EUR;
    expect(await w.service.confirm(P, ME, card.draftId)).toEqual({ kind: 'text', text: t('groupFxUnavailable', 'en', { currency: 'EUR' }) });
    expect(w.expenses).toHaveLength(0);
    w.rates.EUR = 4.3;
    await w.service.confirm(P, ME, card.draftId);
    expect(w.expenses).toHaveLength(1);
  });

  it('sends a group over the 20-share limit to the app', async () => {
    const w = makeGroupBotWorld();
    w.addGroup({ name: 'Big' }, [ME.userId, ...Array.from({ length: 20 }, (_, i) => `u${i}`)]);
    expect(await w.service.start(P, ME, '10', 'req-00000001')).toEqual({ kind: 'text', text: t('groupOpenInApp', 'en') });
  });

  describe('security review (ABA-658)', () => {
    it('one message id cannot create expenses in two groups', async () => {
      const w = makeGroupBotWorld();
      const a = w.addGroup({ name: 'A' }, [ME.userId, 'user-b']);
      const b = w.addGroup({ name: 'B' }, [ME.userId, 'user-b']);
      const picker = asPicker(await w.service.start(P, ME, '10 x', 'msg-1'));
      const idx = (name: string) => picker.options.find((o) => o.label === name)!.index;
      const c1 = asConfirm(await w.service.pick(P, ME, picker.draftId, String(idx('A'))));
      await w.service.confirm(P, ME, c1.draftId);
      const picker2 = asPicker(await w.service.start(P, ME, '10 x', 'msg-1'));
      const c2 = asConfirm(await w.service.pick(P, ME, picker2.draftId, String(idx('B'))));
      await w.service.confirm(P, ME, c2.draftId);
      expect(w.expenses.map((e) => e.groupId).sort()).toEqual([a.id, b.id].sort());
      expect(w.expenses[0].dto.clientRequestId).not.toBe(w.expenses[1].dto.clientRequestId);
    });

    it('the same message id from two users yields different request ids', async () => {
      const w = makeGroupBotWorld();
      w.addGroup({ name: 'A' }, [ME.userId, OTHER.userId]);
      const c1 = asConfirm(await w.service.start(P, ME, '10', 'msg-1'));
      const c2 = asConfirm(await w.service.start(P, OTHER, '10', 'msg-1'));
      await w.service.confirm(P, ME, c1.draftId);
      await w.service.confirm(P, OTHER, c2.draftId);
      expect(w.expenses).toHaveLength(2);
      expect(w.expenses[0].dto.clientRequestId).not.toBe(w.expenses[1].dto.clientRequestId);
    });

    it('refuses a dedup hit that is another member\'s expense instead of reporting "Added"', async () => {
      const w = makeGroupBotWorld();
      const g = w.addGroup({ name: 'A' }, [ME.userId, OTHER.userId]);
      const card = asConfirm(await w.service.start(P, ME, '10', 'msg-1'));
      const other = w.members.find((m) => m.userId === OTHER.userId)!;
      // Someone else already owns the exact key this confirm would use.
      const draft = JSON.parse(JSON.stringify(w.cacheStore.get(`test:grp:${card.draftId}`)));
      const { botClientRequestId } = await import('./group-bot');
      w.expenses.push({
        groupId: g.id,
        memberId: other.id,
        amount: 99,
        dto: { clientRequestId: botClientRequestId(P.keyPrefix, draft.messageKey, ME.userId, g.id) },
      });
      const r = await w.service.confirm(P, ME, card.draftId);
      expect(r).toEqual({ kind: 'text', text: t('groupNotAvailable', 'en') });
      expect(w.expenses).toHaveLength(1);
    });

    it('rate limits group commands per user per platform and fails closed', async () => {
      const w = makeGroupBotWorld();
      w.addGroup({ name: 'A' }, [ME.userId, 'b']);
      for (let i = 0; i < 20; i += 1) expect((await w.service.start(P, ME, '5', `m${i}`)).kind).toBe('confirm');
      expect(await w.service.start(P, ME, '5', 'm-over')).toEqual({ kind: 'text', text: t('groupRateLimited', 'en') });
      // Another user and another platform are counted separately.
      w.addGroup({ name: 'B' }, [OTHER.userId, 'b']);
      expect((await w.service.start(P, OTHER, '5', 'm1')).kind).toBe('confirm');
      expect((await w.service.start({ ...P, keyPrefix: 'other:grp' }, ME, '5', 'm1')).kind).toBe('confirm');
    });

    it('refuses when the counter is unavailable (fail closed)', async () => {
      const w = makeGroupBotWorld();
      w.addGroup({ name: 'A' }, [ME.userId, 'b']);
      (w.service as any).cache.incrementWindow = async () => {
        throw new Error('redis down');
      };
      expect(await w.service.start(P, ME, '5', 'm1')).toEqual({ kind: 'text', text: t('groupRateLimited', 'en') });
    });

    it('keeps one active draft per user per platform: a new command replaces the old one', async () => {
      const w = makeGroupBotWorld();
      w.addGroup({ name: 'A' }, [ME.userId, 'b']);
      const first = asConfirm(await w.service.start(P, ME, '5', 'm1'));
      const second = asConfirm(await w.service.start(P, ME, '6', 'm2'));
      expect(w.cacheStore.has(`test:grp:${first.draftId}`)).toBe(false);
      expect(w.cacheStore.has(`test:grp:${second.draftId}`)).toBe(true);
      expect(await w.service.confirm(P, ME, first.draftId)).toEqual({ kind: 'text', text: t('groupExpired', 'en') });
      await w.service.confirm(P, ME, second.draftId);
      expect(w.expenses).toHaveLength(1);
      expect(w.expenses[0].dto.amount).toBe(6);
    });

    it('cuts the stored description by code point', async () => {
      const w = makeGroupBotWorld();
      w.addGroup({ name: 'A' }, [ME.userId, 'b']);
      const card = asConfirm(await w.service.start(P, ME, `5 ${'a'.repeat(119)}😀`, 'm1'));
      await w.service.confirm(P, ME, card.draftId);
      const d = w.expenses[0].dto.description as string;
      expect(Array.from(d)).toHaveLength(120);
      expect(d.endsWith('😀')).toBe(true);
    });
  });
});
