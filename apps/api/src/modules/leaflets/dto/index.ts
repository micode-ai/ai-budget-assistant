import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

// Mirrors CreateLeafletRequest / LeafletPageRequest / LeafletPdfRequest in
// @budget/shared-types (type-only there; runtime validation lives here).
// 'admin' is not accepted: admin-dashboard uploads go through their own route.
export const CreateLeafletRequestSchema = z.object({
  source: z.enum(['share', 'picker', 'upload', 'pdf']),
  platform: z.enum(['android', 'web', 'ios']).nullable().optional().default(null),
});

export const LeafletPageRequestSchema = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.string().max(40).optional(),
});

export const LeafletPdfRequestSchema = z.object({
  pdfBase64: z.string().min(1),
});

/** `POST /leaflets/push-opened` — the `pushKey` is a `leaflet_notification_log` row id (uuid). */
export const LeafletPushOpenedSchema = z.object({
  pushKey: z.string().uuid(),
});

/** A strict `YYYY-MM-DD` that is a real calendar date. */
const YMD = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00.000Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'not a calendar date');
const PRICE = z.number().finite().positive().max(1_000_000);

// Mirrors UpdateAdminLeafletRequest / UpdateAdminLeafletItemRequest in @budget/shared-types.
// Label limits match the community promo corpus (64 chars, condition 80).
export const AdminLeafletUpdateSchema = z
  .object({
    chain: z.string().trim().min(1).max(64).optional(),
    validFrom: YMD.nullable().optional(),
    validTo: YMD.nullable().optional(),
  })
  .strict();

export const AdminLeafletItemUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    canonicalName: z.string().trim().min(1).max(64).optional(),
    promoPrice: PRICE.optional(),
    regularPrice: PRICE.nullable().optional(),
    condition: z.string().trim().max(80).nullable().optional(),
  })
  .strict();

/** zod parse that answers 400 instead of letting a ZodError become a 500. */
export function parseBody<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException(result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`));
  }
  return result.data;
}
