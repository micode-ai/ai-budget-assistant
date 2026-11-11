import { EventEmitter } from 'node:events';

const mockSpawn = jest.fn();
jest.mock('node:child_process', () => ({ spawn: (...a: unknown[]) => mockSpawn(...a) }));

const mockGetText = jest.fn();
const mockGetInfo = jest.fn();
const mockDestroy = jest.fn().mockResolvedValue(undefined);
jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation(() => ({ getText: mockGetText, getInfo: mockGetInfo, destroy: mockDestroy })),
}));

import { writeFileSync } from 'node:fs';
import {
  PDF_RENDER_CHUNK_PAGES,
  pageChunks,
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

describe('ReceiptPdfService.countPages', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the document page count and destroys the parser', async () => {
    mockGetInfo.mockResolvedValue({ total: 12 });
    await expect(new ReceiptPdfService().countPages(Buffer.from('%PDF'))).resolves.toBe(12);
    expect(mockDestroy).toHaveBeenCalled();
  });

  it('returns null instead of throwing when the PDF cannot be parsed', async () => {
    mockGetInfo.mockRejectedValue(new Error('bad pdf'));
    await expect(new ReceiptPdfService().countPages(Buffer.from('x'))).resolves.toBeNull();
    expect(mockDestroy).toHaveBeenCalled();
  });

  it('returns null for a nonsensical total', async () => {
    mockGetInfo.mockResolvedValue({ total: -1 });
    await expect(new ReceiptPdfService().countPages(Buffer.from('%PDF'))).resolves.toBeNull();
  });
});

describe('pageChunks', () => {
  it('splits 1..last into ranges of at most `size` pages', () => {
    expect(pageChunks(12, 5)).toEqual([
      [1, 5],
      [6, 10],
      [11, 12],
    ]);
    expect(pageChunks(10, 5)).toEqual([
      [1, 5],
      [6, 10],
    ]);
    expect(pageChunks(3, 5)).toEqual([[1, 3]]);
    expect(pageChunks(0, 5)).toEqual([]);
  });
});

describe('ReceiptPdfService.renderPageChunks', () => {
  beforeEach(() => jest.clearAllMocks());

  /** A fake pdftoppm that writes one PNG per page of its -f/-l range (up to `docPages`), or fails. */
  function fakePdftoppm(docPages: number, failOnCall?: number) {
    let call = 0;
    mockSpawn.mockImplementation((_cmd: string, args: string[]) => {
      call++;
      const proc = fakeProc();
      const first = Number(args[args.indexOf('-f') + 1]);
      const last = Number(args[args.indexOf('-l') + 1]);
      const prefix = args[args.length - 1];
      const failing = call === failOnCall;
      setImmediate(() => {
        if (failing) {
          proc.stderr.emit('data', Buffer.from('broken page'));
          proc.emit('close', 1);
          return;
        }
        for (let n = first; n <= Math.min(last, docPages); n++) {
          writeFileSync(`${prefix}-${String(n).padStart(2, '0')}.png`, `png${n}`);
        }
        proc.emit('close', 0);
      });
      return proc;
    });
  }

  async function collect(gen: AsyncGenerator<Buffer[]>): Promise<string[][]> {
    const out: string[][] = [];
    for await (const chunk of gen) out.push(chunk.map((b) => b.toString()));
    return out;
  }

  it('renders 12 pages as 5, 5 and 2, one pdftoppm spawn per chunk with its own -f/-l', async () => {
    fakePdftoppm(12);
    const chunks = await collect(new ReceiptPdfService().renderPageChunks(Buffer.from('%PDF'), 12));
    expect(PDF_RENDER_CHUNK_PAGES).toBe(5);
    expect(chunks.map((c) => c.length)).toEqual([5, 5, 2]);
    expect(chunks.flat()).toEqual(Array.from({ length: 12 }, (_, i) => `png${i + 1}`));
    const ranges = mockSpawn.mock.calls.map(([, args]: [string, string[]]) => [
      args[args.indexOf('-f') + 1],
      args[args.indexOf('-l') + 1],
    ]);
    expect(ranges).toEqual([
      ['1', '5'],
      ['6', '10'],
      ['11', '12'],
    ]);
    for (const [, args] of mockSpawn.mock.calls) expect(args).toEqual(expect.arrayContaining(['-scale-to', String(PDFTOPPM_SCALE_TO)]));
  });

  it('stops once a chunk comes back short — the document ended before `lastPage`', async () => {
    fakePdftoppm(7);
    const chunks = await collect(new ReceiptPdfService().renderPageChunks(Buffer.from('%PDF'), 15));
    expect(chunks.map((c) => c.length)).toEqual([5, 2]);
    expect(mockSpawn).toHaveBeenCalledTimes(2);
  });

  it('a failing chunk rejects after the chunks before it were handed over', async () => {
    fakePdftoppm(12, 2);
    const seen: number[] = [];
    const run = async () => {
      for await (const chunk of new ReceiptPdfService().renderPageChunks(Buffer.from('%PDF'), 12)) seen.push(chunk.length);
    };
    await expect(run()).rejects.toThrow(/exited 1: broken page/);
    expect(seen).toEqual([5]);
    expect(mockSpawn).toHaveBeenCalledTimes(2);
  });

  it('gives each chunk its own pdftoppm timeout', async () => {
    const realSetTimeout = global.setTimeout;
    const deadlines: number[] = [];
    const spy = jest.spyOn(global, 'setTimeout').mockImplementation(((fn: () => void, ms?: number, ...rest: unknown[]) => {
      if (ms === PDFTOPPM_TIMEOUT_MS) deadlines.push(ms);
      return realSetTimeout(fn, ms, ...rest);
    }) as unknown as typeof setTimeout);
    try {
      fakePdftoppm(12);
      await collect(new ReceiptPdfService().renderPageChunks(Buffer.from('%PDF'), 12));
      expect(deadlines).toHaveLength(3);
    } finally {
      spy.mockRestore();
    }
  });
});
