import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OAuthRegisterController, clientIp } from './oauth-register.controller';
import { McpEnabledGuard } from './guards/mcp-enabled.guard';

describe('OAuthRegisterController', () => {
  it('is guarded by McpEnabledGuard at class level', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, OAuthRegisterController)).toEqual([McpEnabledGuard]);
  });

  it('passes the body and the client IP to the service, and marks the response no-store', async () => {
    const register = jest.fn().mockResolvedValue({ client_id: 'aba_ci_x' });
    const c = new OAuthRegisterController({ register } as any);
    const headers: Record<string, string> = {};
    const res: any = { setHeader: (k: string, v: string) => (headers[k] = v) };
    const out = await c.register({ client_name: 'X' }, { headers: { 'x-real-ip': '203.0.113.9' }, ip: '198.51.100.4' } as any, res);
    expect(out).toEqual({ client_id: 'aba_ci_x' });
    expect(register).toHaveBeenCalledWith({ client_name: 'X' }, '198.51.100.4');
    expect(headers['Cache-Control']).toBe('no-store');
  });

  it('a 429 carries Retry-After', async () => {
    const { HttpException } = await import('@nestjs/common');
    const register = jest.fn().mockRejectedValue(new HttpException({ error: 'slow_down' }, 429));
    const c = new OAuthRegisterController({ register } as any);
    const headers: Record<string, string> = {};
    const res: any = { setHeader: (k: string, v: string) => (headers[k] = v) };
    await expect(c.register({}, { headers: {}, ip: '1.1.1.1' } as any, res)).rejects.toBeInstanceOf(HttpException);
    expect(headers['Retry-After']).toBe('3600');
  });
});

describe('clientIp', () => {
  it('prefers req.ip (trust proxy: the nginx-appended address, not spoofable) over X-Real-IP', () => {
    expect(clientIp({ headers: { 'x-real-ip': '203.0.113.9' }, ip: '198.51.100.4' } as any)).toBe('198.51.100.4');
  });
  it('falls back to X-Real-IP only when req.ip is empty', () => {
    expect(clientIp({ headers: { 'x-real-ip': ' 203.0.113.9 ' }, ip: '' } as any)).toBe('203.0.113.9');
    expect(clientIp({ headers: { 'x-real-ip': ['203.0.113.1', '203.0.113.2'] } } as any)).toBe('203.0.113.1');
  });
  it('no IP at all is one shared "unknown" bucket (still limited)', () => {
    expect(clientIp({ headers: {} } as any)).toBe('unknown');
    expect(clientIp({ headers: { 'x-real-ip': '' }, ip: '' } as any)).toBe('unknown');
  });
});
