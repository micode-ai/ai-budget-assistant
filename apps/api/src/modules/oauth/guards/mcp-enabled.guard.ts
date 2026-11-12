import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isMcpEnabled } from '../mcp.config';

/**
 * Every MCP connector route (`/mcp`, `/oauth/register`, the `.well-known` documents) 404s unless
 * BOTH `PUBLIC_API_ENABLED` and `MCP_ENABLED` are on: with either off the surface does not exist.
 */
@Injectable()
export class McpEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    if (!isMcpEnabled(this.config)) throw new NotFoundException();
    return true;
  }
}
