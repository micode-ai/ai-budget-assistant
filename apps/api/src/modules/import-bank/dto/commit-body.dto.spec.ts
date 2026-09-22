import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BankImportCommitBodyDto } from './index';
import { PARSERS } from '../parsers/registry';

describe('BankImportCommitBodyDto.bankId', () => {
  const errorsFor = async (bankId: string) =>
    validate(plainToInstance(BankImportCommitBodyDto, { rows: [], bankId }));

  it('accepts every registered parser id, competitor-app migrations included', async () => {
    for (const { id } of PARSERS) {
      expect(await errorsFor(id)).toHaveLength(0);
    }
    expect(PARSERS.map((p) => p.id)).toEqual(expect.arrayContaining(['monefy', 'wallet', 'moneymanager']));
  });

  it('rejects an id no parser has', async () => {
    expect((await errorsFor('not-a-bank')).length).toBeGreaterThan(0);
  });
});
