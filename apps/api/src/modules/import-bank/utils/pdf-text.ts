import { PDFParse } from 'pdf-parse';

/** True if the buffer looks like a PDF (starts with the %PDF- magic header). */
export function isPdfBuffer(buf: Buffer): boolean {
  return buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-';
}

/**
 * Extract the plain-text layer from a PDF buffer (bank statements).
 *
 * `pageJoiner` is `pdf-parse`'s own option name (`ParseParameters.pageJoiner`,
 * verified against the installed 2.4.5 — see `PDFParse.js` `getText()`): when
 * omitted/falsy it joins pages with a plain `"\n\n"` (today's behaviour,
 * unchanged for every existing caller — `detectPdfParser`, `erste.parser`,
 * `alior.parser` all keep reading exactly the text they read before this
 * parameter existed). Passing an explicit joiner (e.g. `'\f'`) appends it
 * after every page's text so callers who need real page boundaries can split
 * on it.
 */
export async function extractPdfText(buf: Buffer, pageJoiner?: string): Promise<string> {
  const parser = new PDFParse({ data: buf });
  try {
    const result = await parser.getText(pageJoiner ? { pageJoiner } : {});
    return result.text;
  } finally {
    await parser.destroy();
  }
}
