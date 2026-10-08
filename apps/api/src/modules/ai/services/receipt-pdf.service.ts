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

  /** `dpi` is kept for callers but ignored: output size is bounded by `-scale-to` instead. */
  async renderToPngs(pdfBuffer: Buffer, _dpi = 300, maxPages = 4): Promise<Buffer[]> {
    const dir = await mkdtemp(join(tmpdir(), 'ocr-pdf-'));
    const inPath = join(dir, 'in.pdf');
    const outPrefix = join(dir, 'page');
    await writeFile(inPath, pdfBuffer);
    try {
      const args = ['-png', '-scale-to', String(PDFTOPPM_SCALE_TO), '-f', '1', '-l', String(maxPages), inPath, outPrefix];
      await new Promise<void>((resolve, reject) => {
        const p = spawn('pdftoppm', args);
        let stderr = '';
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          p.kill('SIGKILL');
          reject(new Error(`pdftoppm timed out after ${PDFTOPPM_TIMEOUT_MS} ms`));
        }, PDFTOPPM_TIMEOUT_MS);
        p.stderr.on('data', (d) => { if (stderr.length < 4000) stderr += d.toString(); });
        p.on('error', (err) => {
          clearTimeout(timer);
          if (!settled) { settled = true; reject(err); }
        });
        p.on('close', (code) => {
          clearTimeout(timer);
          if (settled) return;
          settled = true;
          if (code === 0) resolve();
          else reject(new Error(`pdftoppm exited ${code}: ${stderr.trim()}`));
        });
      });
      const files = (await readdir(dir))
        .filter((f) => f.startsWith('page') && f.endsWith('.png'))
        .sort();
      const pngs: Buffer[] = [];
      for (const f of files) pngs.push(await readFile(join(dir, f)));
      return pngs;
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
