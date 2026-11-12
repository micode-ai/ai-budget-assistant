import { BadRequestException } from '@nestjs/common';
import { OcrService, ParsedReceipt } from './ocr.service';
import { receiptFingerprint, receiptFingerprintParts } from '../../expenses/receipt-duplicate.service';
import { RECEIPT_PARTS_INSTRUCTIONS } from '../prompts/receipt-parts.prompt';

const mockChatCreate = jest.fn();
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockChatCreate } },
  })),
}));

const PARSED: ParsedReceipt = {
  merchantName: 'Biedronka',
  merchantAddress: null,
  merchantStreet: null,
  merchantCity: null,
  merchantPostalCode: null,
  merchantCountry: null,
  date: '2026-01-15',
  time: '12:00',
  items: [{ description: 'Item', totalPrice: 10 }],
  subtotal: 10,
  discount: null,
  deposit: null,
  tax: 0,
  total: 10,
  currency: 'PLN',
  paymentMethod: 'card',
  confidence: 0.9,
};

const part = (b64: string, mimeType = 'image/jpeg') => ({ imageBase64: b64, mimeType });

describe('OcrService.parseReceiptParts', () => {
  let service: OcrService;
  let finalizer: { finalizeReceipt: jest.Mock };
  let receiptDuplicates: { findByFingerprint: jest.Mock; findLikely: jest.Mock };

  beforeEach(() => {
    mockChatCreate.mockReset();
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(PARSED) }, finish_reason: 'stop' }],
    });
    const prisma: any = {
      category: { findMany: jest.fn().mockResolvedValue([]) },
      user: { findUnique: jest.fn().mockResolvedValue({ aiModel: null, language: 'en', timezone: 'UTC' }) },
    };
    finalizer = {
      finalizeReceipt: jest.fn().mockResolvedValue({ receiptItems: [], categorySplits: [], priceFindings: [] }),
    };
    receiptDuplicates = {
      findByFingerprint: jest.fn().mockResolvedValue(null),
      findLikely: jest.fn().mockResolvedValue(null),
    };
    service = new OcrService(
      { get: jest.fn().mockReturnValue('sk-test') } as any,
      prisma,
      finalizer as any,
      {} as any,
      { recordAdditionalUsage: jest.fn().mockResolvedValue(undefined) } as any,
      receiptDuplicates as any,
    );
    (service as any).logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
  });

  it('sends one model call with N image parts in order after the text prompt', async () => {
    await service.parseReceiptParts([part('AAA'), part('BBB', 'image/png'), part('CCC')], 'user-1', 'acc-1');

    expect(mockChatCreate).toHaveBeenCalledTimes(1);
    const req = mockChatCreate.mock.calls[0][0];
    expect(req.model).toBe('gpt-4.1');
    expect(req.messages[0]).toEqual(
      expect.objectContaining({ role: 'system', content: expect.stringContaining('Return a JSON object') }),
    );
    const content = req.messages[1].content;
    expect(content.map((c: any) => c.type)).toEqual(['text', 'image_url', 'image_url', 'image_url']);
    expect(content.slice(1).map((c: any) => c.image_url.url)).toEqual([
      'data:image/jpeg;base64,AAA',
      'data:image/png;base64,BBB',
      'data:image/jpeg;base64,CCC',
    ]);
    expect(content.slice(1).every((c: any) => c.image_url.detail === 'high')).toBe(true);
    expect(req.max_tokens).toBe(6144);
  });

  it('normalizes image/jpg to image/jpeg in the data URL', async () => {
    await service.parseReceiptParts([part('AAA', 'image/jpg'), part('BBB')], 'user-1', 'acc-1');
    const urls = mockChatCreate.mock.calls[0][0].messages[1].content.slice(1).map((c: any) => c.image_url.url);
    expect(urls[0]).toBe('data:image/jpeg;base64,AAA');
  });

  it('keeps the single-scan token budget for two parts', async () => {
    await service.parseReceiptParts([part('AAA'), part('BBB')], 'user-1', 'acc-1');
    expect(mockChatCreate.mock.calls[0][0].max_tokens).toBe(4096);
  });

  it('prompt contains the overlap and repeated-item instructions', async () => {
    await service.parseReceiptParts([part('AAA'), part('BBB')], 'user-1', 'acc-1', 'lunch');
    const req = mockChatCreate.mock.calls[0][0];
    const text: string = req.messages[1].content[0].text;
    expect(text).toContain(RECEIPT_PARTS_INSTRUCTIONS);
    expect(text).toContain('keep genuinely repeated items');
    expect(text).toContain('Available expense categories');
    expect(text).toContain('User note about this receipt: "lunch"');
    // The cacheable system prefix is the single-scan one, untouched.
    expect(req.messages[0].content).not.toContain(RECEIPT_PARTS_INSTRUCTIONS);
  });

  it('runs the shared finalizer and the duplicate check with the parts fingerprint', async () => {
    const result = await service.parseReceiptParts([part('AAA'), part('BBB')], 'user-1', 'acc-1', undefined, {
      attest: true,
    });
    expect(finalizer.finalizeReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ merchantName: 'Biedronka' }),
      [],
      'acc-1',
      'user-1',
      { attest: true },
    );
    const fp = receiptFingerprintParts(['AAA', 'BBB']);
    expect(result.fingerprint).toBe(fp);
    expect(receiptDuplicates.findByFingerprint).toHaveBeenCalledWith('acc-1', fp);
    expect(receiptDuplicates.findLikely).toHaveBeenCalled();
  });

  it('fingerprint covers all parts in order; reordering changes it; one part equals receiptFingerprint', () => {
    const ab = receiptFingerprintParts(['AAA', 'BBB']);
    expect(ab).toMatch(/^[0-9a-f]{64}$/);
    expect(receiptFingerprintParts(['BBB', 'AAA'])).not.toBe(ab);
    expect(receiptFingerprintParts(['AAA', 'BBB', 'CCC'])).not.toBe(ab);
    expect(receiptFingerprintParts(['AAA'])).toBe(receiptFingerprint('AAA'));
  });

  it('passes caller scan options through; never forces attest (unreconciled result carries no scanAttestation)', async () => {
    // Line sum 10 vs total 50: does not reconcile (the re-read returns the same).
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ ...PARSED, subtotal: 50, total: 50 }) }, finish_reason: 'stop' }],
    });

    const result = await service.parseReceiptParts([part('AAA'), part('BBB')], 'user-1', 'acc-1');

    // Same finalizer, same options a single scan passes: nothing forces attestation
    // for parts, so the finalizer's reconciliation gate stays the only gate.
    expect(finalizer.finalizeReceipt).toHaveBeenCalledWith(expect.anything(), [], 'acc-1', 'user-1', {});
    expect(result.scanAttestation).toBeUndefined();
  });

  it('rejects with stable codes: parts_count, parts_empty, parts_with_pdf, parts_mime', async () => {
    const msg = (p: Parameters<typeof service.parseReceiptParts>[0]) =>
      service.parseReceiptParts(p, 'u', 'a').catch((e) => (e instanceof BadRequestException ? e.message : 'other'));
    expect(await msg([part('A')])).toBe('parts_count');
    expect(await msg([part('A'), part('B'), part('C'), part('D'), part('E')])).toBe('parts_count');
    expect(await msg([part('A'), part('')])).toBe('parts_empty');
    expect(await msg([part('A'), part('B', 'application/pdf')])).toBe('parts_with_pdf');
    expect(await msg([part('A'), part('B', 'image/tiff')])).toBe('parts_mime');
    expect(mockChatCreate).not.toHaveBeenCalled();
  });
});
