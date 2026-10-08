import { authenticate } from 'mailauth';
import type { AuthSummary } from './policy';

export type AuthenticateFn = (
  raw: Buffer,
  ctx: { ip: string; helo: string; sender: string; mta: string },
) => Promise<AuthSummary>;

/** SPF + DKIM + DMARC + ARC verification through mailauth, flattened to what the policy needs. */
export const mailauthAuthenticate: AuthenticateFn = async (raw, ctx) => {
  const r = await authenticate(raw, {
    ip: ctx.ip,
    helo: ctx.helo,
    sender: ctx.sender,
    mta: ctx.mta,
    disableBimi: true, // BIMI would fetch remote SVGs; never needed here
  });
  return {
    spf: r.spf ? r.spf.status.result : 'none',
    dkim: (r.dkim?.results ?? []).map((d) => ({
      domain: (d.signingDomain ?? '').toLowerCase(),
      result: d.status.result,
      aligned: Boolean(d.status.aligned),
    })),
    headerFrom: (r.dkim?.headerFrom ?? []).map((x: string) => String(x).toLowerCase()),
    dmarc: r.dmarc
      ? { result: r.dmarc.status.result, policy: String(r.dmarc.policy ?? 'none').toLowerCase() }
      : { result: 'none', policy: 'none' },
    arc: r.arc
      ? {
          result: r.arc.status.result,
          sealer: r.arc.signature ? (r.arc.signature.signingDomain ?? '').toLowerCase() || null : null,
        }
      : { result: 'none', sealer: null },
  };
};
