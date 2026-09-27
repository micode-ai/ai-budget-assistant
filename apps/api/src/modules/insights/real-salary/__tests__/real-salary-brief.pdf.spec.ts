import { RealSalaryBriefPdf, BRIEF_LANGS, sourcesLine } from '../real-salary-brief.pdf';
import type { RealSalaryResponse } from '@budget/shared-types';

const DATA: RealSalaryResponse = {
  status: 'ready', baseCurrency: 'PLN', country: 'PL', countryGuessed: false, dataMonth: '2026-08',
  nominalChangePct: 5, personalInflationPct: 8.3, realChangePct: -3, requiredRaisePct: 3.1,
  breakdown: [
    { division: 'CP01', weight: 0.4, ratePct: 8.3, source: 'receipts' },
    { division: 'CP04', weight: 0.6, ratePct: 5.1, source: 'official' },
  ],
  topDrivers: ['CP01', 'CP04'], fxApproximate: false, computedAt: '2026-09-26T10:00:00.000Z',
};

describe('RealSalaryBriefPdf', () => {
  it('renders a PDF in every app language (Cyrillic and Polish glyphs included)', async () => {
    const pdf = new RealSalaryBriefPdf();
    expect(BRIEF_LANGS).toEqual(['en', 'pl', 'de', 'es', 'fr', 'ru', 'ua', 'be', 'nl']);
    for (const lang of BRIEF_LANGS) {
      const buf = await pdf.render(DATA, lang);
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(buf.length).toBeGreaterThan(1500);
    }
  });

  it('falls back to English for an unknown language', async () => {
    const buf = await new RealSalaryBriefPdf().render(DATA, 'xx');
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('an inherited property name as the language falls back to English', async () => {
    const buf = await new RealSalaryBriefPdf().render(DATA, '__proto__');
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('a receipts-only brief renders and its sources line does not claim official data', async () => {
    const receiptsOnly: RealSalaryResponse = {
      ...DATA, dataMonth: null, breakdown: [{ division: 'CP01', weight: 1, ratePct: 8.3, source: 'receipts' }], topDrivers: ['CP01'],
    };
    const buf = await new RealSalaryBriefPdf().render(receiptsOnly, 'en');
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    for (const lang of BRIEF_LANGS) expect(sourcesLine(receiptsOnly, lang)).not.toContain('Eurostat');
    expect(sourcesLine(DATA, 'en')).toContain('Eurostat');
  });

  it('refuses a response that is not ready', async () => {
    await expect(new RealSalaryBriefPdf().render({ ...DATA, status: 'no_salary_confirmed' }, 'en')).rejects.toThrow('not ready');
  });
});
