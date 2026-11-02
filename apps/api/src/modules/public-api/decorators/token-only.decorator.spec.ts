import { MODULE_METADATA } from '@nestjs/common/constants';
import { PublicAccountController } from '../controllers/public-account.controller';
import { PublicApiModule } from '../public-api.module';
import { TOKEN_ONLY_KEY } from './token-only.decorator';

/**
 * @TokenOnly is the one opt-out from the scope check (Ruling 13). Pins that it sits on
 * `PublicAccountController.get` and `PublicAccountsController.list` and nowhere else — on no other method, and never on a class —
 * across every controller the public API module registers (a new controller is scanned automatically).
 */
describe('@TokenOnly placement', () => {
  const controllers = (Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, PublicApiModule) ?? []) as Array<new (...a: never[]) => unknown>;

  it('scans the registered /public/v1 controllers', () => {
    expect(controllers.length).toBeGreaterThanOrEqual(3);
    expect(controllers).toContain(PublicAccountController);
  });

  it('appears only on PublicAccountController.get and PublicAccountsController.list', () => {
    const found: string[] = [];
    for (const ctrl of controllers) {
      if (Reflect.getMetadata(TOKEN_ONLY_KEY, ctrl) !== undefined) found.push(`${ctrl.name} (class)`);
      const proto = ctrl.prototype as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name === 'constructor' || typeof proto[name] !== 'function') continue;
        if (Reflect.getMetadata(TOKEN_ONLY_KEY, proto[name] as object) !== undefined) found.push(`${ctrl.name}.${name}`);
      }
    }
    expect(found).toEqual(['PublicAccountController.get', 'PublicAccountsController.list']);
  });
});
