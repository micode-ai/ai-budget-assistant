import { PhotoHandler } from './photo.handler';

// The handler downloads the file via this helper (real network) — stub it.
jest.mock('../helpers/download-file', () => ({
  downloadFile: jest.fn().mockResolvedValue(Buffer.from('pdf')),
}));

const RECEIPT_LOCATION = { lat: 52.2297, lng: 21.0122, name: 'Sucha 31, Sucha' };

function baseReceipt(location: typeof RECEIPT_LOCATION | null) {
  return {
    amount: 42.5,
    discountAmount: null,
    currencyCode: 'PLN',
    description: 'Biedronka',
    categoryId: null,
    categorySuggestion: 'Groceries',
    merchant: 'Biedronka',
    date: '2026-07-07',
    confidence: 0.9,
    receiptItems: [],
    location,
  };
}

function makeCtx() {
  return {
    userState: { userId: 'user-1', accountId: 'acc-1', accountRole: 'editor', language: 'pl' },
    from: { id: 123, language_code: 'pl' },
    message: { document: { mime_type: 'application/pdf', file_id: 'F1' } },
    sendChatAction: jest.fn().mockResolvedValue(undefined),
    telegram: { getFileLink: jest.fn().mockResolvedValue({ href: 'https://t.example/file.pdf' }) },
    reply: jest.fn().mockResolvedValue(undefined),
    editMessageText: jest.fn().mockResolvedValue(undefined),
    answerCbQuery: jest.fn().mockResolvedValue(undefined),
  };
}

/** Pull the generated receiptId out of the inline-keyboard callback_data. */
function receiptIdFromReply(ctx: ReturnType<typeof makeCtx>): string {
  const kb = ctx.reply.mock.calls[0][1].reply_markup.inline_keyboard;
  const cb = kb[0][0].callback_data as string; // 'receipt_add:<id>'
  return cb.split(':')[1];
}

describe('Telegram PhotoHandler — geocoded location wiring (ABA-310 bot photo geocode flag)', () => {
  function setup(location: typeof RECEIPT_LOCATION | null) {
    const ocr = {
      parseReceipt: jest.fn(),
      parseReceiptPdf: jest.fn().mockResolvedValue(baseReceipt(location)),
    };
    const expenses = { create: jest.fn().mockResolvedValue({ id: 'exp-1' }) };
    const subs = { trackAiUsage: jest.fn().mockResolvedValue(undefined) };
    const handler = new PhotoHandler(ocr as never, expenses as never, subs as never);
    return { handler, expenses };
  }

  it('carries the geocoded location from OCR through to expensesService.create', async () => {
    const { handler, expenses } = setup(RECEIPT_LOCATION);
    const ctx = makeCtx();

    await handler.handleDocument(ctx as never);
    const receiptId = receiptIdFromReply(ctx);
    await handler.handleReceiptAddCallback(ctx as never, receiptId);

    expect(expenses.create).toHaveBeenCalledTimes(1);
    const dto = expenses.create.mock.calls[0][2];
    expect(dto.location).toEqual(RECEIPT_LOCATION);
  });

  it('omits location when the receipt had no geocodable address', async () => {
    const { handler, expenses } = setup(null);
    const ctx = makeCtx();

    await handler.handleDocument(ctx as never);
    const receiptId = receiptIdFromReply(ctx);
    await handler.handleReceiptAddCallback(ctx as never, receiptId);

    expect(expenses.create).toHaveBeenCalledTimes(1);
    const dto = expenses.create.mock.calls[0][2];
    expect(dto.location).toBeUndefined();
  });
});

describe('Telegram PhotoHandler — buildPriceCheckLine (receipt price-check summary)', () => {
  function setup() {
    const ocr = { parseReceipt: jest.fn(), parseReceiptPdf: jest.fn() };
    const expenses = { create: jest.fn() };
    const subs = { trackAiUsage: jest.fn() };
    return new PhotoHandler(ocr as never, expenses as never, subs as never);
  }

  it('appends a price-check line when the scan returned findings', async () => {
    const handler = setup();
    const summary = (handler as any).buildPriceCheckLine(
      {
        priceFindings: [
          { canonicalName: 'Kawa', overpaidAmount: 4, currencyCode: 'PLN' },
          { canonicalName: 'Mleko', overpaidAmount: 2, currencyCode: 'PLN' },
        ],
      } as any,
      'en',
    );
    expect(summary).toContain('2');
    expect(summary).toContain('6');
  });

  it('returns an empty string when there are no findings', () => {
    const handler = setup();
    expect((handler as any).buildPriceCheckLine({ priceFindings: [] } as any, 'en')).toBe('');
  });

  const findings = (n: number) =>
    Array.from({ length: n }, () => ({ canonicalName: 'Kawa', overpaidAmount: 4, currencyCode: 'PLN' }));

  // The old wording put the count directly before a noun, which is ungrammatical in
  // Russian for most counts. Assert the count is NOT immediately followed by a word:
  // it must be the last token of its clause, so no noun has to agree with it.
  it.each([1, 2, 5])('keeps the count away from any agreeing noun (ru, count=%i)', (n) => {
    const handler = setup();
    const line = (handler as any).buildPriceCheckLine({ priceFindings: findings(n) } as any, 'ru');
    expect(line).toMatch(new RegExp(`${n}\\s*(,|\\.|$)`));
    expect(line).not.toMatch(new RegExp(`${n}\\s+\\p{L}`, 'u'));
  });
});
