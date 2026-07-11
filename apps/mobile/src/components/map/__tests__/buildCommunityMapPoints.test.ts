import { buildCommunityMapPoints } from '../buildCommunityMapPoints';

const t = ((key: string) => (key === 'communityPrices.cheapest' ? 'Cheapest' : key)) as any;

describe('buildCommunityMapPoints', () => {
  it('maps points with coords and skips those without / null-island', () => {
    const points = buildCommunityMapPoints(
      [
        {
          merchantName: 'Lidl',
          lat: 52.2,
          lng: 21.0,
          medianPrice: 4.5,
          currencyCode: 'PLN',
          receiptCount: 8,
          isCheapest: true,
        },
        {
          merchantName: 'NullIsland',
          lat: 0,
          lng: 0,
          medianPrice: 3,
          currencyCode: 'PLN',
          receiptCount: 5,
          isCheapest: false,
        },
      ],
      t,
    );
    expect(points.map((p) => p.id)).toEqual(['Lidl']);
    expect(points[0].title).toBe('Lidl');
    expect(points[0].amountLabel).toContain('Cheapest');
  });

  it('does not append the cheapest label when isCheapest is false', () => {
    const points = buildCommunityMapPoints(
      [
        {
          merchantName: 'Biedronka',
          lat: 52.2,
          lng: 21.0,
          medianPrice: 4.5,
          currencyCode: 'PLN',
          receiptCount: 8,
          isCheapest: false,
        },
      ],
      t,
    );
    expect(points[0].amountLabel).not.toContain('Cheapest');
  });

  it('dedupes duplicate merchant names by appending an index suffix', () => {
    const points = buildCommunityMapPoints(
      [
        {
          merchantName: 'Biedronka',
          lat: 52.2,
          lng: 21.0,
          medianPrice: 4.5,
          currencyCode: 'PLN',
          receiptCount: 8,
          isCheapest: false,
        },
        {
          merchantName: 'Biedronka',
          lat: 52.3,
          lng: 21.1,
          medianPrice: 5.0,
          currencyCode: 'PLN',
          receiptCount: 3,
          isCheapest: false,
        },
      ],
      t,
    );
    expect(points.map((p) => p.id)).toEqual(['Biedronka', 'Biedronka-1']);
  });
});
