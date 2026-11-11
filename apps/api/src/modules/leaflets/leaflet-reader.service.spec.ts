import { ConfigService } from '@nestjs/config';
import { LeafletReaderService } from './leaflet-reader.service';
import { CANONICAL_NAME_RULES } from '../ai/prompts/canonical-name-rules';
import { LEAFLET_PAGE_FORMAT } from './leaflet-page.util';

const mockCreate = jest.fn();
jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

function reply(json: unknown) {
  return { choices: [{ message: { content: JSON.stringify(json) } }], usage: undefined };
}

describe('LeafletReaderService', () => {
  let reader: LeafletReaderService;
  const basket = [
    { name: 'Masło Łaciate 200g', count: 5 },
    { name: 'Mleko Łaciate 3,2% 1L', count: 3 },
  ];

  beforeEach(() => {
    mockCreate.mockReset();
    reader = new LeafletReaderService({ get: () => 'sk-test' } as unknown as ConfigService);
  });

  it('reader prompt contains CANONICAL_NAME_RULES and the numbered basket, and no price history', async () => {
    mockCreate.mockResolvedValue(reply({ chain: null, validFrom: null, validTo: null, items: [] }));
    await reader.readPage('aGVsbG8=', 'image/png', basket, 'PLN');

    const args = mockCreate.mock.calls[0][0];
    expect(args.model).toBe('gpt-4.1');
    expect(args.temperature).toBe(0);
    expect(args.response_format).toBe(LEAFLET_PAGE_FORMAT);
    const text: string = args.messages[0].content[0].text;
    expect(text).toContain(CANONICAL_NAME_RULES);
    expect(text).toContain('0: Masło Łaciate 200g');
    expect(text).toContain('1: Mleko Łaciate 3,2% 1L');
    expect(text).toMatch(/pack size/i);
    // No usual prices or purchase counts are ever sent.
    expect(text).not.toMatch(/\d+[.,]\d{2} ?(zł|PLN|EUR)/);
    expect(text).not.toMatch(/usual price|paid/i);
    expect(args.messages[0].content[1].image_url.url).toBe('data:image/png;base64,aGVsbG8=');
  });

  it('normalizes the model output and drops an out-of-range basket index', async () => {
    mockCreate.mockResolvedValue(
      reply({
        chain: 'Biedronka',
        validFrom: '2026-11-10',
        validTo: '2026-11-16',
        items: [
          { name: 'Masło', canonicalName: 'Masło Łaciate 200g', promoPrice: 4.99, regularPrice: 7.49, currencyCode: 'PLN', condition: null, validFrom: null, validTo: null, basketIndex: 0 },
          { name: 'Ser', canonicalName: 'Ser Gouda', promoPrice: 9.99, regularPrice: null, currencyCode: 'PLN', condition: null, validFrom: null, validTo: null, basketIndex: 7 },
        ],
      }),
    );
    const page = await reader.readPage('x', 'image/jpeg', basket, 'PLN');
    expect(page.readable).toBe(true);
    expect(page.items.map((i) => i.basketIndex)).toEqual([0, null]);
  });

  it('returns an unreadable page for non-JSON content', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'sorry' } }] });
    const page = await reader.readPage('x', 'image/jpeg', basket, 'PLN');
    expect(page.readable).toBe(false);
  });
});
