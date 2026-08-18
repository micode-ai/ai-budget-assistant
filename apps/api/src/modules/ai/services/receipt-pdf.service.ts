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
    try {
      const textResult = await parser.getText();
      const trimmedText = textResult.text.trim();

      this.logger.log(`[PDF] Extracted text length: ${trimmedText.length}`);
      this.logger.log(`[PDF] Extracted text (first 500 chars): ${trimmedText.substring(0, 500)}`);

      // Strip pdf-parse page separators and whitespace to check for real content
      const meaningfulText = trimmedText.replace(/--\s*\d+\s+of\s+\d+\s*--/gi, '').trim();

      return {
        text: trimmedText,
        meaningfulTextLength: meaningfulText.length,
        hasMeaningfulText: meaningfulText.length >= 50,
      };
    } finally {
      await parser.destroy();
    }
  }

  async renderToPngs(pdfBuffer: Buffer, dpi = 300, maxPages = 4): Promise<Buffer[]> {
    const dir = await mkdtemp(join(tmpdir(), 'ocr-pdf-'));
    const inPath = join(dir, 'in.pdf');
    const outPrefix = join(dir, 'page');
    await writeFile(inPath, pdfBuffer);
    try {
      const args = ['-png', '-r', String(dpi), '-f', '1', '-l', String(maxPages), inPath, outPrefix];
      await new Promise<void>((resolve, reject) => {
        const p = spawn('pdftoppm', args);
        let stderr = '';
        p.stderr.on('data', (d) => { stderr += d.toString(); });
        p.on('error', reject);
        p.on('close', (code) => code === 0
          ? resolve()
          : reject(new Error(`pdftoppm exited ${code}: ${stderr.trim()}`)));
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
