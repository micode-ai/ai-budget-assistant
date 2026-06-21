import { AuthController } from './auth.controller';

describe('AuthController — google', () => {
  it('delegates POST /auth/google to AuthService.googleLogin', async () => {
    const authService: any = {
      googleLogin: jest.fn().mockResolvedValue({ accessToken: 'a', refreshToken: 'r', user: {}, accounts: [] }),
    };
    const controller = new AuthController(authService);

    const dto = { idToken: 'tok', language: 'en' } as any;
    const result = await controller.googleLogin(dto);

    expect(authService.googleLogin).toHaveBeenCalledWith(dto);
    expect(result.accessToken).toBe('a');
  });
});
