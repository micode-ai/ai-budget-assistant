/**
 * Gazetka match: which of the files the user picked or shared actually get read.
 *
 * Pure, platform-free. Mirrors the server's page cap (`LEAFLET_PAGE_CAP` in
 * `apps/api/src/modules/leaflets/leaflets.service.ts`) so the client never sends a page the server
 * would refuse: images first, at most 10; a PDF only when there are no images (one PDF is a whole
 * leaflet, mixing it with screenshots would double-read it); a PDF over the cap is not sent at
 * all — the screen says "share screenshots instead".
 */

export const LEAFLET_MAX_PAGES = 10;
/** The proxy's request body limit for the API (`client_max_body_size 10M`, docs/ops/leaflets.md). */
export const LEAFLET_UPLOAD_MAX_BODY_BYTES = 10 * 1024 * 1024;
/**
 * The PDF is sent as base64 inside a JSON body, which is 4/3 of its size: the cap is on the
 * ENCODED size, so the request stays under the proxy's 10 MB with 64 KB to spare for the JSON
 * envelope and headers (~7.45 MB raw). The server keeps its own, looser 10 MB raw check.
 */
export const LEAFLET_PDF_MAX_BYTES = Math.floor(((LEAFLET_UPLOAD_MAX_BODY_BYTES - 64 * 1024) * 3) / 4);

export interface LeafletInputFile {
  uri: string;
  mimeType: string;
  size: number;
}

export interface LeafletPagePlan<F extends LeafletInputFile> {
  pages: F[];
  pdf: F | null;
  /** Files that will not be read: images past 10, PDFs beside images or a second PDF, other types. */
  dropped: number;
  tooLargePdf: boolean;
}

const isImage = (f: LeafletInputFile) => f.mimeType.startsWith('image/');
const isPdf = (f: LeafletInputFile) => f.mimeType === 'application/pdf';

export function planLeafletPages<F extends LeafletInputFile>(files: F[]): LeafletPagePlan<F> {
  const images = files.filter(isImage);
  const pdfs = files.filter(isPdf);
  const other = files.length - images.length - pdfs.length;

  if (images.length > 0) {
    const pages = images.slice(0, LEAFLET_MAX_PAGES);
    return { pages, pdf: null, dropped: images.length - pages.length + pdfs.length + other, tooLargePdf: false };
  }

  const first = pdfs[0] ?? null;
  const extraPdfs = Math.max(0, pdfs.length - 1);
  if (first && first.size > LEAFLET_PDF_MAX_BYTES) {
    return { pages: [], pdf: null, dropped: extraPdfs + other, tooLargePdf: true };
  }
  return { pages: [], pdf: first, dropped: extraPdfs + other, tooLargePdf: false };
}

/**
 * Why a PDF upload failed, when the screen has something better to say than "couldn't read it":
 * - `too_large`: a 413 (from nginx, before the API saw it, or the API's `PDF_TOO_LARGE`) → "share
 *   screenshots instead". On web an nginx 413 carries no CORS headers, so the browser reports it
 *   as an opaque `TypeError` — on THIS request only, that is read as too large too.
 * - `limit`: `LEAFLET_LIMIT` (no pages left this month) → the paywall.
 * - null: anything else.
 */
export function pdfUploadFailure(e: unknown, isWeb: boolean): 'too_large' | 'limit' | null {
  if (isWeb && e instanceof TypeError) return 'too_large';
  if (typeof e !== 'object' || e === null) return null;
  const { status, code } = e as { status?: number; code?: string };
  if (status === 413 || code === 'PDF_TOO_LARGE') return 'too_large';
  if (code === 'LEAFLET_LIMIT') return 'limit';
  return null;
}
