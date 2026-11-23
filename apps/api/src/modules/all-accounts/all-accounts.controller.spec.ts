import { BadRequestException } from '@nestjs/common';
import { AllAccountsController, parsePeriod } from './all-accounts.controller';

describe('parsePeriod', () => {
  it('accepts a single day', () => {
    expect(parsePeriod('2026-11-01', '2026-11-01')).toEqual({ start: '2026-11-01', end: '2026-11-01' });
  });
  it('rejects a reversed range', () => {
    expect(() => parsePeriod('2026-11-02', '2026-11-01')).toThrow(BadRequestException);
  });
  it('rejects a span over 1096 days', () => {
    expect(() => parsePeriod('2023-01-01', '2026-11-30')).toThrow(BadRequestException);
  });
  it('rejects an impossible or malformed date', () => {
    expect(() => parsePeriod('2026-13-01', '2026-11-30')).toThrow(BadRequestException);
    expect(() => parsePeriod('2026-02-30', '2026-03-30')).toThrow(BadRequestException);
    expect(() => parsePeriod(undefined, '2026-11-30')).toThrow(BadRequestException);
  });
});

describe('AllAccountsController', () => {
  it('passes the user display currency (default USD) and a capped exclude list', async () => {
    const service: any = { getAnalytics: jest.fn().mockResolvedValue({}) };
    const c = new AllAccountsController(service, {} as any);
    await c.analytics({ user: { id: 'u', currencyCode: '' } } as any, '2026-11-01', '2026-11-30', 'a, b,,c');
    expect(service.getAnalytics).toHaveBeenCalledWith(
      { id: 'u', currencyCode: 'USD' },
      { start: '2026-11-01', end: '2026-11-30', exclude: ['a', 'b', 'c'], onlyAccountIds: null, groupId: null },
    );
    const many = Array.from({ length: 150 }, (_, i) => `id${i}`).join(',');
    await c.analytics({ user: { id: 'u', currencyCode: 'PLN' } } as any, '2026-11-01', '2026-11-30', many);
    expect(service.getAnalytics.mock.calls[1][1].exclude).toHaveLength(100);
  });
});
