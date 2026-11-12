import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import * as pathToRegexp from 'path-to-regexp';
import { GLOBAL_PREFIX_EXCLUDED_ROUTES } from './global-prefix-exclusions';
import { GuestController } from './modules/receipt-split/guest.controller';
import { GroupGuestController } from './modules/groups/group-guest.controller';
import { OAuthAuthorizeController } from './modules/oauth/oauth-authorize.controller';
import { OAuthTokenController } from './modules/oauth/oauth-token.controller';
import { OAuthMetadataController } from './modules/oauth/oauth-metadata.controller';
import { OAuthRegisterController } from './modules/oauth/oauth-register.controller';

/**
 * `main.ts` serves every route under `api/v1` EXCEPT the ones named here. The
 * receipt-split guest pages are links we hand to people outside the app
 * (`https://…/s/<token>`), so they must stay off the versioned prefix — and
 * `ReceiptSplitService.buildGuestUrl`/`buildGuestGroupUrl` bake that bare
 * `/s/...` shape straight into the link and the QR code.
 *
 * This list used to name each guest route one by one, which meant adding a
 * route to `GuestController` silently moved it under `api/v1` while the link
 * the app printed still pointed at the unprefixed path — a 404 nobody sees
 * until a guest opens the link. That is exactly what happened to the QR-code
 * group routes. This test enumerates the controller's REAL routes so the list
 * can never fall behind it again.
 */
describe('GLOBAL_PREFIX_EXCLUDED_ROUTES', () => {
  const compiled = GLOBAL_PREFIX_EXCLUDED_ROUTES.map((route) =>
    pathToRegexp(route.startsWith('/') ? route : `/${route}`),
  );

  /** Mirrors Nest's own check (router/utils/exclude-route.util.ts): the route's
   *  DEFINITION path (`/s/g/:groupToken`, params and all) is exec'd against each
   *  compiled exclusion regex. */
  const isExcluded = (routePath: string) =>
    compiled.some((re) => re.exec(routePath.startsWith('/') ? routePath : `/${routePath}`));

  /** Every `@Get`/`@Post`/... route declared on a controller, as Nest sees it. */
  const routesOf = (controller: new (...args: never[]) => unknown): string[] => {
    const prefix = Reflect.getMetadata(PATH_METADATA, controller) as string;
    const proto = controller.prototype as Record<string, unknown>;
    return Object.getOwnPropertyNames(proto)
      .filter((name) => name !== 'constructor')
      .filter((name) => Reflect.getMetadata(METHOD_METADATA, proto[name] as object) !== undefined)
      .map((name) => {
        const methodPath = Reflect.getMetadata(PATH_METADATA, proto[name] as object) as string;
        return `/${[prefix, methodPath].filter((p) => p && p !== '/').join('/')}`;
      });
  };

  it('excludes EVERY guest receipt-split route from the api/v1 prefix', () => {
    const guestRoutes = routesOf(GuestController);

    // Guard the guard: if reflection ever stops finding routes, the assertion
    // below would pass vacuously.
    expect(guestRoutes.length).toBeGreaterThanOrEqual(4);

    const notExcluded = guestRoutes.filter((route) => !isExcluded(route));
    expect(notExcluded).toEqual([]);
  });

  it('excludes EVERY group guest route from the api/v1 prefix', () => {
    const routes = routesOf(GroupGuestController);
    expect(routes.length).toBeGreaterThanOrEqual(10);
    expect(routes.filter((route) => !isExcluded(route))).toEqual([]);
  });

  it('excludes the QR-code group routes specifically', () => {
    expect(isExcluded('/s/g/:groupToken')).toBeTruthy();
    expect(isExcluded('/s/g/:groupToken/:seq')).toBeTruthy();
  });

  it('excludes the public API and OAuth routes', () => {
    expect(isExcluded('/public/v1/expenses/:id')).toBeTruthy();
    expect(isExcluded('/oauth/token')).toBeTruthy();
    expect(isExcluded('/oauth/revoke')).toBeTruthy();
  });

  it('excludes EVERY OAuthTokenController route (the third-party token/revoke endpoints)', () => {
    const routes = routesOf(OAuthTokenController);
    expect(routes.sort()).toEqual(['/oauth/revoke', '/oauth/token']);
    for (const route of routes) expect(isExcluded(route)).toBeTruthy();
  });

  it('keeps the consent page backend (OAuthAuthorizeController) under api/v1', () => {
    const routes = routesOf(OAuthAuthorizeController);
    expect(routes.sort()).toEqual(['/oauth/authorize/approve', '/oauth/authorize/preview']);
    for (const route of routes) expect(isExcluded(route)).toBeFalsy();
  });

  it('excludes the five MCP connector paths, each named one by one', () => {
    for (const route of [
      'mcp',
      'oauth/register',
      '.well-known/oauth-authorization-server',
      '.well-known/oauth-protected-resource',
      '.well-known/oauth-protected-resource/mcp',
    ]) {
      expect(GLOBAL_PREFIX_EXCLUDED_ROUTES).toContain(route);
      expect(isExcluded(`/${route}`)).toBeTruthy();
    }
    // Never a wildcard over oauth/: the consent backend must keep the api/v1 prefix.
    expect(GLOBAL_PREFIX_EXCLUDED_ROUTES).not.toContain('oauth/(.*)');
    expect(GLOBAL_PREFIX_EXCLUDED_ROUTES).not.toContain('.well-known/(.*)');
  });

  it('path-to-regexp treats the dot of .well-known literally (no look-alike path is excluded)', () => {
    expect(isExcluded('/xwell-known/oauth-authorization-server')).toBeFalsy();
    expect(isExcluded('/.well-known/oauth-protected-resource/other')).toBeFalsy();
    expect(isExcluded('/mcp/extra')).toBeFalsy();
    expect(isExcluded('/oauth/registerx')).toBeFalsy();
  });

  it('excludes EVERY OAuthMetadataController and OAuthRegisterController route', () => {
    const metadata = routesOf(OAuthMetadataController).sort();
    expect(metadata).toEqual([
      '/.well-known/oauth-authorization-server',
      '/.well-known/oauth-protected-resource',
      '/.well-known/oauth-protected-resource/mcp',
    ]);
    const register = routesOf(OAuthRegisterController);
    expect(register).toEqual(['/oauth/register']);
    for (const route of [...metadata, ...register]) expect(isExcluded(route)).toBeTruthy();
  });

  it('does not exclude ordinary API routes', () => {
    for (const route of ['/expenses/:id', '/subscriptions', '/sync/push', '/shopping-list', '/users/me']) {
      expect(isExcluded(route)).toBeFalsy();
    }
  });
});
