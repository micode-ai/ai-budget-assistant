import { RestoreCredentialAuthController } from './restore-credential-auth.controller';
import { RestoreCredentialRegistrationController } from './restore-credential-registration.controller';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

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
