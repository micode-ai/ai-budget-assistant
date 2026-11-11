import {
  LEAFLET_MAX_PAGES,
  LEAFLET_PDF_MAX_BYTES,
  LEAFLET_UPLOAD_MAX_BODY_BYTES,
  pdfUploadFailure,
  planLeafletPages,
} from '../leafletPages';

const img = (n: number, mimeType = 'image/jpeg') => ({ uri: `file:///p${n}.jpg`, mimeType, size: 200_000 });
const pdf = (size = 2_000_000, n = 0) => ({ uri: `file:///leaflet${n}.pdf`, mimeType: 'application/pdf', size });

describe('planLeafletPages', () => {
  it('keeps the first 10 images and counts the rest as dropped', () => {
    const files = Array.from({ length: 12 }, (_, i) => img(i));
    const plan = planLeafletPages(files);
    expect(LEAFLET_MAX_PAGES).toBe(10);
    expect(plan.pages).toHaveLength(10);
    expect(plan.pages.map((p) => p.uri)).toEqual(files.slice(0, 10).map((f) => f.uri));
    expect(plan.dropped).toBe(2);
    expect(plan.pdf).toBeNull();
    expect(plan.tooLargePdf).toBe(false);
  });

  it('ignores a PDF when images are present and counts it as dropped', () => {
    const plan = planLeafletPages([pdf(), img(1, 'image/png'), img(2)]);
    expect(plan.pages.map((p) => p.uri)).toEqual(['file:///p1.jpg', 'file:///p2.jpg']);
    expect(plan.pdf).toBeNull();
    expect(plan.dropped).toBe(1);
  });

  it('uses a single PDF when there are no images', () => {
    const only = pdf();
    const plan = planLeafletPages([only]);
    expect(plan.pages).toEqual([]);
    expect(plan.pdf).toBe(only);
    expect(plan.dropped).toBe(0);
    expect(plan.tooLargePdf).toBe(false);
  });

  it('uses only the first of several PDFs', () => {
    const plan = planLeafletPages([pdf(1000, 1), pdf(1000, 2)]);
    expect(plan.pdf?.uri).toBe('file:///leaflet1.pdf');
    expect(plan.dropped).toBe(1);
  });

  it('flags a PDF over the cap as too large and sends nothing', () => {
    const plan = planLeafletPages([pdf(11 * 1024 * 1024)]);
    expect(plan.tooLargePdf).toBe(true);
    expect(plan.pdf).toBeNull();
    expect(plan.pages).toEqual([]);
  });

  // The proxy refuses a body over 10 MB, and the PDF travels as base64 (4/3 of its size) inside
  // JSON: an 8 MB PDF used to pass the client check and fail with a generic error.
  it('caps a PDF on its ENCODED size, so the base64 body stays under the 10 MB proxy limit', () => {
    expect(LEAFLET_UPLOAD_MAX_BODY_BYTES).toBe(10 * 1024 * 1024);
    const encoded = Math.ceil(LEAFLET_PDF_MAX_BYTES / 3) * 4;
    expect(encoded + 64).toBeLessThan(LEAFLET_UPLOAD_MAX_BODY_BYTES);
    expect(LEAFLET_PDF_MAX_BYTES).toBeGreaterThan(7.3 * 1024 * 1024);
    expect(planLeafletPages([pdf(LEAFLET_PDF_MAX_BYTES)]).tooLargePdf).toBe(false);
    expect(planLeafletPages([pdf(8 * 1024 * 1024)]).tooLargePdf).toBe(true);
  });

  it('drops files that are neither images nor PDFs', () => {
    const plan = planLeafletPages([img(1), { uri: 'file:///a.txt', mimeType: 'text/plain', size: 10 }]);
    expect(plan.pages).toHaveLength(1);
    expect(plan.dropped).toBe(1);
  });

  it('plans nothing for no files', () => {
    expect(planLeafletPages([])).toEqual({ pages: [], pdf: null, dropped: 0, tooLargePdf: false });
  });
});

describe('pdfUploadFailure', () => {
  it('413 from the proxy or the API → too large ("share screenshots instead")', () => {
    expect(pdfUploadFailure({ status: 413 }, false)).toBe('too_large');
    expect(pdfUploadFailure({ status: 413, code: 'PDF_TOO_LARGE' }, true)).toBe('too_large');
    expect(pdfUploadFailure({ code: 'PDF_TOO_LARGE' }, false)).toBe('too_large');
  });

  it('on web an opaque TypeError (an nginx 413 carries no CORS headers) → too large', () => {
    expect(pdfUploadFailure(new TypeError('Failed to fetch'), true)).toBe('too_large');
    expect(pdfUploadFailure(new TypeError('Network request failed'), false)).toBeNull();
  });

  it('LEAFLET_LIMIT → limit (the paywall opens)', () => {
    expect(pdfUploadFailure({ status: 403, code: 'LEAFLET_LIMIT' }, false)).toBe('limit');
  });

  it('anything else is a plain failure', () => {
    expect(pdfUploadFailure({ status: 500 }, false)).toBeNull();
    expect(pdfUploadFailure({ status: 403, code: 'ENCRYPTED_ACCOUNT' }, true)).toBeNull();
    expect(pdfUploadFailure(new Error('x'), true)).toBeNull();
    expect(pdfUploadFailure(null, true)).toBeNull();
  });
});
