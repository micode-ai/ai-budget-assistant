import 'reflect-metadata';
import { validate, ValidationError } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ReplaceUserPaymentMethodsDto } from './index';

/**
 * Direct class-validator tests against the DTO — these isolate each decorator's own
 * constraint key from the others, which the HTTP-level (supertest) tests in
 * users.controller.spec.ts cannot: `SettleMethod` has exactly 5 values, so ANY array
 * longer than 5 necessarily also contains a duplicate `method` (pigeonhole) — a plain
 * "expect 400" HTTP test can't tell whether `ArrayMaxSize` or `ArrayUnique` caught it.
 * Recursing into every ValidationError's `constraints` + `children` and collecting the
 * constraint keys lets each test assert the SPECIFIC decorator fired, independent of
 * whatever else also fired on the same payload.
 */
function flattenConstraintKeys(errors: ValidationError[]): string[] {
  const keys: string[] = [];
  for (const e of errors) {
    if (e.constraints) keys.push(...Object.keys(e.constraints));
    if (e.children?.length) keys.push(...flattenConstraintKeys(e.children));
  }
  return keys;
}

describe('ReplaceUserPaymentMethodsDto — class-validator decorators (isolated per-constraint)', () => {
  it('passes validation for a valid, distinct, in-limit list', async () => {
    const dto = plainToInstance(ReplaceUserPaymentMethodsDto, {
      paymentMethods: [
        { method: 'revolut', handle: 'rev-handle' },
        { method: 'blik', handle: '+48 123 456 789' },
      ],
    });
    const errors = await validate(dto);
    expect(errors).toEqual([]);
  });

  it('passes validation for an empty list', async () => {
    const dto = plainToInstance(ReplaceUserPaymentMethodsDto, { paymentMethods: [] });
    const errors = await validate(dto);
    expect(errors).toEqual([]);
  });

  it('flags more than 5 entries with an arrayMaxSize constraint', async () => {
    const dto = plainToInstance(ReplaceUserPaymentMethodsDto, {
      paymentMethods: [
        { method: 'revolut', handle: 'h1' },
        { method: 'paypal', handle: 'h2' },
        { method: 'blik', handle: 'h3' },
        { method: 'cash', handle: 'h4' },
        { method: 'other', handle: 'h5' },
        // A 6th entry can't use a 6th distinct SettleMethod (there are only 5), so this
        // payload ALSO trips ArrayUnique — that's fine, this test only asserts
        // arrayMaxSize is among the reported constraints, not that it's the only one.
        { method: 'revolut', handle: 'h6' },
      ],
    });
    const errors = await validate(dto);
    expect(flattenConstraintKeys(errors)).toContain('arrayMaxSize');
  });

  it('flags a duplicate method with an arrayUnique constraint', async () => {
    const dto = plainToInstance(ReplaceUserPaymentMethodsDto, {
      paymentMethods: [
        { method: 'revolut', handle: 'h1' },
        { method: 'revolut', handle: 'h2' },
      ],
    });
    const errors = await validate(dto);
    expect(flattenConstraintKeys(errors)).toContain('arrayUnique');
  });

  it('flags a malformed handle (disallowed characters) with a matches constraint', async () => {
    const dto = plainToInstance(ReplaceUserPaymentMethodsDto, {
      paymentMethods: [{ method: 'revolut', handle: '<script>alert(1)</script>' }],
    });
    const errors = await validate(dto);
    expect(flattenConstraintKeys(errors)).toContain('matches');
  });

  it('flags an unknown method value with an isIn constraint', async () => {
    const dto = plainToInstance(ReplaceUserPaymentMethodsDto, {
      paymentMethods: [{ method: 'venmo', handle: 'h1' }],
    });
    const errors = await validate(dto);
    expect(flattenConstraintKeys(errors)).toContain('isIn');
  });
});
