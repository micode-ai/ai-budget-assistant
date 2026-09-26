import { RealSalaryBriefPdf, BRIEF_LANGS } from '../real-salary-brief.pdf';
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

  it('refuses a response that is not ready', async () => {
    await expect(new RealSalaryBriefPdf().render({ ...DATA, status: 'no_salary_confirmed' }, 'en')).rejects.toThrow('not ready');
  });
});
