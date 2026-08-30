import { RestoreCredentialRegistrationController } from './restore-credential-registration.controller';
import type { RestoreCredentialsService } from './restore-credentials.service';
import type { AuthenticatedRequest } from '../../common/types';
import type { VerifyRestoreRegistrationDto } from './dto';

/**
 * The guard-reflection test in restore-credential-auth.controller.spec.ts
 * cannot see a wrong argument order — getRegistrationOptions(userId, email)
 * takes two same-typed string parameters, so a swap would compile, pass
 * every existing test, and only break at runtime. These tests pin the exact
 * delegation, including argument order, for every handler on this controller.
 */
describe('RestoreCredentialRegistrationController delegation', () => {
  let service: jest.Mocked<
    Pick<RestoreCredentialsService, 'getRegistrationOptions' | 'verifyRegistration' | 'deleteForUser'>
  >;
  let controller: RestoreCredentialRegistrationController;

  const req = {
    user: { id: 'user-id-123', email: 'user@example.com' },
  } as AuthenticatedRequest;

  beforeEach(() => {
    service = {
      getRegistrationOptions: jest.fn().mockResolvedValue({ challenge: 'reg-options' }),
      verifyRegistration: jest.fn().mockResolvedValue({ ok: true }),
      deleteForUser: jest.fn().mockResolvedValue(undefined),
    };
    controller = new RestoreCredentialRegistrationController(
      service as unknown as RestoreCredentialsService,
    );
  });

  it('getOptions delegates to getRegistrationOptions with userId FIRST, email SECOND', async () => {
    const result = await controller.getOptions(req);

    expect(service.getRegistrationOptions).toHaveBeenCalledWith('user-id-123', 'user@example.com');
    expect(result).toEqual({ challenge: 'reg-options' });
  });

  it('register delegates to verifyRegistration with the userId and the dto response', async () => {
    const dto: VerifyRestoreRegistrationDto = { response: { id: 'cred-1' } } as never;

    const result = await controller.register(req, dto);

    expect(service.verifyRegistration).toHaveBeenCalledWith('user-id-123', dto.response);
    expect(result).toEqual({ ok: true });
  });

  it('remove delegates to deleteForUser with the userId', async () => {
    await controller.remove(req);

    expect(service.deleteForUser).toHaveBeenCalledWith('user-id-123');
  });
});
