import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { botClientRequestId, parseGroupCommand, truncateCodePoints } from './group-bot';
import { CreateGroupExpenseDto } from './dto';

describe('parseGroupCommand (ABA-658)', () => {
  it('reads an amount and a description, leaving the currency to the group', () => {
    expect(parseGroupCommand('120 pizza')).toEqual({ amount: 120, currencyCode: null, description: 'pizza' });
    expect(parseGroupCommand('12,5')).toEqual({ amount: 12.5, currencyCode: null, description: '' });
  });

  it('reads a currency as a symbol or a code in any case', () => {
    expect(parseGroupCommand('€25 taxi')).toMatchObject({ amount: 25, currencyCode: 'EUR', description: 'taxi' });
    expect(parseGroupCommand('25€ taxi')).toMatchObject({ currencyCode: 'EUR' });
    expect(parseGroupCommand('25 eur taxi')).toMatchObject({ currencyCode: 'EUR', description: 'taxi' });
    expect(parseGroupCommand('40 zł obiad')).toMatchObject({ currencyCode: 'PLN', description: 'obiad' });
    expect(parseGroupCommand('10 Br')).toMatchObject({ currencyCode: 'BYN' });
  });

  it('treats unknown upper-case codes as a currency (to be refused) but keeps lower-case words', () => {
    expect(parseGroupCommand('25 CHF fondue')).toMatchObject({ currencyCode: 'CHF', description: 'fondue' });
    expect(parseGroupCommand('25 tea and cake')).toMatchObject({ currencyCode: null, description: 'tea and cake' });
    expect(parseGroupCommand('5 Bread')).toMatchObject({ currencyCode: null, description: 'Bread' });
  });

  it('refuses a missing, zero, over-precise or too-large amount', () => {
    expect(parseGroupCommand('pizza')).toBeNull();
    expect(parseGroupCommand('0 pizza')).toBeNull();
    expect(parseGroupCommand('1.234 pizza')).toBeNull();
    expect(parseGroupCommand('1000001 pizza')).toBeNull();
  });

  it('cuts the description to the 120-character column', () => {
    expect(parseGroupCommand(`5 ${'x'.repeat(300)}`)!.description).toHaveLength(120);
  });
});

describe('truncateCodePoints', () => {
  it('never splits a surrogate pair at the boundary', () => {
    const s = 'a'.repeat(119) + '😀' + 'tail';
    const cut = truncateCodePoints(s, 120);
    expect(Array.from(cut)).toHaveLength(120);
    expect(cut.endsWith('😀')).toBe(true);
    // A naive slice(0, 120) would leave a lone high surrogate.
    expect(s.slice(0, 120).charCodeAt(119)).toBeGreaterThanOrEqual(0xd800);
    expect(/[\ud800-\udbff](?![\udc00-\udfff])/.test(cut)).toBe(false);
  });

  it('is applied to the parsed description', () => {
    const d = parseGroupCommand(`5 ${'a'.repeat(119)}😀😀`)!.description;
    expect(Array.from(d)).toHaveLength(120);
    expect(/[\ud800-\udbff](?![\udc00-\udfff])/.test(d)).toBe(false);
  });
});

describe('botClientRequestId', () => {
  const args = ['wa:grp', 'wamid.HBgLNDg1MDA2MDA3MDAVAgASGBQzQTNCRjZDNjQ5', 'user-1', 'group-1'] as const;

  it('is stable, namespaced with bot: and fits the DTO (8..64 characters)', () => {
    const a = botClientRequestId(...args);
    expect(a).toBe(botClientRequestId(...args));
    expect(a.startsWith('bot:')).toBe(true);
    expect(a.length).toBeGreaterThanOrEqual(8);
    expect(a.length).toBeLessThanOrEqual(64);
  });

  it('differs by platform, user and group (one message id cannot address two groups or users)', () => {
    const a = botClientRequestId(...args);
    expect(botClientRequestId('slack:grp', args[1], args[2], args[3])).not.toBe(a);
    expect(botClientRequestId(args[0], args[1], 'user-2', args[3])).not.toBe(a);
    expect(botClientRequestId(args[0], args[1], args[2], 'group-2')).not.toBe(a);
  });

  it('cannot be produced by the app DTO', async () => {
    const dto = (id: string) =>
      plainToInstance(CreateGroupExpenseDto, { clientRequestId: id, description: 'x', amount: 1 });
    const errs = await validate(dto(botClientRequestId(...args)), { skipMissingProperties: true });
    expect(errs.some((e) => e.property === 'clientRequestId')).toBe(true);
    const ok = await validate(dto('client-uuid-0001'), { skipMissingProperties: true });
    expect(ok.some((e) => e.property === 'clientRequestId')).toBe(false);
  });
});
