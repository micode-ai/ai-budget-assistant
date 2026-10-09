import { EventEmitter } from 'node:events';

const mockSpawn = jest.fn();
jest.mock('node:child_process', () => ({ spawn: (...a: unknown[]) => mockSpawn(...a) }));

const mockGetText = jest.fn();
const mockDestroy = jest.fn().mockResolvedValue(undefined);
jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation(() => ({ getText: mockGetText, destroy: mockDestroy })),
}));

import {
  PDFTOPPM_SCALE_TO,
  PDFTOPPM_TIMEOUT_MS,
  PDF_TEXT_MAX_PAGES,
  PDF_TEXT_TIMEOUT_MS,
  ReceiptPdfService,
} from './receipt-pdf.service';

/**
 * renderToPngs writes the PDF to a real temp dir first; wait until it reaches spawn. Poll by wall
 * time, not by a fixed number of event-loop turns: on a slow disk (Windows, a loaded CI box) the
 * mkdtemp + writeFile can outlast 200 setImmediate turns, the test then emits `close` before the
 * service listens, and the test hangs until Jest's 5 s timeout.
 */
async function spawned(maxMs = 4000) {
  const start = Date.now();
  while (mockSpawn.mock.calls.length === 0 && Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, 5));
  }
  if (mockSpawn.mock.calls.length === 0) throw new Error('renderToPngs never reached spawn');
}

function fakeProc() {
  const p: any = new EventEmitter();
  p.stderr = new EventEmitter();
  p.kill = jest.fn();
  return p;
}

describe('ReceiptPdfService.extractText', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.useRealTimers());

  // M6: an attacker PDF with thousands of pages must not be parsed in full.
  it('limits getText to the first pages', async () => {
    mockGetText.mockResolvedValue({ text: 'x'.repeat(80) });
    const res = await new ReceiptPdfService().extractText(Buffer.from('%PDF'));
    expect(mockGetText).toHaveBeenCalledWith({ first: PDF_TEXT_MAX_PAGES });
    expect(res.hasMeaningfulText).toBe(true);
    expect(mockDestroy).toHaveBeenCalled();
  });

  it('rejects when parsing hangs past the timeout, and still destroys the parser', async () => {
    jest.useFakeTimers();
    mockGetText.mockReturnValue(new Promise(() => undefined));
    const pending = new ReceiptPdfService().extractText(Buffer.from('%PDF'));
    const assertion = expect(pending).rejects.toThrow(/timed out/);
    await jest.advanceTimersByTimeAsync(PDF_TEXT_TIMEOUT_MS + 1);
    await assertion;
    expect(mockDestroy).toHaveBeenCalled();
  });

  // M6: the text is somebody's receipt; only its length may be logged.
  it('never logs the extracted text, only its length at debug level', async () => {
    const secret = 'IBAN PL61109010140000071219812874 TOTAL 99.99';
    mockGetText.mockResolvedValue({ text: secret });
    const svc = new ReceiptPdfService();
    const sinks = ['log', 'debug', 'warn', 'error', 'verbose'].map((m) => jest.spyOn((svc as any).logger, m).mockImplementation());
    await svc.extractText(Buffer.from('%PDF'));
    const logged = sinks.flatMap((s) => s.mock.calls.map((c) => String(c[0]))).join('\n');
    expect(logged).not.toContain('IBAN');
    expect(logged).not.toContain('99.99');
    expect(logged).toContain(String(secret.length));
    expect((svc as any).logger.log).not.toHaveBeenCalled();
  });
});

describe('ReceiptPdfService.renderToPngs', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.useRealTimers());

  it('bounds the output size with -scale-to (not an unbounded -r dpi)', async () => {
    const proc = fakeProc();
    mockSpawn.mockReturnValue(proc);
    const pending = new ReceiptPdfService().renderToPngs(Buffer.from('%PDF'));
    await spawned();
    proc.emit('close', 0);
    await pending;
    const args: string[] = mockSpawn.mock.calls[0][1];
    expect(mockSpawn.mock.calls[0][0]).toBe('pdftoppm');
    expect(args).toEqual(expect.arrayContaining(['-scale-to', String(PDFTOPPM_SCALE_TO), '-l', '4']));
    expect(args).not.toContain('-r');
  });

  it('kills pdftoppm and rejects after the timeout', async () => {
    // Collapse only the pdftoppm deadline to 0 ms; everything else keeps real timing.
    const realSetTimeout = global.setTimeout;
    const spy = jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void, ms?: number, ...rest: unknown[]) =>
      realSetTimeout(fn, ms === PDFTOPPM_TIMEOUT_MS ? 0 : ms, ...rest)) as unknown as typeof setTimeout);
    try {
      const proc = fakeProc();
      mockSpawn.mockReturnValue(proc);
      await expect(new ReceiptPdfService().renderToPngs(Buffer.from('%PDF'))).rejects.toThrow(/timed out/);
      expect(proc.kill).toHaveBeenCalledWith('SIGKILL');
    } finally {
      spy.mockRestore();
    }
  });

  it('rejects on a non-zero exit', async () => {
    const proc = fakeProc();
    mockSpawn.mockReturnValue(proc);
    const pending = new ReceiptPdfService().renderToPngs(Buffer.from('%PDF'));
    await spawned();
    proc.stderr.emit('data', Buffer.from('boom'));
    proc.emit('close', 1);
    await expect(pending).rejects.toThrow(/exited 1: boom/);
  });
});
