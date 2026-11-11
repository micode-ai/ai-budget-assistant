import { ConfigService } from '@nestjs/config';
import { LeafletPushMatchService } from './leaflet-push-match.service';
import type { ConfirmedPromo } from './community-promo.service';

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

function promo(canonicalName: string, over: Partial<ConfirmedPromo> = {}): ConfirmedPromo {
  return {
    key: `k-${canonicalName}`,
    chain: 'Biedronka',
    canonicalName,
    promoPrice: 4.99,
    currencyCode: 'PLN',
    condition: null,
    validFrom: '2026-11-10',
    validTo: '2026-11-16',
    ...over,
  };
}

describe('LeafletPushMatchService', () => {
  let service: LeafletPushMatchService;
  const basket = [
    { name: 'Masło Łaciate 200g', count: 5 },
    { name: 'Mleko Łaciate 3,2% 1L', count: 3 },
  ];
  const promos = [promo('Masło Łaciate 200g'), promo('Mleko Łaciate 3,2% 1L'), promo('Ser Gouda')];

  beforeEach(() => {
    mockCreate.mockReset();
    service = new LeafletPushMatchService({ get: () => 'sk-test' } as unknown as ConfigService);
  });

  it('makes one gpt-4.1-mini text call with both numbered lists and no prices paid', async () => {
    mockCreate.mockResolvedValue(reply({ pairs: [] }));
    await service.match(basket, promos);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const args = mockCreate.mock.calls[0][0];
    expect(args.model).toBe('gpt-4.1-mini');
    expect(args.temperature).toBe(0);
    const text: string = args.messages.map((m: { content: string }) => m.content).join('\n');
    expect(text).toContain('0: Masło Łaciate 200g');
    expect(text).toContain('1: Mleko Łaciate 3,2% 1L');
    expect(text).toContain('2: Ser Gouda');
    expect(text).toMatch(/pack size/i);
    expect(text).not.toMatch(/usual price|paid/i);
  });

  it('resolves valid pairs to the basket name', async () => {
    mockCreate.mockResolvedValue(
      reply({ pairs: [{ promoIndex: 0, basketIndex: 0 }, { promoIndex: 1, basketIndex: 1 }] }),
    );
    await expect(service.match(basket, promos)).resolves.toEqual([
      { promoIndex: 0, basketName: 'Masło Łaciate 200g' },
      { promoIndex: 1, basketName: 'Mleko Łaciate 3,2% 1L' },
    ]);
  });

  it('drops out-of-range, non-integer and duplicate pairs — never guesses', async () => {
    mockCreate.mockResolvedValue(
      reply({
        pairs: [
          { promoIndex: 0, basketIndex: 0 },
          { promoIndex: 7, basketIndex: 1 }, // promo out of range
          { promoIndex: 2, basketIndex: 9 }, // basket out of range
          { promoIndex: -1, basketIndex: 1 },
          { promoIndex: 1.5, basketIndex: 1 },
          { promoIndex: '1', basketIndex: 1 },
          { promoIndex: 0, basketIndex: 1 }, // promo 0 already used
          { promoIndex: 2, basketIndex: 0 }, // basket 0 already used
          { promoIndex: 1, basketIndex: null },
          { promoIndex: 1, basketIndex: 1 },
        ],
      }),
    );
    await expect(service.match(basket, promos)).resolves.toEqual([
      { promoIndex: 0, basketName: 'Masło Łaciate 200g' },
      { promoIndex: 1, basketName: 'Mleko Łaciate 3,2% 1L' },
    ]);
  });

  it('model error → [] (never "everything")', async () => {
    mockCreate.mockRejectedValue(new Error('boom'));
    await expect(service.match(basket, promos)).resolves.toEqual([]);
  });

  it('non-JSON or malformed content → []', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: 'not json' } }] });
    await expect(service.match(basket, promos)).resolves.toEqual([]);
    mockCreate.mockResolvedValue(reply({ pairs: 'all' }));
    await expect(service.match(basket, promos)).resolves.toEqual([]);
  });

  it('empty basket or no promos → [] without a model call', async () => {
    await expect(service.match([], promos)).resolves.toEqual([]);
    await expect(service.match(basket, [])).resolves.toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
