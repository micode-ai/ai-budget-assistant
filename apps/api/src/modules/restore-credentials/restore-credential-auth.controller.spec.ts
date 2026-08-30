import { RestoreCredentialAuthController } from './restore-credential-auth.controller';
import { RestoreCredentialRegistrationController } from './restore-credential-registration.controller';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RestoreCredentialsService } from './restore-credentials.service';
import type { VerifyRestoreAuthenticationDto } from './dto';

describe('restore-credential controller guards', () => {
  it('leaves the authentication controller public', () => {
    const guards = Reflect.getMetadata('__guards__', RestoreCredentialAuthController) || [];
    expect(guards).not.toContain(JwtAuthGuard);
  });

  it('guards the registration controller with JWT', () => {
    const guards = Reflect.getMetadata('__guards__', RestoreCredentialRegistrationController) || [];
    expect(guards).toContain(JwtAuthGuard);
  });
});

/**
 * Companion to the guard test above: proving the controller is unauthenticated
 * says nothing about whether its handlers call the right service methods with
 * the right arguments. Pinned separately so nobody has to infer delegation
 * correctness from the guard assertions.
 */
describe('RestoreCredentialAuthController delegation', () => {
  let service: jest.Mocked<
    Pick<RestoreCredentialsService, 'getAuthenticationOptions' | 'verifyAuthentication'>
  >;
  let controller: RestoreCredentialAuthController;

  beforeEach(() => {
    service = {
      getAuthenticationOptions: jest.fn().mockResolvedValue({ challenge: 'auth-options' }),
      verifyAuthentication: jest.fn().mockResolvedValue({ accessToken: 'tok' }),
    };
    controller = new RestoreCredentialAuthController(service as unknown as RestoreCredentialsService);
  });

  it('getOptions delegates to getAuthenticationOptions with no arguments', async () => {
    const result = await controller.getOptions();

    expect(service.getAuthenticationOptions).toHaveBeenCalledWith();
    expect(result).toEqual({ challenge: 'auth-options' });
  });

  it('verify delegates to verifyAuthentication with the dto response', async () => {
    const dto: VerifyRestoreAuthenticationDto = { response: { id: 'cred-1' } } as never;

    const result = await controller.verify(dto);

    expect(service.verifyAuthentication).toHaveBeenCalledWith(dto.response);
    expect(result).toEqual({ accessToken: 'tok' });
  });
});
