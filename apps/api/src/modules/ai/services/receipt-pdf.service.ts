import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFParse } from 'pdf-parse';

export interface PdfTextExtraction {
  text: string;
  meaningfulTextLength: number;
  /** Text-based PDFs get a cheap text-only GPT call; below this it's treated as scanned. */
  hasMeaningfulText: boolean;
}

/** Hard ceilings: an uploaded PDF is attacker-controlled (ABA-644 forwards mail attachments). */
export const PDF_TEXT_MAX_PAGES = 10;
export const PDF_TEXT_TIMEOUT_MS = 20_000;
export const PDFTOPPM_TIMEOUT_MS = 20_000;
/** Longest side of a rendered page, in pixels (pdftoppm `-scale-to`). */
export const PDFTOPPM_SCALE_TO = 2000;
/** Pages per pdftoppm spawn in `renderPageChunks` — each spawn gets its own PDFTOPPM_TIMEOUT_MS. */
export const PDF_RENDER_CHUNK_PAGES = 5;

/** Pages 1..`last` as inclusive `[first, last]` ranges of at most `size` pages. */
export function pageChunks(last: number, size: number = PDF_RENDER_CHUNK_PAGES): [number, number][] {
  const out: [number, number][] = [];
  for (let first = 1; first <= last; first += size) out.push([first, Math.min(last, first + size - 1)]);
  return out;
}

/**
 * PDF-specific IO for receipt scanning: text extraction (for text-based
 * statements) and page-to-PNG rendering (for scanned receipts, which need a
 * vision call). Owns no OpenAI calls — OcrService decides what prompt to
 * send with whatever this service hands back.
 */
@Injectable()
export class ReceiptPdfService {
  private readonly logger = new Logger(ReceiptPdfService.name);

  async extractText(pdfBuffer: Buffer): Promise<PdfTextExtraction> {
    const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
    let timer: NodeJS.Timeout | undefined;
    try {
      const textResult = await Promise.race([
        parser.getText({ first: PDF_TEXT_MAX_PAGES }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('PDF text extraction timed out')), PDF_TEXT_TIMEOUT_MS);
        }),
      ]);
      const trimmedText = textResult.text.trim();

      // Length only: the text is somebody's receipt and must not reach the logs.
      this.logger.debug(`[PDF] Extracted text length: ${trimmedText.length}`);

      // Strip pdf-parse page separators and whitespace to check for real content
      const meaningfulText = trimmedText.replace(/--\s*\d+\s+of\s+\d+\s*--/gi, '').trim();

      return {
        text: trimmedText,
        meaningfulTextLength: meaningfulText.length,
        hasMeaningfulText: meaningfulText.length >= 50,
      };
    } finally {
      if (timer) clearTimeout(timer);
      // A hung parse must not hang the destroy too.
      await Promise.race([parser.destroy(), new Promise((resolve) => setTimeout(resolve, 2_000).unref())]).catch(
        () => undefined,
      );
    }
  }

  /**
   * The document's page count, or null when the PDF cannot be parsed in time. Reads the
   * page tree only (no text or rendering); never throws. Used where pages beyond a render
   * cap must be reported rather than silently lost (leaflet PDFs).
   */
  async countPages(pdfBuffer: Buffer): Promise<number | null> {
    const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
    let timer: NodeJS.Timeout | undefined;
    try {
      const info = await Promise.race([
        parser.getInfo(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('PDF page count timed out')), PDF_TEXT_TIMEOUT_MS);
        }),
      ]);
      const total = info?.total;
      return typeof total === 'number' && Number.isInteger(total) && total >= 0 ? total : null;
    } catch (err) {
      this.logger.warn(`[PDF] Page count failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    } finally {
      if (timer) clearTimeout(timer);
      await Promise.race([parser.destroy(), new Promise((resolve) => setTimeout(resolve, 2_000).unref())]).catch(
        () => undefined,
      );
    }
  }

  /** `dpi` is kept for callers but ignored: output size is bounded by `-scale-to` instead. */
  async renderToPngs(pdfBuffer: Buffer, _dpi = 300, maxPages = 4): Promise<Buffer[]> {
    const dir = await mkdtemp(join(tmpdir(), 'ocr-pdf-'));
    const inPath = join(dir, 'in.pdf');
    const outPrefix = join(dir, 'page');
    await writeFile(inPath, pdfBuffer);
    try {
      await runPdftoppm(['-png', '-scale-to', String(PDFTOPPM_SCALE_TO), '-f', '1', '-l', String(maxPages), inPath, outPrefix]);
      return await readPngs(dir, 'page');
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /**
   * Pages 1..`lastPage` rendered PDF_RENDER_CHUNK_PAGES at a time — one pdftoppm spawn per chunk,
   * each with its own timeout — so a long document never needs one spawn to finish every page in
   * 20 s, nor holds every page's PNG at once. A chunk's files are read and deleted before the
   * next chunk is rendered; the caller should consume each chunk before asking for the next.
   * Stops early when a chunk comes back short (the document ended). A failing chunk rejects the
   * iteration after the chunks before it were yielded. Never touches `renderToPngs`' callers.
   */
  async *renderPageChunks(
    pdfBuffer: Buffer,
    lastPage: number,
    chunkSize: number = PDF_RENDER_CHUNK_PAGES,
  ): AsyncGenerator<Buffer[]> {
    const dir = await mkdtemp(join(tmpdir(), 'pdf-chunks-'));
    const inPath = join(dir, 'in.pdf');
    await writeFile(inPath, pdfBuffer);
    try {
      for (const [first, last] of pageChunks(lastPage, chunkSize)) {
        const prefix = `c${first}`;
        await runPdftoppm([
          '-png',
          '-scale-to',
          String(PDFTOPPM_SCALE_TO),
          '-f',
          String(first),
          '-l',
          String(last),
          inPath,
          join(dir, prefix),
        ]);
        const pngs = await readPngs(dir, `${prefix}-`, true);
        yield pngs;
        if (pngs.length < last - first + 1) return;
      }
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

/** Reads `<prefix>*.png` in `dir` in page order; with `remove`, deletes each file once read. */
async function readPngs(dir: string, prefix: string, remove = false): Promise<Buffer[]> {
  const files = (await readdir(dir)).filter((f) => f.startsWith(prefix) && f.endsWith('.png')).sort();
  const pngs: Buffer[] = [];
  for (const f of files) {
    pngs.push(await readFile(join(dir, f)));
    if (remove) await rm(join(dir, f), { force: true }).catch(() => undefined);
  }
  return pngs;
}

/** One pdftoppm run, killed and rejected after PDFTOPPM_TIMEOUT_MS. */
function runPdftoppm(args: string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const p = spawn('pdftoppm', args);
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      p.kill('SIGKILL');
      reject(new Error(`pdftoppm timed out after ${PDFTOPPM_TIMEOUT_MS} ms`));
    }, PDFTOPPM_TIMEOUT_MS);
    p.stderr.on('data', (d) => {
      if (stderr.length < 4000) stderr += d.toString();
    });
    p.on('error', (err) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code === 0) resolve();
      else reject(new Error(`pdftoppm exited ${code}: ${stderr.trim()}`));
    });
  });
}
