import { ValidationPipe } from '@nestjs/common';
import { VerifyRestoreRegistrationDto, VerifyRestoreAuthenticationDto } from './dto';

/**
 * Empirical check, not an argument: the DTOs carry a single decorated
 * property (`response`) holding a nested WebAuthn payload with no per-field
 * decorators and no `@ValidateNested()`/`@Type()`. The theory is that
 * class-validator therefore never recurses into it, so `whitelist: true`
 * leaves it untouched. If that theory were wrong, `forbidNonWhitelisted`
 * would turn every real registration/authentication request into a 400, and
 * no unit test of the service layer would ever catch it — so this is proven
 * by actually running the exact pipe config main.ts installs globally, not
 * by re-stating the theory.
 */
describe('restore-credentials DTOs under the global ValidationPipe', () => {
  // Mirrors apps/api/src/main.ts's app.useGlobalPipes(...) core options.
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  it('leaves a realistic nested registration response payload intact', async () => {
    const payload = {
      response: {
        id: 'credential-id-123',
        rawId: 'cmF3SWQ',
        response: {
          clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uY3JlYXRlIn0',
          attestationObject: 'o2NmbXRkbm9uZQ',
          transports: ['internal'],
          publicKeyAlgorithm: -7,
          publicKey: 'cHVibGljS2V5Qnl0ZXM',
          authenticatorData: 'YXV0aGVudGljYXRvckRhdGE',
        },
        authenticatorAttachment: 'platform',
        clientExtensionResults: {},
        type: 'public-key',
      },
    };

    const result = await pipe.transform(payload, {
      type: 'body',
      metatype: VerifyRestoreRegistrationDto,
      data: '',
    });

    expect(result).toBeInstanceOf(VerifyRestoreRegistrationDto);
    expect(result.response).toEqual(payload.response);
    expect(result.response.response.clientDataJSON).toBe(
      payload.response.response.clientDataJSON,
    );
    expect(result.response.response.transports).toEqual(['internal']);
    expect(Object.keys(result.response)).toEqual(Object.keys(payload.response));
    expect(Object.keys(result.response.response)).toEqual(
      Object.keys(payload.response.response),
    );
  });

  it('leaves a realistic nested authentication response payload intact', async () => {
    const payload = {
      response: {
        id: 'credential-id-456',
        rawId: 'cmF3SWQ0NTY',
        response: {
          clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uZ2V0In0',
          authenticatorData: 'dGVzdC1hdXRoZW50aWNhdG9yLWRhdGE',
          signature: 'dGVzdC1zaWduYXR1cmU',
          userHandle: 'dXNlci1oYW5kbGU',
        },
        authenticatorAttachment: 'platform',
        clientExtensionResults: {},
        type: 'public-key',
      },
    };

    const result = await pipe.transform(payload, {
      type: 'body',
      metatype: VerifyRestoreAuthenticationDto,
      data: '',
    });

    expect(result).toBeInstanceOf(VerifyRestoreAuthenticationDto);
    expect(result.response).toEqual(payload.response);
    expect(result.response.response.signature).toBe(payload.response.response.signature);
    expect(Object.keys(result.response)).toEqual(Object.keys(payload.response));
    expect(Object.keys(result.response.response)).toEqual(
      Object.keys(payload.response.response),
    );
  });

  it('still rejects a genuinely unknown top-level field (forbidNonWhitelisted stays enforced)', async () => {
    const payload = {
      response: { id: 'x', rawId: 'y', response: {}, clientExtensionResults: {}, type: 'public-key' },
      extraTopLevelField: 'should not be allowed',
    };

    await expect(
      pipe.transform(payload, {
        type: 'body',
        metatype: VerifyRestoreRegistrationDto,
        data: '',
      }),
    ).rejects.toThrow();
  });
});
