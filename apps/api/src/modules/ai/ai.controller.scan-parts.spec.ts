import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AiController } from './ai.controller';
import { ScanReceiptRequestSchema as ApiSchema } from './utils/sanitize';

// The shared-utils copy is type-only for the API at runtime; the spec loads it by path to
// pin that both copies accept and reject exactly the same bodies. It must be a plain
// require() with a local type, never an `import` or `typeof import(...)`: `nest build`
// compiles specs too, and any file outside src/ pulled into the program moves the output
// root, so dist/main.js becomes dist/apps/api/src/main.js and prod cannot start (ABA-751).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ScanReceiptRequestSchema: SharedSchema } = require('../../../../../packages/shared-utils/src/validation') as {
  ScanReceiptRequestSchema: { safeParse(body: unknown): { success: boolean } };
};

const img = (b = 'AAA', mimeType?: string) => ({ imageBase64: b, mimeType });

describe('AiController.scanReceipt multi-part', () => {
  const ocr = { parseReceipt: jest.fn(), parseReceiptPdf: jest.fn(), parseReceiptParts: jest.fn() };
  const subs = { trackAiUsage: jest.fn(), refundAiUsage: jest.fn() };
  const prisma = { user: { findUnique: jest.fn() } };
  let controller: AiController;
  const req = { user: { id: 'u1' }, accountId: 'a1' } as never;

  beforeEach(() => {
    jest.resetAllMocks();
    ocr.parseReceipt.mockResolvedValue({ fingerprint: 'single' });
    ocr.parseReceiptParts.mockResolvedValue({ fingerprint: 'parts' });
    prisma.user.findUnique.mockResolvedValue({ aiModel: 'balanced' });
    controller = new AiController(
      {} as never, {} as never, {} as never, ocr as never, {} as never, {} as never, {} as never,
      {} as never, {} as never, {} as never, {} as never, {} as never, subs as never, prisma as never,
    );
  });

  it('imageBase64-only request takes today path and fingerprint', async () => {
    const r = await controller.scanReceipt(req, { imageBase64: 'AAA', communityBaseline: true });
    expect(ocr.parseReceipt).toHaveBeenCalledWith('AAA', 'u1', 'a1', undefined, undefined, { communityBaseline: true });
    expect(ocr.parseReceiptParts).not.toHaveBeenCalled();
    expect(subs.trackAiUsage).not.toHaveBeenCalled();
    expect(r).toEqual({ fingerprint: 'single' });
  });

  it('PDF single upload stays on the PDF path', async () => {
    await controller.scanReceipt(req, { imageBase64: 'P', mimeType: 'application/pdf' });
    expect(ocr.parseReceiptPdf).toHaveBeenCalled();
  });

  it('images of 2 records 2.0 extra (x multiplier) before the OCR call', async () => {
    prisma.user.findUnique.mockResolvedValue({ aiModel: 'quality' });
    const order: string[] = [];
    subs.trackAiUsage.mockImplementation(async () => { order.push('track'); });
    ocr.parseReceiptParts.mockImplementation(async () => { order.push('ocr'); return {}; });
    await controller.scanReceipt(req, { images: [img('A'), img('B', 'image/png')], communityBaseline: true });
    const { getAiCostMultiplier } = await import('./services/model-resolver');
    expect(subs.trackAiUsage).toHaveBeenCalledWith('u1', 'ocr', 2.0 * 1 * getAiCostMultiplier('quality'), 'a1');
    expect(order).toEqual(['track', 'ocr']);
    expect(ocr.parseReceiptParts).toHaveBeenCalledWith(
      [img('A', 'image/jpeg'), img('B', 'image/png')], 'u1', 'a1', undefined, { communityBaseline: true },
    );
  });

  it('4 parts record 3 extra parts', async () => {
    await controller.scanReceipt(req, { images: [img(), img(), img(), img()] });
    expect(subs.trackAiUsage).toHaveBeenCalledWith('u1', 'ocr', 6.0, 'a1');
  });

  it('tier limit hit on the extra usage refuses and OCR is never called', async () => {
    subs.trackAiUsage.mockRejectedValue(new ForbiddenException('limit'));
    await expect(controller.scanReceipt(req, { images: [img(), img()] })).rejects.toBeInstanceOf(ForbiddenException);
    expect(ocr.parseReceiptParts).not.toHaveBeenCalled();
    // part 1 was charged by the guard; the scan never ran, so it is refunded (2.0 x balanced 1.0)
    expect(subs.refundAiUsage).toHaveBeenCalledWith('u1', 'ocr', 2.0, 'a1');
  });

  it('a non-limit error from the extra charge is rethrown without a refund', async () => {
    subs.trackAiUsage.mockRejectedValue(new Error('db'));
    await expect(controller.scanReceipt(req, { images: [img(), img()] })).rejects.toThrow('db');
    expect(subs.refundAiUsage).not.toHaveBeenCalled();
  });

  it('a non-coded Zod failure is a 400, not a raw ZodError', async () => {
    const err = await controller.scanReceipt(req, { images: 'x' }).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
  });

  it('picks the coded issue even when an earlier issue is not coded', async () => {
    const err = await controller.scanReceipt(req, { userPrompt: 5, images: [img()] }).catch((e) => e);
    expect(err.message).toBe('parts_count');
  });

  it.each([
    ['both fields', { imageBase64: 'A', images: [img(), img()] }, 'image_or_images'],
    ['neither', {}, 'image_or_images'],
    ['PDF in images', { images: [img('A'), img('B', 'application/pdf')] }, 'parts_with_pdf'],
    ['1 part', { images: [img()] }, 'parts_count'],
    ['5 parts', { images: [img(), img(), img(), img(), img()] }, 'parts_count'],
    ['empty part', { images: [img(), img('')] }, 'parts_empty'],
    ['bad mime', { images: [img(), img('B', 'image/tiff')] }, 'parts_mime'],
  ])('%s -> 400 %s', async (_n, body, code) => {
    const err = await controller.scanReceipt(req, body).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.message).toBe(code);
    expect(subs.trackAiUsage).not.toHaveBeenCalled();
    expect(subs.refundAiUsage).toHaveBeenCalledWith('u1', 'ocr', 2.0, 'a1');
  });

  it.each([
    [{ imageBase64: 'A' }, true],
    [{ images: [img(), img('B', 'image/webp')] }, true],
    [{ imageBase64: 'A', images: [img(), img()] }, false],
    [{}, false],
    [{ images: [img(), img('B', 'application/pdf')] }, false],
    [{ images: [img()] }, false],
    [{ images: [img(), img('B', 'image/tiff')] }, false],
  ])('both schema copies agree on %j', (body, ok) => {
    expect(ApiSchema.safeParse(body).success).toBe(ok);
    expect(SharedSchema.safeParse(body).success).toBe(ok);
  });
});
