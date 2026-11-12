import * as express from 'express';
import { json } from 'express';
import * as request from 'supertest';
import { DCR_REGISTER_PATH, registerBodyLimit } from '../oauth/register-body-limit';
import { MCP_BODY_LIMIT_BYTES, MCP_PATH, mcpBodyLimit } from './mcp-body-limit';

/** Mirrors main.ts: the route-scoped limits first, then the app-wide 50 MB JSON parser with rawBody. */
function app() {
  const a = express();
  a.use(DCR_REGISTER_PATH, registerBodyLimit());
  a.use(MCP_PATH, mcpBodyLimit());
  a.use(json({ limit: '50mb', verify: (req: express.Request & { rawBody?: Buffer }, _res, buf) => void (req.rawBody = buf) }));
  a.post(MCP_PATH, (req, res) => res.status(200).json({ got: req.body, raw: (req as express.Request & { rawBody?: Buffer }).rawBody !== undefined }));
  a.post('/stripe/webhook', (req, res) =>
    res.status(200).json({ size: JSON.stringify(req.body).length, raw: (req as express.Request & { rawBody?: Buffer }).rawBody?.length }),
  );
  return a;
}

describe('mcpBodyLimit', () => {
  it('parses a normal JSON-RPC body', async () => {
    const r = await request(app()).post(MCP_PATH).send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(r.status).toBe(200);
    expect(r.body.got.method).toBe('tools/list');
  });

  it('refuses a body over 128 KB with a JSON-RPC 413, declared or not', async () => {
    const r = await request(app()).post(MCP_PATH).send({ pad: 'a'.repeat(MCP_BODY_LIMIT_BYTES) });
    expect(r.status).toBe(413);
    expect(r.body).toEqual({ jsonrpc: '2.0', error: { code: -32000, message: expect.any(String) }, id: null });
  });

  it('does not touch other routes: they keep the app-wide limit and their rawBody', async () => {
    const body = JSON.stringify({ pad: 'a'.repeat(MCP_BODY_LIMIT_BYTES * 2) });
    const r = await request(app()).post('/stripe/webhook').set('Content-Type', 'application/json').send(body);
    expect(r.status).toBe(200);
    expect(r.body.raw).toBe(Buffer.byteLength(body));
  });
});

describe('route-scoped parsers while MCP is off', () => {
  /** main.ts with the flag off: both parsers step aside, the global parser runs, no route → 404. */
  function darkApp() {
    const a = express();
    a.use(DCR_REGISTER_PATH, registerBodyLimit(() => false));
    a.use(MCP_PATH, mcpBodyLimit(() => false));
    a.use(json({ limit: '50mb' }));
    a.use((_req, res) => res.status(404).json({ statusCode: 404 }));
    return a;
  }

  it('/mcp: an oversized, a malformed and a normal body all 404 (never 413/400)', async () => {
    const big = await request(darkApp()).post(MCP_PATH).send({ pad: 'a'.repeat(MCP_BODY_LIMIT_BYTES * 2) });
    expect(big.status).toBe(404);
    const bad = await request(darkApp()).post(MCP_PATH).set('Content-Type', 'application/json').send('{"a":');
    expect(bad.status).not.toBe(413);
    expect(bad.body.error?.code).toBeUndefined();
    const ok = await request(darkApp()).post(MCP_PATH).send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(ok.status).toBe(404);
  });

  it('/oauth/register: an oversized body and a declared huge Content-Length 404, never the RFC 7591 413', async () => {
    const big = await request(darkApp()).post(DCR_REGISTER_PATH).send({ client_name: 'X', pad: 'a'.repeat(64 * 1024) });
    expect(big.status).toBe(404);
    expect(big.body.error).toBeUndefined();
  });

  it('the flag is read per request: turning it on makes the caps apply', async () => {
    let on = false;
    const a = express();
    a.use(MCP_PATH, mcpBodyLimit(() => on));
    a.use(json({ limit: '50mb' }));
    a.use((_req, res) => res.status(404).end());
    const body = { pad: 'a'.repeat(MCP_BODY_LIMIT_BYTES) };
    expect((await request(a).post(MCP_PATH).send(body)).status).toBe(404);
    on = true;
    expect((await request(a).post(MCP_PATH).send(body)).status).toBe(413);
  });
});
