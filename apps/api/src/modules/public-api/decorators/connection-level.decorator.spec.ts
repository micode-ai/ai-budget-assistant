import { MODULE_METADATA } from '@nestjs/common/constants';
import { PublicAccountsController } from '../controllers/public-accounts.controller';
import { PublicWriteGuard } from '../guards/public-write.guard';
import { PublicApiModule } from '../public-api.module';
import { CONNECTION_LEVEL_KEY } from './connection-level.decorator';

/**
 * @ConnectionLevel() skips account resolution, so it may sit only on `GET /public/v1/accounts` and
 * never beside @PublicWrite() — no account-reading or write route can run without an addressed account.
 * Scans every controller the module registers, so a new controller is checked automatically.
 */
describe('@ConnectionLevel placement', () => {
  const controllers = (Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, PublicApiModule) ?? []) as Array<new (...a: never[]) => unknown>;

  it('appears only on GET /public/v1/accounts, on no class, and never with @PublicWrite()', () => {
    const found: string[] = [];
    for (const ctrl of controllers) {
      expect({ ctrl: ctrl.name, onClass: Reflect.getMetadata(CONNECTION_LEVEL_KEY, ctrl) }).toEqual({ ctrl: ctrl.name, onClass: undefined });
      const proto = ctrl.prototype as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = proto[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        if (Reflect.getMetadata(CONNECTION_LEVEL_KEY, handler) === undefined) continue;
        found.push(`${ctrl.name}.${name}`);
        const guards = (Reflect.getMetadata('__guards__', handler) ?? []) as unknown[];
        expect(guards).not.toContain(PublicWriteGuard);
        expect(Reflect.getMetadata('method', handler)).toBe(0); // RequestMethod.GET
      }
    }
    expect(found).toEqual(['PublicAccountsController.list']);
    expect(controllers).toContain(PublicAccountsController);
    expect(Reflect.getMetadata('path', PublicAccountsController)).toBe('public/v1/accounts');
  });
});
