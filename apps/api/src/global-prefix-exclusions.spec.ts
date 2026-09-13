import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import * as pathToRegexp from 'path-to-regexp';
import { GLOBAL_PREFIX_EXCLUDED_ROUTES } from './global-prefix-exclusions';
import { GuestController } from './modules/receipt-split/guest.controller';

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

  it('excludes the QR-code group routes specifically', () => {
    expect(isExcluded('/s/g/:groupToken')).toBeTruthy();
    expect(isExcluded('/s/g/:groupToken/:seq')).toBeTruthy();
  });

  it('does not exclude ordinary API routes', () => {
    for (const route of ['/expenses/:id', '/subscriptions', '/sync/push', '/shopping-list', '/users/me']) {
      expect(isExcluded(route)).toBeFalsy();
    }
  });
});
