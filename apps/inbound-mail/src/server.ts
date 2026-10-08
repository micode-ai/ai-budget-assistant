import { readFileSync, statSync } from 'fs';
import { SMTPServer, type SMTPServerSession } from 'smtp-server';
import { ByteBudget } from './budget';
import { DATA_TIMEOUT_MS, MAX_INFLIGHT_BYTES, MAX_MESSAGE_BYTES } from './config';
import { readData, type AbortReason } from './dataReader';
import { handleData, handleRcptTo, type Deps } from './handlers';
import type { SmtpReply } from './policy';

// Sized for the 384M container: every session can hold up to 15 MB of raw DATA, but the shared
// byte budget (MAX_INFLIGHT_BYTES) is what actually bounds memory; the counts only bound sockets.
export const MAX_CLIENTS = 20;
export const MAX_PER_IP = 2;
export const TLS_RELOAD_MS = 6 * 60 * 60 * 1000;

function toError(reply: SmtpReply): Error & { responseCode: number } {
  return Object.assign(new Error(reply.text), { responseCode: reply.code });
}

/**
 * smtp-server only replies once the DATA stream has ended, so an over-limit upload cannot be
 * answered in the normal way without reading all of it. Write the reply on the socket and
 * close it (destroySoon flushes, then destroys: nothing more is read).
 */
function abortConnection(server: SMTPServer, session: SMTPServerSession, reply: SmtpReply): void {
  type Conn = { session: { id: string }; _socket?: { write(s: string): void; destroySoon(): void; destroy(): void } };
  const conns = (server as unknown as { connections: Set<Conn> }).connections;
  for (const c of conns) {
    if (c.session.id !== session.id || !c._socket) continue;
    try {
      c._socket.write(`${reply.code} ${reply.text}\r\n`);
      c._socket.destroySoon();
    } catch {
      c._socket.destroy();
    }
    return;
  }
}

function loadTls(deps: Deps): { key: Buffer; cert: Buffer } | null {
  const { tlsCert, tlsKey } = deps.config;
  if (!tlsCert || !tlsKey) return null;
  try {
    return { key: readFileSync(tlsKey), cert: readFileSync(tlsCert) };
  } catch {
    return null;
  }
}

export interface InboundServer {
  server: SMTPServer;
  /** Stops the periodic certificate reload. */
  stop(): void;
}

/** Receive-only SMTP server: AUTH disabled, no relay, no outbound code anywhere in this package. */
export interface ServerOptions {
  maxClients?: number;
  maxPerIp?: number;
  inflightBytes?: number;
  dataTimeoutMs?: number;
  maxMessageBytes?: number;
}

const ABORT_REPLY: Record<AbortReason, SmtpReply> = {
  size: { code: 552, text: '5.3.4 Message size exceeds fixed limit' },
  budget: { code: 452, text: '4.3.1 Insufficient system storage, try again later' },
  timeout: { code: 451, text: '4.4.2 Timeout receiving data' },
};

export function createInboundServer(deps: Deps, opts: ServerOptions = {}): InboundServer {
  const maxClients = opts.maxClients ?? MAX_CLIENTS;
  const maxPerIp = opts.maxPerIp ?? MAX_PER_IP;
  const maxMessageBytes = opts.maxMessageBytes ?? MAX_MESSAGE_BYTES;
  const dataTimeoutMs = opts.dataTimeoutMs ?? DATA_TIMEOUT_MS;
  const budget = new ByteBudget(opts.inflightBytes ?? MAX_INFLIGHT_BYTES);
  const perIp = new Map<string, number>();
  const tls = loadTls(deps);
  if (!tls) deps.log.warn('TLS certificate missing or unreadable: serving WITHOUT STARTTLS');

  const server = new SMTPServer({
    name: deps.config.hostname,
    banner: `${deps.config.hostname} ESMTP receive-only`,
    secure: false,
    hideSTARTTLS: tls === null, // never fall back to smtp-server's built-in self-signed cert
    ...(tls ? { key: tls.key, cert: tls.cert } : {}),
    disabledCommands: ['AUTH'],
    authOptional: true,
    size: maxMessageBytes,
    maxClients,
    socketTimeout: 60_000,
    closeTimeout: 30_000,
    disableReverseLookup: true,
    onConnect(session, callback) {
      const ip = session.remoteAddress;
      if (deps.penalty.isBoxed(ip)) {
        deps.log.info('connection refused: penalty box', { remoteIp: ip });
        return callback(toError({ code: 421, text: '4.7.0 Too many invalid recipients, try again later' }));
      }
      const n = (perIp.get(ip) ?? 0) + 1;
      if (n > maxPerIp) {
        return callback(toError({ code: 421, text: '4.7.0 Too many connections from your address' }));
      }
      perIp.set(ip, n);
      callback();
    },
    onClose(session) {
      const ip = session.remoteAddress;
      const n = (perIp.get(ip) ?? 1) - 1;
      if (n <= 0) perIp.delete(ip);
      else perIp.set(ip, n);
    },
    onRcptTo(address, session, callback) {
      handleRcptTo(address.address, session.remoteAddress, session.envelope.rcptTo.length, deps)
        .then((reply) => callback(reply ? toError(reply) : undefined))
        .catch(() => callback(toError({ code: 451, text: '4.3.0 Temporary local problem, try again later' })));
    },
    onData(stream, session: SMTPServerSession, callback) {
      void readData(stream, { maxBytes: maxMessageBytes, timeoutMs: dataTimeoutMs, budget })
        .then(async (res) => {
          if (res.aborted) {
            // Do not drain a hostile upload: answer, then drop the connection.
            deps.log.info('data aborted', { remoteIp: session.remoteAddress, reason: res.aborted });
            abortConnection(server, session, ABORT_REPLY[res.aborted]);
            return;
          }
          try {
            const reply = await handleData(
              res.raw,
              {
                remoteIp: session.remoteAddress,
                helo: session.hostNameAppearsAs ?? session.clientHostname ?? '',
                envelopeFrom: session.envelope.mailFrom ? session.envelope.mailFrom.address : '',
                recipients: session.envelope.rcptTo.map((r) => r.address),
                sizeExceeded: false,
              },
              deps,
            );
            callback(reply ? toError(reply) : undefined);
          } finally {
            res.release();
          }
        })
        .catch(() => callback(toError({ code: 451, text: '4.3.0 Temporary local problem, try again later' })));
    },
  });

  server.on('error', (err) => deps.log.error('smtp server error', { error: err.name }));

  // Certbot renews in place: pick the new files up without a restart.
  let lastMtime = certMtime(deps);
  const timer = setInterval(() => {
    const m = certMtime(deps);
    if (m === null || m === lastMtime) return;
    const next = loadTls(deps);
    if (!next) return;
    server.updateSecureContext({ key: next.key, cert: next.cert });
    lastMtime = m;
    deps.log.info('TLS certificate reloaded');
  }, TLS_RELOAD_MS);
  timer.unref();

  return { server, stop: () => clearInterval(timer) };
}

function certMtime(deps: Deps): number | null {
  if (!deps.config.tlsCert) return null;
  try {
    return statSync(deps.config.tlsCert).mtimeMs;
  } catch {
    return null;
  }
}
