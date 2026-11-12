import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MCP_TOOLS, runMcpTool, type McpToolDeps } from './mcp-tools';

export type McpServerContext = McpToolDeps;

export const MCP_SERVER_INFO = { name: 'ai-budget-assistant', version: '1.0.0' } as const;

const INSTRUCTIONS =
  'Read-only access to the user\'s AI Budget Assistant data: expenses, incomes, categories, budgets and spending totals. ' +
  'If the connection covers several accounts, call list_accounts first and pass account_id to the other tools. ' +
  'List tools return at most 200 rows per call; page with cursor = next_cursor while has_more is true.';

/**
 * A fresh MCP server for ONE `/mcp` request (the transport is stateless): the nine read tools,
 * each bound to this request's bearer token. Every tool authorizes itself through the shared
 * `PublicApiAuthorizer` on the MCP resource — the server holds no authorization state of its own.
 */
export function createMcpServer(ctx: McpServerContext): McpServer {
  const server = new McpServer(MCP_SERVER_INFO, { capabilities: { tools: {} }, instructions: INSTRUCTIONS });
  // Typed loosely on purpose: the SDK's generic signature over a heterogeneous tool list sends tsc
  // into "excessively deep" instantiation. The SDK still validates `args` against `t.input` at runtime.
  const register = server.registerTool.bind(server) as unknown as (
    name: string,
    config: Record<string, unknown>,
    cb: (args: Record<string, unknown>) => Promise<CallToolResult>,
  ) => void;
  for (const t of MCP_TOOLS) {
    register(
      t.name,
      {
        title: t.title,
        description: t.description,
        inputSchema: t.input,
        annotations: { title: t.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      },
      (args) => runMcpTool(t, ctx, args ?? {}),
    );
  }
  return server;
}
