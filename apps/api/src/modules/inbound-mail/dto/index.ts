import { z } from 'zod';
import { INBOUND_TOKEN_PATTERN } from '../inbound-mail.config';

/**
 * Local Zod schemas: the API never imports runtime values from @budget/shared-*.
 * The TS shape lives in shared-types as `InboundMailHandoffPayload`.
 */

export const RcptRequestSchema = z.object({
  token: z.string().max(64),
  remoteIp: z.string().max(64),
});

const short = (max: number) => z.string().max(max);

export const HandoffPayloadSchema = z.object({
  token: z.string().regex(INBOUND_TOKEN_PATTERN),
  remoteIp: short(64),
  helo: short(255),
  envelopeFrom: short(320),
  auth: z.object({
    spf: short(32),
    dkim: z.array(short(32)).max(10),
    dmarc: short(32),
    arc: short(32),
  }),
  messageIdHash: z.string().regex(/^[0-9a-f]{64}$/),
  fromAddress: short(320),
  subject: short(2000).nullable(),
  date: short(64).nullable(),
  kind: z.enum(['receipt', 'forwarding_verification']),
  verificationCode: z.string().regex(/^\d{6,12}$/).optional(),
  document: z
    .object({
      kind: z.enum(['pdf', 'image', 'text']),
      mimeType: short(100),
      filename: short(255).optional(),
      // 10 MB of bytes is ~13.4M base64 chars; leave headroom, the byte caps are enforced after decoding.
      base64: z.string().max(14_500_000).optional(),
      text: z.string().max(400_000).optional(),
      contentHash: short(128),
    })
    .optional(),
  ignoredAttachmentCount: z.number().int().min(0).max(1000),
});

export type HandoffPayload = z.infer<typeof HandoffPayloadSchema>;

export const ConfirmBodySchema = z.object({
  expenseId: z.string().min(1).max(100),
});

export const PatchAddressBodySchema = z.object({
  targetAccountId: z.string().min(1).max(100),
});

export const ListQuerySchema = z.object({
  status: z.enum(['pending', 'handled']).default('pending'),
});
