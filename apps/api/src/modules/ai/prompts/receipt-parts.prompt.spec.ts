import { RECEIPT_PARTS_INSTRUCTIONS } from './receipt-parts.prompt';

describe('RECEIPT_PARTS_INSTRUCTIONS', () => {
  it('states the overlap rule, the repeated-item rule and where header and totals come from', () => {
    const text = RECEIPT_PARTS_INSTRUCTIONS;
    expect(text).toContain('ONE receipt');
    expect(text).toMatch(/overlap/i);
    expect(text).toContain('keep genuinely repeated items');
    expect(text).toContain('header from the first part, totals from the last');
    expect(text).toMatch(/each purchased line once/i);
  });
});
