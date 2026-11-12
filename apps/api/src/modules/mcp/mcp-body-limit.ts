import { json, type NextFunction, type Request, type RequestHandler, type Response } from 'express';

/** Largest request body `POST /mcp` accepts. A JSON-RPC tool call is a few hundred bytes. */
export const MCP_BODY_LIMIT_BYTES = 128 * 1024;

/** The route the limit is mounted on in main.ts (served without the api/v1 prefix). */
export const MCP_PATH = '/mcp';

function rpcError(res: Response, status: number, code: number, message: string): void {
  res.status(status).json({ jsonrpc: '2.0', error: { code, message }, id: null });
}

/**
 * The JSON parser of `/mcp`, mounted in main.ts BEFORE the app-wide parsers (whose JSON limit is
 * 50 MB for base64 uploads) — the same pattern as `registerBodyLimit` for `/oauth/register`.
 * body-parser marks a parsed request, so the global parsers skip it afterwards. `/mcp` is reachable
 * before authentication, so an oversized body is refused before it is read (declared
 * Content-Length) or while it is read (chunked), with a JSON-RPC-shaped 413. Malformed JSON is a
 * JSON-RPC parse error (400, -32700). A non-JSON content type is left alone: the transport answers
 * it with 415. No `rawBody` is kept — `/mcp` verifies no signature.
 *
 * `enabled` is read per request (the MCP flag): while it is false the middleware calls `next()`
 * untouched, so `/mcp` is fully dark (the flag guard's 404, never a JSON-RPC 400/413).
 */
export function mcpBodyLimit(enabled: () => boolean = () => true): RequestHandler {
  const parse = json({ limit: MCP_BODY_LIMIT_BYTES });
  return (req: Request, res: Response, next: NextFunction) => {
    if (!enabled()) return next();
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > MCP_BODY_LIMIT_BYTES) return rpcError(res, 413, -32000, 'Request body too large.');
    parse(req, res, (err?: unknown) => {
      if (!err) return next();
      if ((err as { status?: number }).status === 413) return rpcError(res, 413, -32000, 'Request body too large.');
      rpcError(res, 400, -32700, 'Parse error.');
    });
  };
}
