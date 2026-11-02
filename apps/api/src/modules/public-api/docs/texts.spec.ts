import type { OpenAPIObject } from '@nestjs/swagger';
import { PUBLIC_SCOPES } from '../../oauth/oauth-scopes';
import { OAUTH_TOKEN_ERROR_CODES } from '../../oauth/oauth-token.service';
import { PUBLIC_API_ERROR_CODES } from '../public-api-error';
import { DOC_LANGS, DOC_TEXTS, NON_DOCUMENT_TEXT_KEYS, readGuide, textSlots, type DocLang } from './openapi';
import { buildTestStructure } from './openapi.test-utils';

/**
 * The three documents may differ in words only (spec §11). These tests fail — listing the keys —
 * when a language misses a text, when a text no longer matches anything in the document, or when
 * a guide drops a fact an integrator depends on.
 */
describe('public docs texts', () => {
  let structure: OpenAPIObject;

  beforeAll(async () => {
    ({ structure } = await buildTestStructure());
  }, 120_000);

  const keysOf = (lang: DocLang) => Object.keys(DOC_TEXTS[lang]).sort();

  it('en, pl and ru have identical key sets', () => {
    for (const lang of DOC_LANGS) {
      const onlyHere = keysOf(lang).filter((k) => !(k in DOC_TEXTS.en));
      const missingHere = keysOf('en').filter((k) => !(k in DOC_TEXTS[lang]));
      expect({ lang, onlyHere, missingHere }).toEqual({ lang, onlyHere: [], missingHere: [] });
    }
  });

  it.each(DOC_LANGS)('%s has a text for every operation, parameter, response, schema field and scope', (lang) => {
    const missing = [...new Set(textSlots(structure).map((s) => s.key))].filter((k) => DOC_TEXTS[lang][k] === undefined);
    expect(missing).toEqual([]);
  });

  it.each(DOC_LANGS)('%s has no stale key (every key fills a slot of the document)', (lang) => {
    const slots = new Set<string>([...textSlots(structure).map((s) => s.key), ...NON_DOCUMENT_TEXT_KEYS]);
    expect(keysOf(lang).filter((k) => !slots.has(k))).toEqual([]);
  });

  it('every operation has a summary and a description key (spot check of the slot walker)', () => {
    const keys = new Set(textSlots(structure).map((s) => s.key));
    for (const id of ['listExpenses', 'createExpense', 'listExpenseChanges', 'issueToken']) {
      expect(keys.has(`op.${id}.summary`) && keys.has(`op.${id}.description`)).toBe(true);
    }
    for (const scope of PUBLIC_SCOPES) expect(keys.has(`scope.${scope}`)).toBe(true);
    expect(keys.has('schema.PublicExpense.amount')).toBe(true);
    expect(keys.has('op.listExpenses.param.cursor')).toBe(true);
    expect(keys.has('error.public.401')).toBe(true);
  });

  it.each(DOC_LANGS)('%s texts are non-empty', (lang) => {
    expect(Object.entries(DOC_TEXTS[lang]).filter(([, v]) => !v.trim()).map(([k]) => k)).toEqual([]);
  });

  it('pl and ru are translated, not copies of the English text', () => {
    // Texts that are the same in every language on purpose (a product name).
    const sameEverywhere = new Set(['info.title']);
    for (const lang of ['pl', 'ru'] as const) {
      const copied = Object.keys(DOC_TEXTS.en).filter((k) => !sameEverywhere.has(k) && DOC_TEXTS[lang][k] === DOC_TEXTS.en[k]);
      expect({ lang, copied }).toEqual({ lang, copied: [] });
    }
    const noCyrillic = Object.entries(DOC_TEXTS.ru).filter(([k, v]) => !sameEverywhere.has(k) && !/[а-яё]/i.test(v)).map(([k]) => k);
    expect(noCyrillic).toEqual([]);
  });

  describe('guides', () => {
    const codeBlocks = (md: string) => md.match(/```[\s\S]*?```/g) ?? [];

    it.each(DOC_LANGS)('%s guide states the facts integrators depend on', (lang) => {
      const guide = readGuide(lang);
      const required = [
        'https://app.ai-budget.pl/authorize',
        'https://api.ai-budget.pl/oauth/token',
        'https://api.ai-budget.pl/public/v1/expenses',
        '/public/v1/expenses/changes',
        'response_type=code',
        'code_challenge_method=S256',
        'Idempotency-Key',
        'X-Account-Id',
        'account_ids',
        '/public/v1/accounts',
        'encrypted_fields',
        'next_cursor',
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'Retry-After',
        ...PUBLIC_SCOPES,
        ...PUBLIC_API_ERROR_CODES,
        ...OAUTH_TOKEN_ERROR_CODES,
      ];
      expect(required.filter((fact) => !guide.includes(fact))).toEqual([]);
    });

    it('code samples are identical in every language', () => {
      const en = codeBlocks(readGuide('en'));
      expect(en.length).toBeGreaterThanOrEqual(4);
      for (const lang of DOC_LANGS) expect(codeBlocks(readGuide(lang))).toEqual(en);
    });

    it('guides have the same section structure', () => {
      const headings = (md: string) => (md.match(/^#{1,4} /gm) ?? []).join('');
      for (const lang of DOC_LANGS) expect(headings(readGuide(lang))).toBe(headings(readGuide('en')));
    });
  });
});
