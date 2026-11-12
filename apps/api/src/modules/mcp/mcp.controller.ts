import { Controller, Delete, Get, Logger, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';
import { logFireAndForget } from '../../common/utils/fire-and-forget';
import { PrismaService } from '../../database/prisma.service';
import { BudgetsService } from '../budgets/budgets.service';
import { McpEnabledGuard } from '../oauth/guards/mcp-enabled.guard';
import { mcpResourceUrl } from '../oauth/mcp.config';
import { PublicAnalyticsService } from '../public-api/public-analytics.service';
import { PublicApiAuthorizer } from '../public-api/public-api-authorizer.service';
import { authenticateMcp } from './mcp-auth';
import { createMcpServer } from './mcp-server.factory';

/**
 * `POST /mcp` — the MCP connector (Streamable HTTP, STATELESS: a new server + transport per request,
 * no session id, JSON responses, no SSE stream). Outside the api/v1 prefix (global-prefix-exclusions.ts),
 * public CORS (cors-options.ts), 404 unless PUBLIC_API_ENABLED and MCP_ENABLED.
 *
 * Not JwtAuthGuard/AccountContextGuard: the caller is a third-party assistant holding an OAuth
 * token bound to MCP_RESOURCE_URL. Per request: flags -> bearer (mcp-auth.ts; 401 + the
 * resource-metadata challenge) -> the MCP server, whose every tool authorizes itself again through
 * the same PublicApiAuthorizer (scope, account, rate limit).
 *
 * The body is parsed by the route's own 128 KB parser (mcp-body-limit.ts, mounted in main.ts ahead of
 * the app-wide one), so it is handed to the transport as `req.body`. A JSON-RPC batch (array) is
 * refused with 400 / -32600 before anything else.
 *
 * Never logs the token, the request body or any result.
 */
@ApiExcludeController()
@Controller('mcp')
@UseGuards(McpEnabledGuard)
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly authorizer: PublicApiAuthorizer,
    private readonly prisma: PrismaService,
    private readonly budgets: BudgetsService,
    private readonly analytics: PublicAnalyticsService,
  ) {}

  @Post()
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    // JSON-RPC batching is refused outright: one POST could otherwise carry thousands of tool calls,
    // each with its own token lookup. Checked before authentication — it costs nothing to refuse.
    if (Array.isArray(req.body)) {
      res.status(400).json({ jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request: batching is not supported.' }, id: null });
      return;
    }
    const auth = await authenticateMcp(this.authorizer, this.config, req.headers.authorization);
    if (!auth.ok) {
      res.status(auth.status).setHeader('WWW-Authenticate', auth.wwwAuthenticate);
      res.setHeader('Cache-Control', 'no-store');
      res.json(auth.body);
      return;
    }

    const server = createMcpServer({
      bearer: auth.bearer,
      resource: mcpResourceUrl(this.config),
      authorizer: this.authorizer,
      prisma: this.prisma,
      budgets: this.budgets,
      analytics: this.analytics,
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      void transport.close().catch(logFireAndForget(this.logger, 'McpController.closeTransport'));
      void server.close().catch(logFireAndForget(this.logger, 'McpController.closeServer'));
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      this.logger.warn(`mcp request failed: ${(err as Error)?.name ?? 'Error'}`);
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
    }
  }

  /** Stateless: there is no server-to-client stream to open. */
  @Get()
  get(@Res() res: Response): void {
    methodNotAllowed(res);
  }

  /** Stateless: there is no session to end. */
  @Delete()
  remove(@Res() res: Response): void {
    methodNotAllowed(res);
  }
}

function methodNotAllowed(res: Response): void {
  res.status(405).setHeader('Allow', 'POST');
  res.json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null });
}
