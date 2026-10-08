import { connect, type Socket } from 'net';
import type { AddressInfo } from 'net';
import type { ApiClient } from './apiClient';
import { buildEml, PASSING_AUTH, PDF_BYTES } from './eml.testutil';
import { Semaphore, type Deps } from './handlers';
import { silentLogger } from './log';
import { PenaltyBox } from './policy';
import { createInboundServer, type InboundServer } from './server';

const TOKEN = 'abcdefghijklmnop';

/** Minimal raw-socket SMTP client: the test must not depend on any outbound mail library. */
const openClients: Client[] = [];

class Client {
  private buf = '';
  private waiters: Array<() => void> = [];
  private constructor(private readonly sock: Socket) {
    sock.setEncoding('latin1');
    sock.on('data', (d: string) => {
      this.buf += d;
      this.waiters.splice(0).forEach((w) => w());
    });
  }
  static async open(port: number): Promise<Client> {
    const sock = connect({ host: '127.0.0.1', port });
    await new Promise<void>((res, rej) => sock.once('connect', res).once('error', rej));
    const client = new Client(sock);
    openClients.push(client);
    return client;
  }
  /** Reads one complete (possibly multi-line) reply. */
  async reply(): Promise<string> {
    for (;;) {
      const lines = this.buf.split('\r\n');
      const last = lines.length - 1;
      for (let i = 0; i < last; i++) {
        if (/^\d{3} /.test(lines[i])) {
          const out = lines.slice(0, i + 1).join('\r\n');
          this.buf = lines.slice(i + 1).join('\r\n');
          return out;
        }
      }
      await new Promise<void>((r) => this.waiters.push(r));
    }
  }
  async cmd(line: string): Promise<string> {
    this.sock.write(`${line}\r\n`);
    return this.reply();
  }
  raw(data: Buffer | string): void {
    this.sock.write(data);
  }
  close(): void {
    this.sock.destroy();
  }
}

describe('SMTP server (real sockets, mocked API)', () => {
  let inbound: InboundServer;
  let port: number;
  const api = { rcpt: jest.fn(), handoff: jest.fn() };

  beforeAll(async () => {
    const deps: Deps = {
      config: {
        domain: 'in.ai-budget.pl',
        hostname: 'mail-in.ai-budget.pl',
        secret: 's',
        apiUrl: 'http://api',
        apiTimeoutMs: 1000,
        port: 0,
      },
      api: api as unknown as ApiClient,
      authenticate: async () => PASSING_AUTH,
      log: silentLogger,
      penalty: new PenaltyBox(),
      gate: new Semaphore(2),
    };
    inbound = createInboundServer(deps);
    await new Promise<void>((res) => inbound.server.listen(0, '127.0.0.1', res));
    port = ((inbound.server.server.address()) as AddressInfo).port;
  });

  afterAll(async () => {
    inbound.stop();
    await new Promise<void>((res) => inbound.server.close(() => res()));
  });

  afterEach(() => {
    openClients.splice(0).forEach((c) => c.close());
  });

  beforeEach(() => {
    api.rcpt.mockReset().mockResolvedValue({ status: 200, body: { result: 'accept' } });
    api.handoff.mockReset().mockResolvedValue({ status: 202 });
  });

  it('greets, advertises no AUTH and no STARTTLS without a certificate', async () => {
    const c = await Client.open(port);
    expect(await c.reply()).toMatch(/^220 mail-in\.ai-budget\.pl/);
    const ehlo = await c.cmd('EHLO test.example');
    expect(ehlo).not.toMatch(/AUTH/i);
    expect(ehlo).not.toMatch(/STARTTLS/i);
    expect(ehlo).toMatch(/SIZE 15728640/);
    c.close();
  });

  it('is not an open relay: RCPT to another domain is 550 5.7.1 and the API is never asked', async () => {
    const c = await Client.open(port);
    await c.reply();
    await c.cmd('EHLO test.example');
    await c.cmd('MAIL FROM:<spammer@evil.example>');
    expect(await c.cmd('RCPT TO:<victim@gmail.com>')).toMatch(/^550 5\.7\.1/);
    expect(await c.cmd('RCPT TO:<victim@ai-budget.pl>')).toMatch(/^550 5\.7\.1/);
    expect(api.rcpt).not.toHaveBeenCalled();
    c.close();
  });

  it('refuses a declared SIZE above 15 MB at MAIL FROM', async () => {
    const c = await Client.open(port);
    await c.reply();
    await c.cmd('EHLO test.example');
    expect(await c.cmd('MAIL FROM:<a@shop.example> SIZE=20000000')).toMatch(/^552/);
    c.close();
  });

  it('maps an unknown token to 550 5.1.1', async () => {
    api.rcpt.mockResolvedValue({ status: 200, body: { result: 'unknown' } });
    const c = await Client.open(port);
    await c.reply();
    await c.cmd('EHLO test.example');
    await c.cmd('MAIL FROM:<a@shop.example>');
    expect(await c.cmd(`RCPT TO:<${TOKEN}@in.ai-budget.pl>`)).toMatch(/^550 5\.1\.1/);
    c.close();
  });

  it('accepts a message end to end: 250 only after the handoff returned 202', async () => {
    const c = await Client.open(port);
    await c.reply();
    await c.cmd('EHLO test.example');
    await c.cmd('MAIL FROM:<orders@shop.example>');
    expect(await c.cmd(`RCPT TO:<${TOKEN}@in.ai-budget.pl>`)).toMatch(/^250/);
    expect(await c.cmd('DATA')).toMatch(/^354/);
    const eml = buildEml({
      text: 'Total 10 PLN',
      attachments: [{ filename: 'p.pdf', contentType: 'application/pdf', content: PDF_BYTES }],
    });
    c.raw(Buffer.concat([eml, Buffer.from('\r\n.\r\n')]));
    expect(await c.reply()).toMatch(/^250/);
    expect(api.handoff).toHaveBeenCalledTimes(1);
    expect(api.handoff.mock.calls[0][0]).toMatchObject({ token: TOKEN, helo: 'test.example', kind: 'receipt' });
    c.close();
  });

  it('answers 451 when the API is down at handoff time', async () => {
    api.handoff.mockResolvedValue({ status: 503 });
    const c = await Client.open(port);
    await c.reply();
    await c.cmd('EHLO test.example');
    await c.cmd('MAIL FROM:<orders@shop.example>');
    await c.cmd(`RCPT TO:<${TOKEN}@in.ai-budget.pl>`);
    await c.cmd('DATA');
    c.raw(Buffer.concat([buildEml({ text: 'x' }), Buffer.from('\r\n.\r\n')]));
    expect(await c.reply()).toMatch(/^451 4\.3\.0/);
    c.close();
  });

  it('refuses AUTH outright', async () => {
    const c = await Client.open(port);
    await c.reply();
    await c.cmd('EHLO test.example');
    expect(await c.cmd('AUTH PLAIN AGZvbwBiYXI=')).toMatch(/^5\d\d/);
    c.close();
  });
});

describe('SMTP server resource limits (ABA-644 audit M2)', () => {
  const api = { rcpt: jest.fn(), handoff: jest.fn() };
  const make = async (opts: Parameters<typeof createInboundServer>[1]): Promise<{ inbound: InboundServer; port: number }> => {
    api.rcpt.mockReset().mockResolvedValue({ status: 200, body: { result: 'accept' } });
    api.handoff.mockReset().mockResolvedValue({ status: 202 });
    const deps: Deps = {
      config: { domain: 'in.ai-budget.pl', hostname: 'mail-in.ai-budget.pl', secret: 's', apiUrl: 'http://api', apiTimeoutMs: 1000, port: 0 },
      api: api as unknown as ApiClient,
      authenticate: async () => PASSING_AUTH,
      log: silentLogger,
      penalty: new PenaltyBox(),
      gate: new Semaphore(2),
    };
    const inbound = createInboundServer(deps, opts);
    await new Promise<void>((res) => inbound.server.listen(0, '127.0.0.1', res));
    return { inbound, port: (inbound.server.server.address() as AddressInfo).port };
  };
  const stop = async (i: InboundServer): Promise<void> => {
    openClients.splice(0).forEach((c) => c.close());
    i.stop();
    await new Promise<void>((res) => i.server.close(() => res()));
  };
  const toData = async (c: Client): Promise<void> => {
    await c.reply();
    await c.cmd('EHLO t.example');
    await c.cmd('MAIL FROM:<orders@shop.example>');
    await c.cmd(`RCPT TO:<${TOKEN}@in.ai-budget.pl>`);
    expect(await c.cmd('DATA')).toMatch(/^354/);
  };
  afterEach(() => {
    openClients.splice(0).forEach((c) => c.close());
  });

  it('aborts with 552 as soon as the stream passes the cap, instead of draining the upload', async () => {
    const { inbound, port } = await make({ maxMessageBytes: 50_000 });
    try {
      const c = await Client.open(port);
      await toData(c);
      c.raw(Buffer.alloc(200_000, 0x61));
      expect(await c.reply()).toMatch(/^552 5\.3\.4/);
      expect(api.handoff).not.toHaveBeenCalled();
    } finally {
      await stop(inbound);
    }
  });

  it('answers 452 4.3.1 when the global in-flight budget is exhausted', async () => {
    const { inbound, port } = await make({ inflightBytes: 10_000 });
    try {
      const c = await Client.open(port);
      await toData(c);
      c.raw(Buffer.alloc(50_000, 0x61));
      expect(await c.reply()).toMatch(/^452 4\.3\.1/);
    } finally {
      await stop(inbound);
    }
  });

  it('cuts off a slowloris that never finishes DATA', async () => {
    const { inbound, port } = await make({ dataTimeoutMs: 300 });
    try {
      const c = await Client.open(port);
      await toData(c);
      c.raw('Subject: slow\r\n');
      expect(await c.reply()).toMatch(/^451 4\.4\.2/);
    } finally {
      await stop(inbound);
    }
  });

  it('frees the budget after a successful message so the next one is accepted', async () => {
    const { inbound, port } = await make({ inflightBytes: 60_000 });
    try {
      for (let i = 0; i < 3; i++) {
        const c = await Client.open(port);
        await toData(c);
        c.raw(Buffer.concat([buildEml({ text: 'x'.repeat(30_000) }), Buffer.from('\r\n.\r\n')]));
        expect(await c.reply()).toMatch(/^250/);
        c.close();
      }
    } finally {
      await stop(inbound);
    }
  });

  it('refuses a third concurrent connection from one IP', async () => {
    const { inbound, port } = await make({});
    try {
      const a = await Client.open(port);
      const b = await Client.open(port);
      await a.reply();
      await b.reply();
      const c = await Client.open(port);
      expect(await c.reply()).toMatch(/^421/);
    } finally {
      await stop(inbound);
    }
  });
});
