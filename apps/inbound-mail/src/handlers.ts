import type { ApiClient } from './apiClient';
import type { AuthenticateFn } from './authenticate';
import { MAX_RECIPIENTS, PARSE_DEADLINE_MS, type InboundConfig } from './config';
import { extractMessage, type ExtractContext, type ExtractedMessage } from './extract';
import { ExtractTimeoutError } from './extractInWorker';
import { tokenRef, type Logger } from './log';
import {
  combineReplies,
  evaluateAuth,
  mapHandoffOutcome,
  mapRcptOutcome,
  parseRecipient,
  type PenaltyBox,
  type SmtpReply,
} from './policy';

/** Bounds how many messages are parsed at once so the 192 MB container cannot be OOM-ed. */
export class Semaphore {
  private waiters: Array<() => void> = [];
  private active = 0;
  constructor(private readonly max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    // A woken waiter re-checks: between the release and this continuation another caller may
    // have taken the slot, and a plain `if` would then run more than `max` tasks at once.
    while (this.active >= this.max) await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active += 1;
    try {
      return await fn();
    } finally {
      this.active -= 1;
      this.waiters.shift()?.();
    }
  }
}

export interface Deps {
  config: InboundConfig;
  api: ApiClient;
  authenticate: AuthenticateFn;
  log: Logger;
  penalty: PenaltyBox;
  gate: Semaphore;
  /** Parser; defaults to in-process. main.ts injects the worker_threads runner. */
  extract?: (raw: Buffer, ctx: ExtractContext) => Promise<ExtractedMessage>;
  /** Deadline of the gated authenticate + parse section (default PARSE_DEADLINE_MS). */
  deadlineMs?: number;
}

class DeadlineError extends Error {}

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new DeadlineError('deadline')), ms);
    work.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

const TEMPFAIL_DEADLINE: SmtpReply = { code: 451, text: '4.3.0 Temporary local problem, try again later' };

/** Returns null to accept the recipient, or the SMTP reply to refuse it with. */
export async function handleRcptTo(
  address: string,
  remoteIp: string,
  acceptedSoFar: number,
  deps: Deps,
): Promise<SmtpReply | null> {
  if (acceptedSoFar >= MAX_RECIPIENTS) return { code: 452, text: '4.5.3 Too many recipients' };

  const parsed = parseRecipient(address, deps.config.domain);
  if (!parsed.ok) {
    // A foreign domain is a relay probe, a malformed local part is token guessing: both feed the penalty box.
    deps.penalty.record(remoteIp);
    deps.log.info('rcpt refused', { remoteIp, reason: parsed.reason });
    return parsed.reply;
  }

  const outcome = await deps.api.rcpt(parsed.token, remoteIp);
  const mapped = mapRcptOutcome(outcome);
  if (mapped.operatorProblem) {
    deps.log.error('rcpt call failed: check INBOUND_MAIL_SHARED_SECRET / API', { apiStatus: outcome.status });
  }
  if (outcome.status === 200 && mapped.reply?.code === 550) deps.penalty.record(remoteIp);
  deps.log.info('rcpt', {
    remoteIp,
    token: tokenRef(parsed.token),
    apiStatus: outcome.status,
    smtp: mapped.reply?.code ?? 250,
  });
  return mapped.reply;
}

export interface DataSession {
  remoteIp: string;
  helo: string;
  envelopeFrom: string;
  /** Raw RCPT TO addresses accepted in this transaction. */
  recipients: string[];
  sizeExceeded: boolean;
}

/** `raw` is the complete message (at most MAX_MESSAGE_BYTES). Returns null to answer 250. */
export async function handleData(raw: Buffer, session: DataSession, deps: Deps): Promise<SmtpReply | null> {
  if (session.sizeExceeded) {
    deps.log.info('data refused: too large', { remoteIp: session.remoteIp });
    return { code: 552, text: '5.3.4 Message size exceeds fixed limit' };
  }
  const tokens = [
    ...new Set(
      session.recipients.map((r) => parseRecipient(r, deps.config.domain)).flatMap((p) => (p.ok ? [p.token] : [])),
    ),
  ];
  if (tokens.length === 0) return { code: 550, text: '5.1.1 Unknown recipient' };

  return deps.gate.run(async () => {
    type Gated = { reply: SmtpReply } | { message: ExtractedMessage };
    const gated = async (): Promise<Gated> => {
      let auth;
      try {
        auth = await deps.authenticate(raw, {
          ip: session.remoteIp,
          helo: session.helo,
          sender: session.envelopeFrom,
          mta: deps.config.hostname,
        });
      } catch (err) {
        deps.log.warn('authentication check failed, asking sender to retry', { error: errorName(err) });
        return { reply: { code: 451, text: '4.7.0 Temporary authentication failure, try again later' } };
      }

      const decision = evaluateAuth(auth);
      if (!decision.ok) {
        deps.log.info('data refused: sender authentication', { remoteIp: session.remoteIp, reason: decision.reason });
        return { reply: decision.reply };
      }

      try {
        const extract = deps.extract ?? extractMessage;
        return {
          message: await extract(raw, {
            remoteIp: session.remoteIp,
            helo: session.helo,
            envelopeFrom: session.envelopeFrom,
            auth,
            recipients: session.recipients,
          }),
        };
      } catch (err) {
        if (err instanceof ExtractTimeoutError) throw err;
        deps.log.error('message could not be parsed', { error: errorName(err), bytes: raw.length });
        return { reply: { code: 550, text: '5.6.0 Message could not be processed' } };
      }
    };

    let outcome: Gated;
    try {
      outcome = await withDeadline(gated(), deps.deadlineMs ?? PARSE_DEADLINE_MS);
    } catch (err) {
      if (err instanceof DeadlineError || err instanceof ExtractTimeoutError) {
        deps.log.error('authenticate/parse deadline exceeded', { remoteIp: session.remoteIp, bytes: raw.length });
        return TEMPFAIL_DEADLINE;
      }
      throw err;
    }
    if ('reply' in outcome) return outcome.reply;
    const message = outcome.message;

    const replies: Array<SmtpReply | null> = [];
    for (const token of tokens) {
      const outcome = await deps.api.handoff({ ...message, token });
      const mapped = mapHandoffOutcome(outcome);
      if (mapped.operatorProblem) {
        deps.log.error('handoff call failed: check INBOUND_MAIL_SHARED_SECRET / API', { apiStatus: outcome.status });
      }
      deps.log.info('handoff', {
        token: tokenRef(token),
        remoteIp: session.remoteIp,
        kind: message.kind,
        documentKind: message.document?.kind ?? null,
        bytes: raw.length,
        fromDomain: message.fromAddress.split('@')[1] ?? null,
        apiStatus: outcome.status,
        smtp: mapped.reply?.code ?? 250,
      });
      replies.push(mapped.reply);
    }
    return combineReplies(replies);
  });
}

function errorName(err: unknown): string {
  return err instanceof Error ? err.name : 'unknown';
}
