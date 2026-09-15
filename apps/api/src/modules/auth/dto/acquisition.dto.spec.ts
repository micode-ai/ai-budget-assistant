import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AcquisitionDto } from './index';

async function errorsFor(payload: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(AcquisitionDto, payload);
  const errors = await validate(dto);
  return errors.map((e) => e.property);
}

describe('AcquisitionDto.referrerRaw', () => {
  it('accepts a real Play referrer string, which the 20-char SAFE charset would reject', async () => {
    // Contains `=`, `&` and a dot — none of them allowed in src/loc/lang/plan.
    await expect(
      errorsFor({ referrerRaw: 'utm_source=google-play&utm_medium=organic&gclid=a.b_c' }),
    ).resolves.toEqual([]);
  });

  it('accepts the field being absent — most callers have no referrer', async () => {
    await expect(errorsFor({ src: 'blog' })).resolves.toEqual([]);
  });

  it('rejects a string over 200 characters rather than storing an unbounded blob', async () => {
    await expect(errorsFor({ referrerRaw: 'a'.repeat(201) })).resolves.toEqual(['referrerRaw']);
  });

  it('still holds the four label columns to the strict charset', async () => {
    await expect(errorsFor({ src: 'has space' })).resolves.toEqual(['src']);
  });
});
