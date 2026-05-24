import { PDFParse } from 'pdf-parse';

/** True if the buffer looks like a PDF (starts with the %PDF- magic header). */
export function isPdfBuffer(buf: Buffer): boolean {
  return buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-';
}

/** Extract the plain-text layer from a PDF buffer (bank statements). */
export async function extractPdfText(buf: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buf });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}
