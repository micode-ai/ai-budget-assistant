import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../../app.module';
import { GLOBAL_PREFIX_EXCLUDED_ROUTES } from '../../../global-prefix-exclusions';
import { buildPublicOpenApiStructure } from './openapi';

/**
 * Test-only: the REAL application graph (AppModule, internal OAuthModule included) compiled in
 * Nest's preview mode — modules and controllers are scanned, no provider is instantiated, so no
 * database or Redis is needed — with the same global prefix and exclusions as `main.ts`. This is
 * what proves the `include` filter keeps internal routes out, rather than a hand-built module.
 * Never call `app.close()` on it: preview instances are prototypes, their destroy hooks would throw.
 */
export async function createDocsTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile({ preview: true });
  const app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1', { exclude: GLOBAL_PREFIX_EXCLUDED_ROUTES });
  return app;
}

export async function buildTestStructure(): Promise<{ app: INestApplication; structure: OpenAPIObject }> {
  const app = await createDocsTestApp();
  return { app, structure: buildPublicOpenApiStructure(app) };
}
