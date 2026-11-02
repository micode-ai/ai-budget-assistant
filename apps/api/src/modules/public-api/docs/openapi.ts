import { readFileSync } from 'fs';
import { join } from 'path';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { OAuthPublicModule } from '../../oauth/oauth-public.module';
import { PUBLIC_SCOPES } from '../../oauth/oauth-scopes';
import { PublicApiModule } from '../public-api.module';
import { TEXTS_EN } from './texts.en';
import { TEXTS_PL } from './texts.pl';
import { TEXTS_RU } from './texts.ru';

/**
 * The public OpenAPI reference (spec §11), one document per language.
 *
 * STRUCTURE comes from the controllers' decorators and is generated once, ONLY from
 * `[PublicApiModule, OAuthPublicModule]` (Ruling 3): the internal consent, developer and
 * connected-apps routes live in `OAuthModule` and cannot reach the published document.
 * TEXT (summaries, descriptions, scope and error explanations, the guide) is applied afterwards
 * from `texts.<lang>.ts`, keyed by operationId / schema field path (`textSlots`), so the three
 * documents differ in words only. `texts.spec.ts` fails on a missing or stale key.
 */

export const DOC_LANGS = ['en', 'pl', 'ru'] as const;
export type DocLang = (typeof DOC_LANGS)[number];
export type DocTexts = Readonly<Record<string, string>>;

export const DOC_TEXTS: Record<DocLang, DocTexts> = { en: TEXTS_EN, pl: TEXTS_PL, ru: TEXTS_RU };

/** Native language names for the switcher — identical in every document. */
const LANG_NAMES: Record<DocLang, string> = { en: 'English', pl: 'Polski', ru: 'Русский' };

export const PUBLIC_API_BASE_URL = 'https://api.ai-budget.pl';
export const AUTHORIZE_URL = 'https://app.ai-budget.pl/authorize';
export const TOKEN_URL = `${PUBLIC_API_BASE_URL}/oauth/token`;
/** Swagger UI's "Authorize" popup returns here; set explicitly so it never depends on the page URL. */
export const SWAGGER_OAUTH2_REDIRECT_URL = `${PUBLIC_API_BASE_URL}/public/docs/oauth2-redirect.html`;

/** Tag order in the reference. Tag NAMES are structural (identical across languages). */
export const DOC_TAGS = ['OAuth', 'Account', 'Categories', 'Expenses'] as const;

/** Text keys that are not a slot of the document (Swagger UI chrome). */
export const NON_DOCUMENT_TEXT_KEYS = ['ui.siteTitle'] as const;

/** Error responses described once per status instead of once per operation. */
const SHARED_ERROR_SCHEMAS: Record<string, { prefix: string; statuses: readonly number[] }> = {
  '#/components/schemas/PublicApiErrorResponse': { prefix: 'error.public', statuses: [400, 401, 403, 404, 429, 503] },
  '#/components/schemas/OAuthErrorResponse': { prefix: 'error.oauth', statuses: [400, 401, 404, 429, 503] },
};

export const docsPath = (lang: DocLang): string => `public/docs/${lang}`;

/** The language-neutral document: every text slot is empty. */
export function buildPublicOpenApiStructure(app: INestApplication): OpenAPIObject {
  const scopes = Object.fromEntries(PUBLIC_SCOPES.map((s) => [s, '']));
  let builder = new DocumentBuilder()
    .setTitle('AI Budget API')
    .setVersion('1')
    .addServer(PUBLIC_API_BASE_URL)
    .addOAuth2(
      {
        type: 'oauth2',
        flows: {
          authorizationCode: { authorizationUrl: AUTHORIZE_URL, tokenUrl: TOKEN_URL, refreshUrl: TOKEN_URL, scopes },
        },
      },
      'oauth2',
    );
  for (const tag of DOC_TAGS) builder = builder.addTag(tag);

  return SwaggerModule.createDocument(app, builder.build(), {
    include: [PublicApiModule, OAuthPublicModule],
    // Readable ids only: every operation sets one explicitly (`@ApiOperation({ operationId })`).
    operationIdFactory: (controllerKey, methodKey) => `${controllerKey}_${methodKey}`,
  });
}

/** Parameters whose text is identical on every operation: one `param.<name>` key per language. */
export const SHARED_PARAM_KEYS = ['X-Account-Id'];

export interface TextSlot {
  key: string;
  set: (value: string) => void;
}

/**
 * Every human-readable slot of the document, with its stable text key:
 *   info.title · server.production · security.oauth2 · scope.<scope> · tag.<name>
 *   op.<operationId>.summary|description|body · op.<operationId>.param.<name> · param.<name> (shared, see SHARED_PARAM_KEYS)
 *   op.<operationId>.response.<status> — or error.public|oauth.<status> for the shared error responses
 *   schema.<Name> · schema.<Name>.<property>
 */
export function textSlots(doc: OpenAPIObject): TextSlot[] {
  const slots: TextSlot[] = [];
  const add = (key: string, set: (v: string) => void) => slots.push({ key, set });

  add('info.title', (v) => (doc.info.title = v));
  for (const server of doc.servers ?? []) {
    if (server.url === PUBLIC_API_BASE_URL) add('server.production', (v) => (server.description = v));
  }

  for (const [name, scheme] of Object.entries(doc.components?.securitySchemes ?? {})) {
    if ('$ref' in scheme) continue;
    add(`security.${name}`, (v) => (scheme.description = v));
    const flowScopes = scheme.flows?.authorizationCode?.scopes ?? {};
    for (const scope of Object.keys(flowScopes)) add(`scope.${scope}`, (v) => (flowScopes[scope] = v));
  }

  for (const tag of doc.tags ?? []) add(`tag.${tag.name}`, (v) => (tag.description = v));

  for (const pathItem of Object.values(doc.paths)) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      const op = pathItem[method];
      if (!op) continue;
      const id = op.operationId ?? `${method} ?`;
      add(`op.${id}.summary`, (v) => (op.summary = v));
      add(`op.${id}.description`, (v) => (op.description = v));
      for (const param of op.parameters ?? []) {
        if ('$ref' in param) continue;
        const key = SHARED_PARAM_KEYS.includes(param.name) ? `param.${param.name}` : `op.${id}.param.${param.name}`;
        add(key, (v) => (param.description = v));
      }
      const body = op.requestBody;
      if (body && !('$ref' in body)) add(`op.${id}.body`, (v) => (body.description = v));
      for (const [status, response] of Object.entries(op.responses ?? {})) {
        if (!response || '$ref' in response) continue;
        add(responseKey(id, Number(status), response), (v) => (response.description = v));
      }
    }
  }

  for (const [name, schema] of Object.entries(doc.components?.schemas ?? {})) {
    if ('$ref' in schema) continue;
    add(`schema.${name}`, (v) => (schema.description = v));
    const props = schema.properties ?? {};
    for (const prop of Object.keys(props)) {
      add(`schema.${name}.${prop}`, (v) => {
        const current = props[prop];
        // OpenAPI 3.0 ignores siblings of `$ref`: wrap so the description is shown.
        props[prop] = '$ref' in current ? { allOf: [{ $ref: current.$ref }], description: v } : { ...current, description: v };
      });
    }
  }
  return slots;
}

function responseKey(operationId: string, status: number, response: { content?: Record<string, { schema?: unknown }> }): string {
  const ref = (response.content?.['application/json']?.schema as { $ref?: string } | undefined)?.$ref;
  const shared = ref ? SHARED_ERROR_SCHEMAS[ref] : undefined;
  if (shared && shared.statuses.includes(status)) return `${shared.prefix}.${status}`;
  return `op.${operationId}.response.${status}`;
}

/** Fills every slot from `texts`; returns the keys that had no text (left empty). */
export function applyTexts(doc: OpenAPIObject, texts: DocTexts): string[] {
  const missing: string[] = [];
  for (const slot of textSlots(doc)) {
    const value = texts[slot.key];
    if (value === undefined) missing.push(slot.key);
    else slot.set(value);
  }
  return [...new Set(missing)];
}

/** The getting-started guide (copied next to the compiled file by nest-cli `assets`). */
export function readGuide(lang: DocLang): string {
  return readFileSync(join(__dirname, `guide.${lang}.md`), 'utf8');
}

function languageSwitcher(current: DocLang): string {
  return DOC_LANGS.map((l) => (l === current ? `**${LANG_NAMES[l]}**` : `[${LANG_NAMES[l]}](/${docsPath(l)})`)).join(' · ');
}

/**
 * The published document for one language: the structure, its texts, and the guide as
 * `info.description` under a language switcher. `missing` lists keys without text (none in a
 * tested build).
 */
export function buildPublicOpenApi(
  app: INestApplication,
  lang: DocLang,
  structure: OpenAPIObject = buildPublicOpenApiStructure(app),
): { document: OpenAPIObject; missing: string[] } {
  const document = structuredClone(structure);
  const missing = applyTexts(document, DOC_TEXTS[lang]);
  document.info.description = `${languageSwitcher(lang)}\n\n${readGuide(lang)}`;
  return { document, missing };
}

/**
 * `/public/docs/<lang>` (Swagger UI) and `/public/docs/<lang>/openapi.json` for every language.
 * Swagger's routes are plain Express handlers outside Nest's guards, so `main.ts` calls this only
 * when PUBLIC_API_ENABLED is on — off, the paths do not exist (404), like the rest of the surface.
 * `/public/docs` itself (the Accept-Language redirect) is `PublicDocsController`, flag-guarded.
 */
export function setupPublicDocs(app: INestApplication, warn: (message: string) => void): void {
  const structure = buildPublicOpenApiStructure(app);
  for (const lang of DOC_LANGS) {
    const { document, missing } = buildPublicOpenApi(app, lang, structure);
    if (missing.length > 0) warn(`public docs (${lang}): ${missing.length} text key(s) missing: ${missing.join(', ')}`);
    SwaggerModule.setup(docsPath(lang), app, document, {
      jsonDocumentUrl: `${docsPath(lang)}/openapi.json`,
      yamlDocumentUrl: `${docsPath(lang)}/openapi.yaml`,
      customSiteTitle: DOC_TEXTS[lang]['ui.siteTitle'],
      swaggerOptions: {
        // Lets "Authorize" run the real flow: S256 PKCE, all scopes pre-selected.
        initOAuth: { usePkceWithAuthorizationCodeGrant: true, scopes: [...PUBLIC_SCOPES] },
        oauth2RedirectUrl: SWAGGER_OAUTH2_REDIRECT_URL,
        persistAuthorization: false,
        displayOperationId: true,
        docExpansion: 'list',
        tagsSorter: 'none',
        operationsSorter: 'none',
      },
    });
  }
}

/** `Accept-Language` → the best documented language (q-values honoured), English by default. */
export function pickDocsLang(acceptLanguage: string | string[] | undefined): DocLang {
  const header = Array.isArray(acceptLanguage) ? acceptLanguage.join(',') : (acceptLanguage ?? '');
  const ranked = header
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map((p) => /^\s*q=([\d.]+)\s*$/i.exec(p)?.[1]).find((v) => v !== undefined);
      return { lang: tag.trim().toLowerCase().split('-')[0], q: q === undefined ? 1 : Number(q), index };
    })
    .filter((e) => e.lang && Number.isFinite(e.q) && e.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const entry of ranked) {
    if ((DOC_LANGS as readonly string[]).includes(entry.lang)) return entry.lang as DocLang;
  }
  return 'en';
}
