import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ViewerBlockGuard } from '../accounts/guards/account-role.guard';
import { ImportBankController } from '../import-bank/import-bank.controller';
import { ImportWiseController } from '../import-wise/import-wise.controller';
import { ImportBatchesController } from './import-batches.controller';

/** ABA-807: a viewer may preview an import but never write one, nor roll one back. */
describe('import write routes block viewers (ABA-807)', () => {
  const blocksViewers = (proto: object, method: string) =>
    ((Reflect.getMetadata(GUARDS_METADATA, (proto as any)[method]) as unknown[]) ?? []).some(
      (g) => g instanceof ViewerBlockGuard || g === ViewerBlockGuard,
    );

  it.each([
    [ImportBankController.prototype, 'commit'],
    [ImportBankController.prototype, 'createMapping'],
    [ImportBankController.prototype, 'deleteMapping'],
    [ImportWiseController.prototype, 'commit'],
    [ImportBatchesController.prototype, 'rollback'],
  ])('%#: guarded', (proto, method) => {
    expect(blocksViewers(proto, method as string)).toBe(true);
  });
});
