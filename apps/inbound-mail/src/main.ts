import { createApiClient } from './apiClient';
import { mailauthAuthenticate } from './authenticate';
import { loadConfig } from './config';
import { Semaphore } from './handlers';
import { logger } from './log';
import { extractInWorker } from './extractInWorker';
import { PenaltyBox } from './policy';
import { createInboundServer } from './server';

function main(): void {
  const config = loadConfig();
  const inbound = createInboundServer({
    config,
    api: createApiClient({ baseUrl: config.apiUrl, secret: config.secret, timeoutMs: config.apiTimeoutMs }),
    authenticate: mailauthAuthenticate,
    log: logger,
    penalty: new PenaltyBox(),
    gate: new Semaphore(2),
    // mailparser + html-to-text run in a worker thread that is terminated on timeout.
    extract: (raw, ctx) => extractInWorker(raw, ctx, { timeoutMs: 20_000 }),
  });

  inbound.server.listen(config.port, '0.0.0.0', () => {
    logger.info('inbound-mail listening', { port: config.port, domain: config.domain });
  });

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('shutting down', { signal });
    inbound.stop();
    // Stop accepting, let in-flight DATA finish (smtp-server closes idle sockets), then exit.
    const force = setTimeout(() => process.exit(0), 25_000);
    force.unref();
    inbound.server.close(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

try {
  main();
} catch (err) {
  logger.error('fatal startup error', { error: err instanceof Error ? err.message : 'unknown' });
  process.exit(1);
}
