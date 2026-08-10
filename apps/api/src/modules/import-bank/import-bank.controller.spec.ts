import { ImportBankController } from './import-bank.controller';

describe('ImportBankController', () => {
  const service: any = {
    parsePreview: jest.fn().mockResolvedValue({ status: 'parsed' }),
    grantAiConsent: jest.fn().mockResolvedValue({ ok: true }),
  };
  const mapping: any = {};
  const controller = new ImportBankController(service, mapping);
  const req: any = { accountId: 'acc', accountRole: 'owner', user: { id: 'user' } };
  const file: any = { buffer: Buffer.from('x') };

  beforeEach(() => jest.clearAllMocks());

  // `useAi` was removed: a viewer can call preview (no ViewerBlockGuard), so
  // preview must never be able to grant AI-import consent — only the
  // dedicated, ViewerBlockGuard-protected POST /import/bank/ai-consent does.
  it('never forwards a useAi flag to the service', async () => {
    await controller.preview(req, file, {} as any);
    const opts = service.parsePreview.mock.calls[0][3];
    expect(opts).not.toHaveProperty('useAi');
  });

  it('records consent on the dedicated endpoint', async () => {
    await expect(controller.aiConsent(req)).resolves.toEqual({ ok: true });
    expect(service.grantAiConsent).toHaveBeenCalledWith('acc');
  });
});
