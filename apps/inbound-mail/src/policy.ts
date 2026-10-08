/** Pure decision functions: recipient parsing, API-status to SMTP-reply mapping, auth policy. */

export const TOKEN_PATTERN = /^[a-z2-7]{16}$/;

export interface SmtpReply {
  code: number;
  /** Enhanced status code + text, e.g. "5.1.1 Unknown recipient". */
  text: string;
}

export type RecipientParse =
  | { ok: true; token: string }
  | { ok: false; reason: 'foreign_domain' | 'bad_local'; reply: SmtpReply };

export function parseRecipient(address: string, domain: string): RecipientParse {
  const at = address.lastIndexOf('@');
  if (at <= 0) {
    return { ok: false, reason: 'bad_local', reply: { code: 550, text: '5.1.1 Unknown recipient' } };
  }
  const local = address.slice(0, at).toLowerCase();
  const host = address.slice(at + 1).toLowerCase();
  if (host !== domain.toLowerCase()) {
    return { ok: false, reason: 'foreign_domain', reply: { code: 550, text: '5.7.1 Relaying denied' } };
  }
  const plus = local.indexOf('+');
  const base = plus === -1 ? local : local.slice(0, plus);
  if (!TOKEN_PATTERN.test(base)) {
    return { ok: false, reason: 'bad_local', reply: { code: 550, text: '5.1.1 Unknown recipient' } };
  }
  return { ok: true, token: base };
}

/** Result of one internal API call. `status` is 0 for a timeout or network error. */
export interface ApiOutcome {
  status: number;
  body?: unknown;
}

const TEMPFAIL: SmtpReply = { code: 451, text: '4.3.0 Temporary local problem, try again later' };

export interface Mapped {
  reply: SmtpReply | null; // null = success (250)
  /** True for 401/403/unrecognised: an operator problem that must be logged loudly. */
  operatorProblem: boolean;
}

/** POST /internal/inbound-mail/rcpt */
export function mapRcptOutcome(o: ApiOutcome): Mapped {
  if (o.status === 200) {
    const result = (o.body as { result?: unknown } | undefined)?.result;
    if (result === 'accept') return { reply: null, operatorProblem: false };
    if (result === 'unknown') return { reply: { code: 550, text: '5.1.1 Unknown recipient' }, operatorProblem: false };
    if (result === 'limited') return { reply: { code: 452, text: '4.2.2 Mailbox is receiving too much mail, try later' }, operatorProblem: false };
    return { reply: TEMPFAIL, operatorProblem: true };
  }
  if (o.status === 400) return { reply: { code: 550, text: '5.1.1 Unknown recipient' }, operatorProblem: false };
  if (o.status === 401 || o.status === 403) return { reply: TEMPFAIL, operatorProblem: true };
  return { reply: TEMPFAIL, operatorProblem: false };
}

/** POST /internal/inbound-mail/messages: SMTP answers 250 only after the API persisted. */
export function mapHandoffOutcome(o: ApiOutcome): Mapped {
  if (o.status === 202 || o.status === 409 || o.status === 422) return { reply: null, operatorProblem: false };
  if (o.status === 404) return { reply: { code: 550, text: '5.1.1 Unknown recipient' }, operatorProblem: false };
  if (o.status === 400) return { reply: { code: 550, text: '5.6.0 Message rejected' }, operatorProblem: false };
  if (o.status === 429) return { reply: { code: 452, text: '4.2.2 Mailbox is receiving too much mail, try later' }, operatorProblem: false };
  if (o.status === 401 || o.status === 403) return { reply: TEMPFAIL, operatorProblem: true };
  return { reply: TEMPFAIL, operatorProblem: false };
}

/** Several recipients in one transaction: any transient failure wins, then success, then the first permanent one. */
export function combineReplies(replies: Array<SmtpReply | null>): SmtpReply | null {
  const transient = replies.find((r) => r && r.code >= 400 && r.code < 500);
  if (transient) return transient;
  if (replies.some((r) => r === null)) return null;
  return replies.find((r) => r !== null) ?? null;
}

// ---------------------------------------------------------------- authentication policy

export interface AuthSummary {
  spf: string;
  /** `aligned`: mailauth's verdict that this signature's domain aligns with the header From domain. */
  dkim: Array<{ domain: string; result: string; aligned?: boolean }>;
  /** Every address mailauth found in From headers (more than one means a duplicated From). */
  headerFrom?: string[];
  dmarc: { result: string; policy: string };
  arc: { result: string; sealer: string | null };
}

const TRUSTED_ARC_SEALERS = ['google.com', 'outlook.com', 'microsoft.com'];

export function trustedArcPass(a: AuthSummary): boolean {
  if (a.arc.result !== 'pass' || !a.arc.sealer) return false;
  const sealer = a.arc.sealer.toLowerCase();
  return TRUSTED_ARC_SEALERS.some((d) => sealer === d || sealer.endsWith(`.${d}`));
}

export type AuthDecision = { ok: true } | { ok: false; reason: string; reply: SmtpReply };

export function evaluateAuth(a: AuthSummary): AuthDecision {
  const reject = (reason: string): AuthDecision => ({
    ok: false,
    reason,
    reply: { code: 550, text: '5.7.1 Message failed sender authentication' },
  });
  const dmarcEnforced = a.dmarc.result === 'fail' && (a.dmarc.policy === 'reject' || a.dmarc.policy === 'quarantine');
  if (dmarcEnforced && !trustedArcPass(a)) return reject('dmarc_fail');
  const dkimPass = a.dkim.some((d) => d.result === 'pass');
  if (a.spf !== 'pass' && !dkimPass) return reject('no_spf_or_dkim_pass');
  return { ok: true };
}

/** Compact strings for the handoff payload (the API caps each at 32 chars, dkim at 10 entries). */
export function authPayload(a: AuthSummary): { spf: string; dkim: string[]; dmarc: string; arc: string } {
  return {
    spf: a.spf.slice(0, 32),
    dkim: a.dkim.slice(0, 10).map((d) => `${d.result}:${d.domain}`.slice(0, 32)),
    dmarc: a.dmarc.result.slice(0, 32),
    arc: a.arc.result.slice(0, 32),
  };
}

// ---------------------------------------------------------------- bad-RCPT penalty box

/** In-memory (per container): N bad recipients inside the window put the IP in the box. */
export class PenaltyBox {
  private readonly hits = new Map<string, number[]>();
  private readonly boxed = new Map<string, number>();

  constructor(
    private readonly maxHits = 10,
    private readonly windowMs = 10 * 60_000,
    private readonly banMs = 60 * 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  record(ip: string): void {
    const t = this.now();
    const recent = (this.hits.get(ip) ?? []).filter((x) => t - x < this.windowMs);
    recent.push(t);
    this.hits.set(ip, recent);
    if (recent.length >= this.maxHits) {
      this.boxed.set(ip, t + this.banMs);
      this.hits.delete(ip);
    }
  }

  isBoxed(ip: string): boolean {
    const until = this.boxed.get(ip);
    if (until === undefined) return false;
    if (this.now() >= until) {
      this.boxed.delete(ip);
      return false;
    }
    return true;
  }
}
