import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SendSupportMessageDto } from './index';

const check = (plain: object) => validate(plainToInstance(SendSupportMessageDto, plain));

describe('SendSupportMessageDto', () => {
  it('rejects a missing context', async () => {
    expect((await check({ body: 'Hi' })).length).toBeGreaterThan(0);
  });

  it('rejects a context without platform', async () => {
    expect((await check({ body: 'Hi', context: { appVersion: '1.0.0', locale: 'en' } })).length).toBeGreaterThan(0);
  });

  it('accepts a valid context', async () => {
    expect(await check({ body: ' Hi ', context: { appVersion: '1.0.0', platform: 'ios', locale: 'en' } })).toEqual([]);
  });
});
