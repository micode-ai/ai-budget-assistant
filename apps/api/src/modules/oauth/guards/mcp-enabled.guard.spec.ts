import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { McpEnabledGuard } from './mcp-enabled.guard';

const guard = (env: Record<string, string>) =>
  new McpEnabledGuard({ get: (k: string) => env[k] } as unknown as ConfigService);

describe('McpEnabledGuard', () => {
  it('404s unless BOTH PUBLIC_API_ENABLED and MCP_ENABLED are true', () => {
    expect(() => guard({}).canActivate()).toThrow(NotFoundException);
    expect(() => guard({ PUBLIC_API_ENABLED: 'true' }).canActivate()).toThrow(NotFoundException);
    expect(() => guard({ MCP_ENABLED: 'true' }).canActivate()).toThrow(NotFoundException);
    expect(() => guard({ PUBLIC_API_ENABLED: 'false', MCP_ENABLED: 'true' }).canActivate()).toThrow(NotFoundException);
  });

  it('passes when both are on (trimmed, any case)', () => {
    expect(guard({ PUBLIC_API_ENABLED: 'TRUE ', MCP_ENABLED: ' true' }).canActivate()).toBe(true);
  });
});
