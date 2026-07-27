import 'reflect-metadata';
import { ThrottlerGuard } from '@nestjs/throttler';
import { GuestController } from './guest.controller';
import { renderGuestPage, GuestPageModel, GuestPaymentStatus } from './helpers/guest-page';
import { getGuestPageStrings } from './helpers/guest-page-i18n';

/**
 * Fixture for a single, valid, unexpired, non-cancelled split participant with a nested
 * `expense` (mirrors the shape `findUsableParticipant`'s Prisma `include` produces).
 * `item-1` ("Burger") belongs to this participant; `item-2` ("Fries") belongs to some
 * OTHER participant on the same receipt and must never appear on this participant's page.
 */
const participantFixture: any = {
  id: 'p-1',
  name: 'Alice',
  amount: '25.50',
  currencyCode: 'USD',
  itemIds: ['item-1'],
  openedAt: null,
  claimedAt: null,
  settledAt: null,
  cancelledAt: null,
  expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10),
  token: 'a'.repeat(32),
  expense: {
    merchant: 'Test Diner',
    date: new Date('2026-07-20'),
    userId: 'payer-1',
    paidByUserId: 'payer-1',
    accountId: 'acc-1',
    items: [
      { id: 'item-1', description: 'Burger', totalPrice: '15.00' },
      { id: 'item-2', description: 'Fries', totalPrice: '5.00' },
    ],
  },
};

/**
 * Builds a GuestController wired to a lightweight Prisma + NotificationsService mock,
 * mirroring the direct-construction style used by receipt-split.service.spec.ts.
 */
function buildController(
  opts: {
    participant?: any;
    payerUser?: any;
    member?: any;
  } = {},
) {
  const participant = opts.participant ?? participantFixture;

  const prisma: any = {
    receiptSplitParticipant: {
      findUnique: jest.fn().mockResolvedValue(participant),
      update: jest.fn().mockResolvedValue(undefined),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(
        opts.payerUser ?? { name: 'Payer Pat', paymentMethod: 'revolut', paymentHandle: 'payerpat' },
      ),
    },
    accountMember: {
      findFirst: jest.fn().mockResolvedValue(opts.member ?? null),
    },
  };

  const notificationsService: any = {
    sendToUser: jest.fn().mockResolvedValue(true),
  };

  const controller = new GuestController(prisma, notificationsService);
  return { controller, prisma, notificationsService };
}

describe('GuestController.guestPage', () => {
  it('needs no authentication — resolves from a bare request object with no user/JWT context', async () => {
    const { controller } = buildController();
    const html = await controller.guestPage(participantFixture.token, {} as any);
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(0);
  });

  it('answers an unknown token and an expired token identically', async () => {
    const { controller, prisma } = buildController();
    prisma.receiptSplitParticipant.findUnique = jest.fn().mockResolvedValue(null);
    const unknown = await controller.guestPage('0'.repeat(32), {} as any);

    prisma.receiptSplitParticipant.findUnique = jest.fn().mockResolvedValue({
      ...participantFixture,
      expiresAt: new Date('2000-01-01'),
    });
    const expired = await controller.guestPage('1'.repeat(32), {} as any);

    // Byte-identical: no status code, wording, or length difference may let a
    // caller distinguish "no such link" from "this link has expired".
    expect(expired).toBe(unknown);
  });

  it('answers a cancelled token identically to an unknown token too', async () => {
    const { controller, prisma } = buildController();
    prisma.receiptSplitParticipant.findUnique = jest.fn().mockResolvedValue(null);
    const unknown = await controller.guestPage('2'.repeat(32), {} as any);

    prisma.receiptSplitParticipant.findUnique = jest.fn().mockResolvedValue({
      ...participantFixture,
      cancelledAt: new Date(),
    });
    const cancelled = await controller.guestPage('3'.repeat(32), {} as any);

    expect(cancelled).toBe(unknown);
  });

  it('costs exactly the same number of Prisma calls for an unknown, an expired, and a cancelled token', async () => {
    // Counts every mock invocation across every model on the prisma stub — not just
    // `findUnique` — so a byte-identical body cannot hide a timing difference smuggled
    // through some other query. `findUsableParticipant` splits the read in two: the
    // participant's own columns first (one query, every token), then the expense + its
    // items only for a token that clears every check. All three invalid outcomes below
    // must therefore cost exactly one query, never two.
    function countPrismaCalls(prisma: any): number {
      let total = 0;
      for (const model of Object.values(prisma)) {
        for (const fn of Object.values(model as Record<string, unknown>)) {
          if (jest.isMockFunction(fn)) total += fn.mock.calls.length;
        }
      }
      return total;
    }

    const { controller: unknownCtrl, prisma: unknownPrisma } = buildController();
    unknownPrisma.receiptSplitParticipant.findUnique = jest.fn().mockResolvedValue(null);
    await unknownCtrl.guestPage('4'.repeat(32), {} as any);
    const unknownCalls = countPrismaCalls(unknownPrisma);

    const { controller: expiredCtrl, prisma: expiredPrisma } = buildController();
    expiredPrisma.receiptSplitParticipant.findUnique = jest.fn().mockResolvedValue({
      ...participantFixture,
      expiresAt: new Date('2000-01-01'),
    });
    await expiredCtrl.guestPage('5'.repeat(32), {} as any);
    const expiredCalls = countPrismaCalls(expiredPrisma);

    const { controller: cancelledCtrl, prisma: cancelledPrisma } = buildController();
    cancelledPrisma.receiptSplitParticipant.findUnique = jest.fn().mockResolvedValue({
      ...participantFixture,
      cancelledAt: new Date(),
    });
    await cancelledCtrl.guestPage('6'.repeat(32), {} as any);
    const cancelledCalls = countPrismaCalls(cancelledPrisma);

    expect(unknownCalls).toBe(1);
    expect(expiredCalls).toBe(unknownCalls);
    expect(cancelledCalls).toBe(unknownCalls);
  });

  it("includes only the guest's own amount and own items, and never the accountId or another participant's line item", async () => {
    const { controller } = buildController();
    const html = await controller.guestPage(participantFixture.token, {} as any);

    expect(html).toContain('25.50'); // guest's own share
    expect(html).toContain('Burger'); // guest's own item
    expect(html).not.toContain('Fries'); // belongs to a different participant on the receipt
    expect(html).not.toContain('acc-1'); // accountId must never leak
  });

  it('escapes a participant name containing <script>', async () => {
    const { controller } = buildController({
      participant: { ...participantFixture, name: '<script>alert(1)</script>' },
    });
    const html = await controller.guestPage(participantFixture.token, {} as any);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes the merchant name and the payer name too, not just the guest name', async () => {
    const { controller } = buildController({
      participant: {
        ...participantFixture,
        expense: { ...participantFixture.expense, merchant: '<img src=x onerror=alert(1)>' },
      },
      payerUser: { name: '<b>Payer</b>', paymentMethod: null, paymentHandle: null },
    });
    const html = await controller.guestPage(participantFixture.token, {} as any);
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<b>Payer</b>');
  });

  it('stamps openedAt on the first view and does not re-stamp it on a later view', async () => {
    const { controller: firstView, prisma: firstPrisma } = buildController({
      participant: { ...participantFixture, openedAt: null },
    });
    await firstView.guestPage(participantFixture.token, {} as any);
    expect(firstPrisma.receiptSplitParticipant.update).toHaveBeenCalledTimes(1);
    expect(firstPrisma.receiptSplitParticipant.update).toHaveBeenCalledWith({
      where: { id: participantFixture.id },
      data: { openedAt: expect.any(Date) },
    });

    const { controller: laterView, prisma: laterPrisma } = buildController({
      participant: { ...participantFixture, openedAt: new Date('2026-01-01') },
    });
    await laterView.guestPage(participantFixture.token, {} as any);
    expect(laterPrisma.receiptSplitParticipant.update).not.toHaveBeenCalled();
  });

  it('resolves the language from ?lang= first, then Accept-Language, else English', async () => {
    const { controller: plController } = buildController();
    const htmlPl = await plController.guestPage(participantFixture.token, {
      query: { lang: 'pl' },
      headers: {},
    } as any);
    expect(htmlPl).toContain('zapłacił');

    const { controller: deController } = buildController();
    const htmlDe = await deController.guestPage(participantFixture.token, {
      query: {},
      headers: { 'accept-language': 'de-DE,de;q=0.9,en;q=0.8' },
    } as any);
    expect(htmlDe).toContain('bezahlt');

    const { controller: enController } = buildController();
    const htmlEn = await enController.guestPage(participantFixture.token, {
      query: {},
      headers: {},
    } as any);
    expect(htmlEn).toContain('paid for everyone');
  });

  it('shows a revolut.me pay link when the payer has revolut configured', async () => {
    const { controller } = buildController({
      payerUser: { name: 'Payer Pat', paymentMethod: 'revolut', paymentHandle: 'payerpat' },
    });
    const html = await controller.guestPage(participantFixture.token, {} as any);
    expect(html).toContain('https://revolut.me/payerpat');
  });

  it('falls back to the account-member payment handle when the user-level one is unset', async () => {
    const { controller, prisma } = buildController({
      payerUser: { name: 'Payer Pat', paymentMethod: null, paymentHandle: null },
      member: { paymentMethod: 'paypal', paymentHandle: 'payerpat-account' },
    });
    const html = await controller.guestPage(participantFixture.token, {} as any);
    expect(prisma.accountMember.findFirst).toHaveBeenCalledWith({
      where: { accountId: 'acc-1', userId: 'payer-1' },
      select: { paymentMethod: true, paymentHandle: true },
    });
    expect(html).toContain('https://paypal.me/payerpat-account');
  });
});

describe('GuestController.guestPage — multi-method payment resolution order', () => {
  it('uses the UserPaymentMethod list first, ignoring the legacy single pair even when both are set', async () => {
    const { controller, prisma } = buildController({
      payerUser: {
        name: 'Payer Pat',
        paymentMethod: 'blik',
        paymentHandle: 'legacy-blik-handle',
        paymentMethods: [
          { method: 'revolut', handle: 'listed-revolut' },
          { method: 'paypal', handle: 'listed-paypal' },
        ],
      },
    });
    const html = await controller.guestPage(participantFixture.token, {} as any);

    expect(html).toContain('https://revolut.me/listed-revolut');
    expect(html).toContain('https://paypal.me/listed-paypal');
    expect(html).not.toContain('legacy-blik-handle');
    // The list alone answers it — no need to even consult the AccountMember fallback.
    expect(prisma.accountMember.findFirst).not.toHaveBeenCalled();
  });

  it('falls back to the legacy single pair exactly as before when the list is empty', async () => {
    const { controller } = buildController({
      payerUser: { name: 'Payer Pat', paymentMethod: 'revolut', paymentHandle: 'payerpat', paymentMethods: [] },
    });
    const html = await controller.guestPage(participantFixture.token, {} as any);
    expect(html).toContain('https://revolut.me/payerpat');
  });

  it('falls back to the AccountMember pair when the list is empty AND the legacy pair is unset', async () => {
    const { controller, prisma } = buildController({
      payerUser: { name: 'Payer Pat', paymentMethod: null, paymentHandle: null, paymentMethods: [] },
      member: { paymentMethod: 'paypal', paymentHandle: 'payerpat-account' },
    });
    const html = await controller.guestPage(participantFixture.token, {} as any);
    expect(prisma.accountMember.findFirst).toHaveBeenCalledWith({
      where: { accountId: 'acc-1', userId: 'payer-1' },
      select: { paymentMethod: true, paymentHandle: true },
    });
    expect(html).toContain('https://paypal.me/payerpat-account');
  });

  it('shows the "no payment info" line when the list is empty, the legacy pair is unset, and the account member has none either', async () => {
    const { controller } = buildController({
      payerUser: { name: 'Payer Pat', paymentMethod: null, paymentHandle: null, paymentMethods: [] },
      member: null,
    });
    const html = await controller.guestPage(participantFixture.token, {} as any);
    const strings = getGuestPageStrings('en');
    expect(html).toContain(strings.noPaymentInfo);
  });
});

describe('GuestController.markPaid', () => {
  it('is idempotent — a second call leaves claimedAt unchanged and sends only one notification', async () => {
    const { controller, prisma, notificationsService } = buildController({
      participant: { ...participantFixture, claimedAt: null },
    });
    prisma.receiptSplitParticipant.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await controller.markPaid(participantFixture.token, {} as any);
    await controller.markPaid(participantFixture.token, {} as any);

    expect(prisma.receiptSplitParticipant.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.receiptSplitParticipant.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: participantFixture.id, claimedAt: null },
      data: { claimedAt: expect.any(Date) },
    });
    expect(notificationsService.sendToUser).toHaveBeenCalledTimes(1);
  });

  it('routes the payer push through localized notification-i18n functions tagged split_payment_claimed — not hardcoded English, and with no preference-gate literal blocking it', async () => {
    const { controller, notificationsService } = buildController({
      participant: { ...participantFixture, claimedAt: null },
    });

    await controller.markPaid(participantFixture.token, {} as any);

    expect(notificationsService.sendToUser).toHaveBeenCalledWith(
      'payer-1',
      expect.any(Function),
      expect.any(Function),
      expect.objectContaining({ participantId: 'p-1' }),
      'split_payment_claimed',
    );

    const [, titleFn, bodyFn] = notificationsService.sendToUser.mock.calls[0];

    // Not the old hardcoded English literal — routed through notification-i18n instead.
    expect(titleFn('en')).not.toBe('Someone marked their share as paid');
    expect(bodyFn('en')).not.toContain('Someone marked their share as paid');
    expect(titleFn('en')).toContain('Alice');
    expect(bodyFn('en')).toContain('25.50');
    expect(bodyFn('en')).toContain('USD');

    // Genuinely localized (not an identity function ignoring `lang`) — a Polish
    // reader gets Polish text, not a copy of the English string.
    expect(titleFn('pl')).not.toBe(titleFn('en'));
    expect(bodyFn('pl')).not.toBe(bodyFn('en'));
  });

  it('writes nothing else — only the atomic claimedAt updateMany, no other participant write', async () => {
    const { controller, prisma } = buildController({
      participant: { ...participantFixture, claimedAt: null },
    });
    await controller.markPaid(participantFixture.token, {} as any);
    expect(prisma.receiptSplitParticipant.update).not.toHaveBeenCalled();
  });

  it('answers an unknown token like the GET route does — no participant leak on the write path either', async () => {
    const { controller, prisma } = buildController();
    prisma.receiptSplitParticipant.findUnique = jest.fn().mockResolvedValue(null);
    const html = await controller.markPaid('0'.repeat(32), {} as any);
    expect(html).not.toContain('Alice');
    expect(html).not.toContain('25.50');
  });
});

/**
 * Constructing the controller directly (as every other describe block in this file
 * does) and calling a method bypasses Nest's guard pipeline entirely — `@UseGuards` is
 * metadata that only runs when Nest actually dispatches an HTTP request through it. So a
 * test built that way would keep passing even if someone added, say,
 * `@UseGuards(JwtAuthGuard)` to this controller tomorrow, silently turning the one public
 * page in the app into one that 401s. This block instead reads the guard metadata Nest's
 * `@UseGuards` decorator attaches to the class and to each handler
 * (`Reflect.getMetadata('__guards__', target)`, the exact key `@nestjs/common`'s
 * `GUARDS_METADATA` constant uses) and asserts directly on it, independent of whether the
 * method is ever invoked.
 */
describe('GuestController guard metadata — the no-authentication invariant', () => {
  const GUARDS_METADATA = '__guards__';

  function nonThrottlerGuardNames(target: object): string[] {
    const guards = (Reflect.getMetadata(GUARDS_METADATA, target) as Function[] | undefined) ?? [];
    // ThrottlerGuard is the one guard this public surface is supposed to carry (rate
    // limiting, not authentication) — everything else attached here would be an auth or
    // account-scoping guard that has no business on an unauthenticated guest page.
    return guards.filter((g) => g !== ThrottlerGuard).map((g) => g.name);
  }

  it('attaches no authentication guard on the controller class', () => {
    // Fails with e.g. ["JwtAuthGuard"] instead of a bare boolean mismatch if one is ever added.
    expect(nonThrottlerGuardNames(GuestController)).toEqual([]);
  });

  it('attaches no authentication guard on GET /:token, and keeps ThrottlerGuard', () => {
    const guards = (Reflect.getMetadata(GUARDS_METADATA, GuestController.prototype.guestPage) as Function[] | undefined) ?? [];
    expect(nonThrottlerGuardNames(GuestController.prototype.guestPage)).toEqual([]);
    expect(guards).toContain(ThrottlerGuard);
  });

  it('attaches no authentication guard on POST /:token/paid, and keeps ThrottlerGuard', () => {
    const guards = (Reflect.getMetadata(GUARDS_METADATA, GuestController.prototype.markPaid) as Function[] | undefined) ?? [];
    expect(nonThrottlerGuardNames(GuestController.prototype.markPaid)).toEqual([]);
    expect(guards).toContain(ThrottlerGuard);
  });
});

describe('renderGuestPage — pay affordance suppressed once payment is claimed', () => {
  const baseModel: GuestPageModel = {
    guestName: 'Alice',
    merchant: 'Test Diner',
    dateLabel: '2026-07-20',
    payerName: 'Payer Pat',
    amount: 25.5,
    currencyCode: 'USD',
    items: null,
    status: 'sent',
    paymentMethods: [
      {
        method: 'revolut',
        paymentLink: 'https://revolut.me/payerpat?amount=25.5&currency=USD',
        manualInstructions: false,
        handle: 'payerpat',
      },
    ],
    postPaidAction: '/s/token/paid',
  };
  const strings = getGuestPageStrings('en');

  // Note: the page's static <style> block unconditionally defines the `.btn-primary`
  // and `.blik-box` CSS rules regardless of whether the corresponding element is
  // rendered, so assertions below match the actual markup (the anchor tag / div with
  // that class, or the href/handle text inside it) rather than the bare class-name
  // substring, which the stylesheet itself would always satisfy.
  it.each<GuestPaymentStatus>(['sent', 'opened'])(
    'shows the pay button while status is "%s" (not yet claimed)',
    (status) => {
      const html = renderGuestPage({ ...baseModel, status }, strings);
      expect(html).toContain('<a class="btn btn-primary"');
      expect(html).toContain('https://revolut.me/payerpat');
    },
  );

  it.each<GuestPaymentStatus>(['claimed', 'settled'])(
    'hides the pay button once status is "%s"',
    (status) => {
      const html = renderGuestPage({ ...baseModel, status }, strings);
      expect(html).not.toContain('<a class="btn btn-primary"');
      expect(html).not.toContain('https://revolut.me/payerpat');
    },
  );

  it('hides the BLIK box too once claimed, not just the revolut/paypal button', () => {
    const model: GuestPageModel = {
      ...baseModel,
      status: 'claimed',
      paymentMethods: [
        { method: 'blik', paymentLink: null, manualInstructions: true, handle: 'blik-handle' },
      ],
    };
    const html = renderGuestPage(model, strings);
    expect(html).not.toContain('<div class="blik-box">');
    expect(html).not.toContain('blik-handle');
  });

  it('still shows the "marked as paid" confirmation once claimed (the pay button disappears, the notice does not)', () => {
    const html = renderGuestPage({ ...baseModel, status: 'claimed' }, strings);
    expect(html).toContain(strings.claimedNotice);
  });
});

describe('renderGuestPage — multiple payment methods (one block per method)', () => {
  const strings = getGuestPageStrings('en');
  const baseModel: GuestPageModel = {
    guestName: 'Alice',
    merchant: 'Test Diner',
    dateLabel: '2026-07-20',
    payerName: 'Payer Pat',
    amount: 25.5,
    currencyCode: 'USD',
    items: null,
    status: 'sent',
    paymentMethods: [],
    postPaidAction: '/s/token/paid',
  };

  it('renders one button per link-capable method, in order — two methods produce two buttons', () => {
    const html = renderGuestPage(
      {
        ...baseModel,
        paymentMethods: [
          { method: 'revolut', paymentLink: 'https://revolut.me/rev-handle', manualInstructions: false, handle: 'rev-handle' },
          { method: 'paypal', paymentLink: 'https://paypal.me/pp-handle/25.50', manualInstructions: false, handle: 'pp-handle' },
        ],
      },
      strings,
    );

    const buttonCount = (html.match(/<a class="btn btn-primary"/g) ?? []).length;
    expect(buttonCount).toBe(2);
    expect(html).toContain('https://revolut.me/rev-handle');
    expect(html).toContain('https://paypal.me/pp-handle/25.50');
    // Order preserved: revolut's href appears before paypal's.
    expect(html.indexOf('https://revolut.me/rev-handle')).toBeLessThan(html.indexOf('https://paypal.me/pp-handle/25.50'));
  });

  it('BLIK produces the instructions box, not a link button', () => {
    const html = renderGuestPage(
      { ...baseModel, paymentMethods: [{ method: 'blik', paymentLink: null, manualInstructions: true, handle: 'blik-handle' }] },
      strings,
    );
    expect(html).not.toContain('<a class="btn btn-primary"');
    expect(html).toContain('<div class="blik-box">');
    expect(html).toContain('blik-handle');
  });

  it('renders a button AND a box together when a link-capable method and BLIK are both offered', () => {
    const html = renderGuestPage(
      {
        ...baseModel,
        paymentMethods: [
          { method: 'revolut', paymentLink: 'https://revolut.me/rev-handle', manualInstructions: false, handle: 'rev-handle' },
          { method: 'blik', paymentLink: null, manualInstructions: true, handle: 'blik-handle' },
        ],
      },
      strings,
    );
    expect(html).toContain('<a class="btn btn-primary"');
    expect(html).toContain('<div class="blik-box">');
  });

  it('escapes every handle — including a BLIK handle rendered inside the instructions box', () => {
    const html = renderGuestPage(
      { ...baseModel, paymentMethods: [{ method: 'blik', paymentLink: null, manualInstructions: true, handle: '<b>evil</b>' }] },
      strings,
    );
    expect(html).not.toContain('<b>evil</b>');
    expect(html).toContain('&lt;b&gt;evil&lt;/b&gt;');
  });

  it('shows the "no payment info" line only when the method list is empty', () => {
    const html = renderGuestPage({ ...baseModel, paymentMethods: [] }, strings);
    expect(html).toContain(strings.noPaymentInfo);
    expect(html).not.toContain('<a class="btn btn-primary"');
    expect(html).not.toContain('<div class="blik-box">');
  });

  it('shows the "no payment info" line when every configured method resolves to nothing renderable (e.g. cash)', () => {
    const html = renderGuestPage(
      { ...baseModel, paymentMethods: [{ method: 'cash', paymentLink: null, manualInstructions: false, handle: 'n/a' }] },
      strings,
    );
    expect(html).toContain(strings.noPaymentInfo);
  });

  it('does NOT show the "no payment info" line when at least one method rendered something', () => {
    const html = renderGuestPage(
      {
        ...baseModel,
        paymentMethods: [
          { method: 'cash', paymentLink: null, manualInstructions: false, handle: 'n/a' },
          { method: 'revolut', paymentLink: 'https://revolut.me/rev-handle', manualInstructions: false, handle: 'rev-handle' },
        ],
      },
      strings,
    );
    expect(html).not.toContain(strings.noPaymentInfo);
    expect(html).toContain('https://revolut.me/rev-handle');
  });
});
