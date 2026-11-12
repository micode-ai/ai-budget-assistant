import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateDeveloperAppDto, UpdateDeveloperAppDto } from './developer-app.dto';

const base = { name: 'Ledger Sync', homepageUrl: 'https://ledger.example.com', redirectUris: ['https://ledger.example.com/cb'] };

function errorsOf(cls: any, body: object): string[] {
  return validateSync(plainToInstance(cls, body) as object, { whitelist: true, forbidNonWhitelisted: true }).flatMap(
    (e) => Object.values(e.constraints ?? {}),
  );
}

describe('developer app DTOs', () => {
  it('accepts a normal app', () => {
    expect(errorsOf(CreateDeveloperAppDto, base)).toEqual([]);
    expect(errorsOf(CreateDeveloperAppDto, { ...base, name: 'Księgowość Plus', description: 'Syncs expenses.' })).toEqual([]);
  });

  it.each(['Ledger\nSync', 'Ledger\rSync', 'Led\tger', 'Ledger\u0000', 'Ledger\u2028Sync', 'Ledger\u202ESync'])(
    'rejects control characters / line breaks in the name (%j) with app_name_invalid_characters',
    (name) => {
      expect(errorsOf(CreateDeveloperAppDto, { ...base, name }).join(' ')).toContain('app_name_invalid_characters');
    },
  );

  it('rejects control characters / line breaks in the description', () => {
    expect(errorsOf(CreateDeveloperAppDto, { ...base, description: 'line one\nline two' }).join(' ')).toContain(
      'app_description_invalid_characters',
    );
    expect(errorsOf(UpdateDeveloperAppDto, { description: 'x\u0007' }).join(' ')).toContain('app_description_invalid_characters');
  });

  it.each([
    'AI Budget',
    'ai budget',
    'AIBUDGET',
    'AI Budżet',
    'ai budzet',
    'A I  Budget',
    'AI-Budget',
    'AI Budget Connector',
    'MiCode',
    'micode tools',
    'Mi Code',
    'ÁI Búdget',
  ])('rejects the reserved name %j with app_name_reserved', (name) => {
    expect(errorsOf(CreateDeveloperAppDto, { ...base, name }).join(' ')).toContain('app_name_reserved');
    expect(errorsOf(UpdateDeveloperAppDto, { name }).join(' ')).toContain('app_name_reserved');
  });

  it.each(['My AI Budget helper', 'Budget AI', 'Ledger for AI Budget users'])('allows %j (does not start with a reserved name)', (name) => {
    expect(errorsOf(CreateDeveloperAppDto, { ...base, name })).toEqual([]);
  });

  it('an explicit null on a required field is a 400, never reaches Prisma', () => {
    for (const field of ['name', 'homepageUrl', 'redirectUris']) {
      expect(errorsOf(UpdateDeveloperAppDto, { [field]: null }).length).toBeGreaterThan(0);
    }
    // absent stays fine
    expect(errorsOf(UpdateDeveloperAppDto, {})).toEqual([]);
    expect(errorsOf(UpdateDeveloperAppDto, { name: 'Renamed' })).toEqual([]);
  });

  it('R13: create rejects a redirect URI with whitespace; update checks structure only (the service checks added URIs)', () => {
    expect(errorsOf(CreateDeveloperAppDto, { ...base, redirectUris: ['https://x.pl/c b'] }).join(' ')).toContain('redirect URI');
    expect(errorsOf(UpdateDeveloperAppDto, { redirectUris: ['https://x.pl/c b'] })).toEqual([]);
    expect(errorsOf(UpdateDeveloperAppDto, { redirectUris: ['http://x.pl/cb'] }).join(' ')).toContain('redirect URI');
    expect(errorsOf(UpdateDeveloperAppDto, { redirectUris: ['budget://cb'] }).join(' ')).toContain('redirect URI');
  });
});
