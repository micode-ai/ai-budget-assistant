import * as express from 'express';
import { json } from 'express';
import * as request from 'supertest';
import { DCR_BODY_LIMIT_BYTES, DCR_REGISTER_PATH, registerBodyLimit } from './register-body-limit';

/** Mirrors main.ts: the route-scoped limit first, then the app-wide 50 MB JSON parser. */
function app() {
  const a = express();
  a.use(DCR_REGISTER_PATH, registerBodyLimit());
  a.use(json({ limit: '50mb' }));
  a.post(DCR_REGISTER_PATH, (req, res) => res.status(201).json({ got: req.body }));
  a.post('/other', (req, res) => res.status(200).json({ size: JSON.stringify(req.body).length }));
  return a;
}

describe('registerBodyLimit', () => {
  it('lets a normal registration body through, parsed', async () => {
    const r = await request(app()).post(DCR_REGISTER_PATH).send({ client_name: 'X', redirect_uris: ['https://x.pl/cb'] });
    expect(r.status).toBe(201);
    expect(r.body.got.client_name).toBe('X');
  });

  it('refuses a body over 16 KB with an RFC 7591-shaped 413', async () => {
    expect(DCR_BODY_LIMIT_BYTES).toBe(16 * 1024);
    const r = await request(app())
      .post(DCR_REGISTER_PATH)
      .send({ client_name: 'X', pad: 'a'.repeat(DCR_BODY_LIMIT_BYTES) });
    expect(r.status).toBe(413);
    expect(r.body).toEqual({ error: 'invalid_client_metadata', error_description: expect.any(String) });
  });

  it('a malformed JSON body is a 400 in the RFC shape', async () => {
    const r = await request(app()).post(DCR_REGISTER_PATH).set('Content-Type', 'application/json').send('{"a":');
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('invalid_client_metadata');
  });

  it('does not touch other routes (they keep the app-wide limit)', async () => {
    const r = await request(app()).post('/other').send({ pad: 'a'.repeat(DCR_BODY_LIMIT_BYTES * 2) });
    expect(r.status).toBe(200);
  });
});
