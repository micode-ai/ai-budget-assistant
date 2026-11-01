import { dirname } from 'path';
import { Controller, Get, Headers, Logger, Optional, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { PublicApiEnabledGuard } from '../../oauth/guards/public-api-enabled.guard';
import { docsPath, pickDocsLang } from './openapi';

/**
 * Swagger UI's OAuth2 popup landing page, resolved through `@nestjs/swagger`'s own dependency so
 * it is the copy matching the UI it serves, wherever npm hoisted it. Resolved lazily on the first
 * request and cached (I1): the API's boot must never depend on a docs asset being resolvable.
 * `null` when it cannot be found — that route then 404s, nothing else is affected.
 */
export function createRedirectHtmlResolver(
  resolve: () => string = () =>
    require.resolve('swagger-ui-dist/oauth2-redirect.html', { paths: [dirname(require.resolve('@nestjs/swagger'))] }),
): () => string | null {
  let cached: string | null | undefined;
  return () => {
    if (cached === undefined) {
      try {
        cached = resolve();
      } catch (e) {
        new Logger(PublicDocsController.name).warn(`swagger-ui oauth2-redirect.html not resolvable: ${(e as Error).message}`);
        cached = null;
      }
    }
    return cached;
  };
}

const defaultRedirectHtml = createRedirectHtmlResolver();

/**
 * `GET /public/docs` → `302 /public/docs/<lang>` by `Accept-Language` (pl, ru, else en), and
 * `GET /public/docs/oauth2-redirect.html` — the page Swagger UI's "Authorize" popup returns to.
 * Swagger UI derives that URL from the page's parent path, so all three languages share this
 * one redirect URI (`https://api.ai-budget.pl/public/docs/oauth2-redirect.html`), which a
 * developer registers on their app to try the flow from the reference.
 *
 * Public by design (no auth: it is documentation) and flag-guarded like the rest of the surface.
 * Served without the api/v1 prefix (`public/(.*)` in global-prefix-exclusions.ts). Lives in its
 * own `PublicDocsModule`, not in `PublicApiModule`, whose controllers all carry the bearer guard —
 * and so it is outside the published document by construction.
 */
@Controller('public/docs')
@UseGuards(PublicApiEnabledGuard)
export class PublicDocsController {
  constructor(@Optional() private readonly redirectHtml: () => string | null = defaultRedirectHtml) {}

  @Get()
  redirect(@Headers('accept-language') acceptLanguage: string | undefined, @Res() res: Response): void {
    res.setHeader('Vary', 'Accept-Language');
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(302, `/${docsPath(pickDocsLang(acceptLanguage))}`);
  }

  @Get('oauth2-redirect.html')
  oauth2Redirect(@Res() res: Response): void {
    const file = this.redirectHtml();
    if (!file) {
      res.status(404).end();
      return;
    }
    res.sendFile(file);
  }
}
