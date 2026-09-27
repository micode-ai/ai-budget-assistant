import { parseJsonStat, EurostatClient, EUROSTAT_URL } from '../eurostat.client';

const FIXTURE = {
  id: ['freq', 'unit', 'coicop18', 'geo', 'time'],
  size: [1, 1, 3, 3, 1],
  dimension: {
    freq: { category: { index: { M: 0 } } },
    unit: { category: { index: { RCH_A: 0 } } },
    coicop18: { category: { index: { TOTAL: 0, CP01: 1, CP13: 2 } } },
    geo: { category: { index: { PL: 0, EU27_2020: 1, UA: 2 } } },
    time: { category: { index: { '2026-08': 0 } } },
  },
  // flat index = ((coicop * 3) + geo) — freq/unit/time have size 1
  value: { '0': 3.5, '1': 2.4, '3': -0.8, '6': 3.2, '4': 1.9 },
};

describe('parseJsonStat', () => {
  it('reads country × division rows and skips aggregates, unknown countries and empty cells', () => {
    expect(parseJsonStat(FIXTURE)).toEqual([
      { country: 'PL', division: 'TOTAL', month: '2026-08', annualRatePct: 3.5 },
      { country: 'PL', division: 'CP01', month: '2026-08', annualRatePct: -0.8 },
      { country: 'PL', division: 'CP13', month: '2026-08', annualRatePct: 3.2 },
    ]);
  });

  it('accepts an array-form category index', () => {
    const arrayForm = {
      ...FIXTURE,
      dimension: { ...FIXTURE.dimension, coicop18: { category: { index: ['TOTAL', 'CP01', 'CP13'] } } },
    };
    expect(parseJsonStat(arrayForm)).toHaveLength(3);
  });

  it('returns [] for an error body or garbage', () => {
    expect(parseJsonStat({ error: [{ status: 404 }] })).toEqual([]);
    expect(parseJsonStat(null)).toEqual([]);
    expect(parseJsonStat({ id: ['geo'], size: [1] })).toEqual([]);
  });
});

describe('EurostatClient', () => {
  it('requests the COICOP 2018 dataset and parses the body', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, json: async () => FIXTURE });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await new EurostatClient().fetchLatest(fetchImpl as any);
    expect(rows).toHaveLength(3);
    const url: string = fetchImpl.mock.calls[0][0];
    expect(url.startsWith(EUROSTAT_URL)).toBe(true);
    expect(url).toContain('prc_hicp_minr');
    expect(url).toContain('unit=RCH_A');
    expect(url).toContain('coicop18=TOTAL');
    expect(url).toContain('coicop18=CP13');
    expect(url).toContain('lastTimePeriod=1');
  });

  it('throws on a non-2xx so the caller keeps its last stored month', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(new EurostatClient().fetchLatest(fetchImpl as any)).rejects.toThrow('503');
  });
});
