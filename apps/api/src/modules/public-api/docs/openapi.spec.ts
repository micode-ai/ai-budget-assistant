import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject, OperationObject, ResponseObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { existsSync } from 'fs';
import * as request from 'supertest';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PublicApiEnabledGuard } from '../../oauth/guards/public-api-enabled.guard';
import { PUBLIC_SCOPES } from '../../oauth/oauth-scopes';
import { OAUTH_TOKEN_ERROR_CODES } from '../../oauth/oauth-token.service';
import { OAuthTokenController } from '../../oauth/oauth-token.controller';
import { PublicAccountController } from '../controllers/public-account.controller';
import { PublicAccountsController } from '../controllers/public-accounts.controller';
import { PublicCategoriesController } from '../controllers/public-categories.controller';
import { PublicExpensesController } from '../controllers/public-expenses.controller';
import { REQUIRE_SCOPES_KEY } from '../decorators/require-scopes.decorator';
import { TOKEN_ONLY_KEY } from '../decorators/token-only.decorator';
import { PUBLIC_API_ERROR_CODES } from '../public-api-error';
import {
  AUTHORIZE_URL,
  DOC_LANGS,
  TOKEN_URL,
  buildPublicOpenApi,
  pickDocsLang,
  setupPublicDocs,
} from './openapi';
import { buildTestStructure } from './openapi.test-utils';
import { PublicDocsController, createRedirectHtmlResolver } from './public-docs.controller';

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

function operations(doc: OpenAPIObject): Array<{ path: string; method: string; op: OperationObject }> {
  return Object.entries(doc.paths).flatMap(([path, item]) =>
    METHODS.filter((m) => item[m]).map((method) => ({ path, method, op: item[method] as OperationObject })),
  );
}

const errorRef = (op: OperationObject, status: number) =>
  ((op.responses[status] as ResponseObject | undefined)?.content?.['application/json']?.schema as { $ref?: string } | undefined)?.$ref;

describe('public OpenAPI document', () => {
  let app: INestApplication;
  let doc: OpenAPIObject;

  beforeAll(async () => {
    ({ app, structure: doc } = await buildTestStructure());
  }, 120_000);

  it('publishes only /public/v1/* plus /oauth/token and /oauth/revoke', () => {
    const paths = Object.keys(doc.paths);
    expect(paths.length).toBeGreaterThan(0);
    const outside = paths.filter((p) => !p.startsWith('/public/v1/') && p !== '/oauth/token' && p !== '/oauth/revoke');
    expect(outside).toEqual([]);
  });

  it('contains no api/v1 route and none of the internal OAuth routes', () => {
    const json = JSON.stringify(doc.paths);
    expect(json).not.toContain('/api/v1/');
    for (const internal of ['developer', 'connected-apps', 'authorize', '/public/docs']) {
      expect(Object.keys(doc.paths).filter((p) => p.includes(internal))).toEqual([]);
    }
  });

  it('documents exactly the public operations, each with an explicit operationId', () => {
    const ids = operations(doc).map((o) => o.op.operationId).sort();
    expect(ids).toEqual(
      [
        'createExpense',
        'deleteExpense',
        'getAccount',
        'getExpense',
        'getExpenseReceipt',
        'issueToken',
        'listAccounts',
        'listCategories',
        'listExpenseChanges',
        'listExpenses',
        'revokeToken',
        'updateExpense',
      ].sort(),
    );
  });

  it('every /public/v1 operation lists 400/401/403/404/429 with the shared error schema', () => {
    for (const { path, op } of operations(doc).filter((o) => o.path.startsWith('/public/v1/'))) {
      for (const status of [400, 401, 403, 404, 429]) {
        expect({ path, status, ref: errorRef(op, status) }).toEqual({
          path,
          status,
          ref: '#/components/schemas/PublicApiErrorResponse',
        });
      }
    }
  });

  it('the OAuth endpoints list their RFC 6749 errors with the shared OAuth error schema', () => {
    for (const { path, op } of operations(doc).filter((o) => o.path.startsWith('/oauth/'))) {
      for (const status of [400, 401, 404, 429]) {
        expect({ path, status, ref: errorRef(op, status) }).toEqual({
          path,
          status,
          ref: '#/components/schemas/OAuthErrorResponse',
        });
      }
    }
  });

  it('the error schemas enumerate exactly the codes the code can return', () => {
    const schemas = doc.components!.schemas as Record<string, { properties: Record<string, { enum?: string[] }> }>;
    expect(schemas.PublicApiErrorObject.properties.code.enum).toEqual([...PUBLIC_API_ERROR_CODES]);
    expect(schemas.OAuthErrorResponse.properties.error.enum).toEqual([...OAUTH_TOKEN_ERROR_CODES]);
  });

  it('declares the oauth2 authorization-code scheme with the real URLs and every scope', () => {
    const scheme = doc.components!.securitySchemes!.oauth2 as {
      type: string;
      flows: { authorizationCode: { authorizationUrl: string; tokenUrl: string; scopes: Record<string, string> } };
    };
    expect(scheme.type).toBe('oauth2');
    expect(scheme.flows.authorizationCode.authorizationUrl).toBe(AUTHORIZE_URL);
    expect(AUTHORIZE_URL).toBe('https://app.ai-budget.pl/authorize');
    expect(scheme.flows.authorizationCode.tokenUrl).toBe(TOKEN_URL);
    expect(TOKEN_URL).toBe('https://api.ai-budget.pl/oauth/token');
    expect(Object.keys(scheme.flows.authorizationCode.scopes).sort()).toEqual([...PUBLIC_SCOPES].sort());
  });

  it('each operation publishes exactly the scopes its route enforces', () => {
    const controllers = [PublicAccountController, PublicAccountsController, PublicCategoriesController, PublicExpensesController];
    const enforced = new Map<string, string[]>();
    for (const ctrl of controllers) {
      const proto = ctrl.prototype as unknown as Record<string, object>;
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name === 'constructor') continue;
        const scopes = Reflect.getMetadata(REQUIRE_SCOPES_KEY, proto[name]) as string[] | undefined;
        const tokenOnly = Reflect.getMetadata(TOKEN_ONLY_KEY, proto[name]) === true;
        const opId = (Reflect.getMetadata('swagger/apiOperation', proto[name]) as { operationId?: string } | undefined)?.operationId;
        if (opId && (scopes || tokenOnly)) enforced.set(opId, scopes ?? []);
      }
    }
    const publicOps = operations(doc).filter((o) => o.path.startsWith('/public/v1/'));
    expect(enforced.size).toBe(publicOps.length);
    for (const { op } of publicOps) {
      expect({ op: op.operationId, security: op.security }).toEqual({
        op: op.operationId,
        security: [{ oauth2: enforced.get(op.operationId!) }],
      });
    }
  });

  it('the OAuth endpoints document both body encodings and no bearer security', () => {
    const tokenOps = operations(doc).filter((o) => o.path.startsWith('/oauth/'));
    expect(tokenOps).toHaveLength(2);
    for (const { op } of tokenOps) {
      const body = op.requestBody as { content: Record<string, { schema: { $ref?: string } }> };
      expect(Object.keys(body.content).sort()).toEqual(['application/json', 'application/x-www-form-urlencoded']);
      expect(body.content['application/json'].schema.$ref).toMatch(/OAuth(Token|Revoke)Request$/);
      expect(op.security).toBeUndefined();
    }
    // The controller still reflects a plain record, so the global ValidationPipe never validates it.
    const paramTypes = Reflect.getMetadata('design:paramtypes', OAuthTokenController.prototype, 'token') as unknown[];
    expect(paramTypes[0]).toBe(Object);
  });

  it('documents the Idempotency-Key header on create and both success statuses', () => {
    const create = operations(doc).find((o) => o.op.operationId === 'createExpense')!.op;
    const header = (create.parameters ?? []).find((p) => 'name' in p && p.name === 'Idempotency-Key') as { in: string; required: boolean };
    expect(header).toMatchObject({ in: 'header', required: true });
    expect(Object.keys(create.responses)).toEqual(expect.arrayContaining(['200', '201', '409', '422']));
  });

  it('listAccounts needs no scope and no X-Account-Id; every other /public/v1 operation has an optional one', () => {
    const publicOps = operations(doc).filter((o) => o.path.startsWith('/public/v1/'));
    const list = publicOps.find((o) => o.op.operationId === 'listAccounts')!.op;
    expect(list.security).toEqual([{ oauth2: [] }]);
    expect((list.parameters ?? []).some((p) => 'name' in p && p.name === 'X-Account-Id')).toBe(false);
    for (const { op } of publicOps.filter((o) => o.op.operationId !== 'listAccounts')) {
      const header = (op.parameters ?? []).find((p) => 'name' in p && p.name === 'X-Account-Id') as
        | { in: string; required?: boolean }
        | undefined;
      expect({ op: op.operationId, in: header?.in, required: header?.required ?? false }).toEqual({
        op: op.operationId,
        in: 'header',
        required: false,
      });
    }
  });

  it('the X-Account-Id description comes from the one shared text key in every language', () => {
    for (const lang of DOC_LANGS) {
      const { document, missing } = buildPublicOpenApi(app, lang, doc);
      expect(missing).toEqual([]);
      const descriptions = operations(document)
        .flatMap((o) => (o.op.parameters ?? []).filter((p) => 'name' in p && p.name === 'X-Account-Id'))
        .map((p) => (p as { description?: string }).description);
      expect(descriptions.length).toBeGreaterThan(0);
      expect(new Set(descriptions).size).toBe(1);
      expect(descriptions[0]).toContain('account_required');
    }
  });

  it.each(DOC_LANGS)('builds the %s document: texts applied, guide under a language switcher', (lang) => {
    const { document, missing } = buildPublicOpenApi(app, lang, doc);
    expect(missing).toEqual([]);
    expect(document.info.description).toMatch(/^.*(English|Polski|Русский).*\n\n/);
    for (const other of DOC_LANGS.filter((l) => l !== lang)) {
      expect(document.info.description).toContain(`(/public/docs/${other})`);
    }
    expect(operations(document).every((o) => (o.op.summary ?? '').length > 0)).toBe(true);
    // The structure is shared, never mutated by a language pass.
    expect(operations(doc).every((o) => !o.op.summary)).toBe(true);
  });

  describe('served routes', () => {
    let server: unknown;

    beforeAll(() => {
      setupPublicDocs(app, (m) => {
        throw new Error(m);
      });
      // Swagger registers plain Express handlers, so the Express instance serves them without init().
      server = app.getHttpAdapter().getInstance();
    });

    it.each(DOC_LANGS)('/public/docs/%s serves Swagger UI and /openapi.json the localized document', async (lang) => {
      const html = await request(server as never).get(`/public/docs/${lang}`);
      expect(html.status).toBe(200);
      expect(html.text).toContain('swagger-ui');

      const init = await request(server as never).get(`/public/docs/${lang}/swagger-ui-init.js`);
      expect(init.status).toBe(200);
      expect(init.text).toContain('usePkceWithAuthorizationCodeGrant');
      // Explicit, so it never depends on the path Swagger UI derives from the page URL.
      expect(init.text).toContain('"oauth2RedirectUrl": "https://api.ai-budget.pl/public/docs/oauth2-redirect.html"');

      const json = await request(server as never).get(`/public/docs/${lang}/openapi.json`);
      expect(json.status).toBe(200);
      const served = json.body as OpenAPIObject;
      expect(served.components?.securitySchemes?.oauth2).toBeDefined();
      expect(served.info.description).toContain(`**${{ en: 'English', pl: 'Polski', ru: 'Русский' }[lang]}**`);
    });
  });
});

describe('pickDocsLang', () => {
  it.each([
    [undefined, 'en'],
    ['', 'en'],
    ['pl-PL,pl;q=0.9,en;q=0.8', 'pl'],
    ['ru', 'ru'],
    ['uk-UA,uk;q=0.9', 'en'],
    ['de-DE,de;q=0.9,ru;q=0.5,pl;q=0.4', 'ru'],
    ['en;q=0.5,pl;q=0.9', 'pl'],
    ['pl;q=0', 'en'],
    ['*', 'en'],
  ])('%p → %s', (header, lang) => {
    expect(pickDocsLang(header)).toBe(lang);
  });
});

describe('PublicDocsController', () => {
  it('is flag-guarded (404 while PUBLIC_API_ENABLED is off)', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, PublicDocsController)).toEqual([PublicApiEnabledGuard]);
  });

  it('302s to the language picked from Accept-Language and varies on it', () => {
    const headers: Record<string, string> = {};
    const res = {
      setHeader: (k: string, v: string) => (headers[k] = v),
      redirect: jest.fn(),
    };
    new PublicDocsController().redirect('ru-RU,ru;q=0.9', res as never);
    expect(res.redirect).toHaveBeenCalledWith(302, '/public/docs/ru');
    expect(headers.Vary).toBe('Accept-Language');
  });

  it('resolves the popup page lazily, once, and never at module load (I1)', () => {
    const resolve = jest.fn(() => '/x/swagger-ui-dist/oauth2-redirect.html');
    const lazy = createRedirectHtmlResolver(resolve);
    expect(resolve).not.toHaveBeenCalled();
    expect(lazy()).toBe('/x/swagger-ui-dist/oauth2-redirect.html');
    expect(lazy()).toBe('/x/swagger-ui-dist/oauth2-redirect.html');
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('answers 404 instead of crashing when the popup page cannot be resolved', () => {
    const lazy = createRedirectHtmlResolver(() => {
      throw new Error('Cannot find module');
    });
    expect(lazy()).toBeNull();
    const res = { sendFile: jest.fn(), status: jest.fn().mockReturnThis(), end: jest.fn() };
    new PublicDocsController(lazy).oauth2Redirect(res as never);
    expect(res.sendFile).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('serves the Swagger UI OAuth2 popup page shared by every language', () => {
    const res = { sendFile: jest.fn() };
    new PublicDocsController().oauth2Redirect(res as never);
    const file = res.sendFile.mock.calls[0][0] as string;
    expect(file).toMatch(/swagger-ui-dist[\\/]oauth2-redirect\.html$/);
    expect(existsSync(file)).toBe(true);
  });
});
