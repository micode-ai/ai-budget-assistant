import { buildCorrectionNote, withCorrection } from './receipt-reconcile';

/**
 * These fixtures are the real failing reading from production (Biedronka,
 * 2026-08-28): every footer figure correct, the line items 116.81 over.
 */
const FAILED_READING = {
  items: [
    { totalPrice: 104.9 },
    { totalPrice: 18.76 },
    { totalPrice: 292.97 },
  ],
  discount: 70.34,
  deposit: 4.5,
  subtotal: 299.82,
  total: 233.98,
};

describe('buildCorrectionNote', () => {
  it('tells the model the sum it produced and the total it had to reconcile with', () => {
    const note = buildCorrectionNote(FAILED_READING, 36.5);

    expect(note).toContain('416.63');
    expect(note).toContain('233.98');
    expect(note).toContain('70.34');
    expect(note).toContain('4.50');
  });

  it('quotes the receipt subtotal back when the model reported one, since that is the number its own lines contradict', () => {
    // The failing reading had subtotal 299.82 — exactly right — while its
    // items summed to 416.63. Naming that contradiction is the whole point.
    expect(buildCorrectionNote(FAILED_READING, 36.5)).toContain('299.82');
  });

  it('omits the subtotal sentence when the model did not report one', () => {
    const note = buildCorrectionNote({ ...FAILED_READING, subtotal: null }, 36.5);

    expect(note).not.toContain('299.82');
    expect(note).toContain('416.63');
  });

  it('points at the quantity column for a reading whose lines came out too high', () => {
    const note = buildCorrectionNote(FAILED_READING, 36.5).toLowerCase();

    expect(note).toContain('ilość');
    expect(note).toContain('quantity');
  });

  it('does not mutate the reading it was given', () => {
    const reading = { ...FAILED_READING, items: [...FAILED_READING.items] };
    const before = JSON.stringify(reading);

    buildCorrectionNote(reading, 36.5);

    expect(JSON.stringify(reading)).toBe(before);
  });
});

describe('withCorrection', () => {
  const NOTE = 'RE-READ: your lines summed to 416.63.';

  it('appends the note to a plain-text message without touching the original request', () => {
    const request = { model: 'gpt-4o', messages: [{ role: 'user', content: 'Extract this receipt.' }] };

    const corrected: any = withCorrection(request, NOTE);

    expect(corrected.messages[0].content).toContain('Extract this receipt.');
    expect(corrected.messages[0].content).toContain(NOTE);
    expect(request.messages[0].content).toBe('Extract this receipt.');
  });

  it('appends to the text part of a multi-part message, leaving the image part alone', () => {
    const request = {
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract this receipt.' },
            { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAA', detail: 'high' } },
          ],
        },
      ],
    };

    const corrected: any = withCorrection(request, NOTE);

    expect(corrected.messages[0].content[0].text).toContain(NOTE);
    expect(corrected.messages[0].content[1]).toEqual(request.messages[0].content[1]);
    expect((request.messages[0].content as any)[0].text).toBe('Extract this receipt.');
  });

  it('returns the request unchanged when there is no text part to correct', () => {
    const request = { model: 'gpt-4o', messages: [{ role: 'user', content: [{ type: 'image_url' }] }] };

    expect(withCorrection(request, NOTE)).toEqual(request);
  });

  it('preserves every other field of the request, so the retry asks the same question of the same model', () => {
    const request = {
      model: 'gpt-4o',
      max_tokens: 4096,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: 'Extract this receipt.' }],
    };

    const corrected: any = withCorrection(request, NOTE);

    expect(corrected.model).toBe('gpt-4o');
    expect(corrected.max_tokens).toBe(4096);
    expect(corrected.response_format).toEqual({ type: 'json_object' });
  });
});

/**
 * Yesterday's real failing reading (Biedronka, 2026-08-14, scanned 2026-08-27):
 * every quantity correct, seven of fifteen unit prices misread — 10,49 read as
 * 5,27 (the value of the `OPUST` row printed beneath that line), 9,59 as 5,99,
 * 3,49 as 3,99 (the price of the neighbouring line), 14,69 as 4,69 and 16,99 as
 * 6,99 (leading digit dropped). The lines come out SHORT of the receipt, which
 * is the opposite direction from the over-read that motivated the note.
 */
const UNDER_READING = {
  items: [{ totalPrice: 137.91 }],
  discount: 55.05,
  deposit: 1.0,
  total: 98.15,
};

describe('buildCorrectionNote — which column it points at', () => {
  it('blames the quantity column only when the lines over-read the receipt', () => {
    const note = buildCorrectionNote(FAILED_READING, 36.5);

    expect(note).toMatch(/Ilo/);
    expect(note).toContain('too high');
  });

  it('blames the price columns when the lines under-read it, since no pack multiplier can make a sum too small', () => {
    const note = buildCorrectionNote(UNDER_READING, 14.6);

    expect(note).toContain('too low');
    // The two ways a price comes out short, both seen in production.
    expect(note).toMatch(/leading digit/i);
    expect(note).toMatch(/OPUST/);
  });

  it('never tells the model its lines were too high when they were too low', () => {
    expect(buildCorrectionNote(UNDER_READING, 14.6)).not.toContain('too high');
    expect(buildCorrectionNote(FAILED_READING, 36.5)).not.toContain('too low');
  });
});
