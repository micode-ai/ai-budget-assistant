import { z } from 'zod';

/**
 * Sanitizes a user-supplied string before embedding it in an AI prompt.
 * Prevents prompt injection by removing newlines (the primary injection vector)
 * and neutralizing well-known instruction-override trigger words.
 *
 * NOT for HTML/SQL sanitization — specifically for LLM prompt context.
 */
export function sanitizeForPrompt(text: string, maxLength = 200): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .slice(0, maxLength)
    .replace(/[\r\n\t]+/g, ' ')
    // eslint-disable-next-line no-control-regex -- intentional: strip control chars to defang prompt injection
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(
      /\b(ignore|disregard|forget|override|system|assistant|instruction|jailbreak)\b/gi,
      (match) => match[0] + '\u200B' + match.slice(1),
    )
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export const ScanPriceTagRequestSchema = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.string().optional(),
});

// Deliberately duplicated: keep identical to packages/shared-utils/src/validation/index.ts (the API cannot import shared-utils at runtime).
/** Image types a receipt part may carry (what the vision model accepts). Part of the schema contract. */
export const RECEIPT_PART_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

const ReceiptPartSchema = z
  .object({
    imageBase64: z.string().min(1, 'parts_empty'),
    mimeType: z.string().optional(),
  })
  .superRefine((part, ctx) => {
    const mime = (part.mimeType ?? '').toLowerCase();
    if (mime === 'application/pdf') ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'parts_with_pdf' });
    else if (mime && !RECEIPT_PART_MIME_TYPES.includes(mime)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'parts_mime' });
    }
  });

export const ScanReceiptRequestSchema = z
  .object({
    imageBase64: z.string().min(1).optional(),
    /** 2-4 consecutive photos of ONE long receipt, top to bottom. Exclusive with `imageBase64`. */
    images: z.array(ReceiptPartSchema).min(2, 'parts_count').max(4, 'parts_count').optional(),
    userPrompt: z.string().max(300).optional(),
    mimeType: z.string().optional(),
    /** ABA-642: new app builds ask for the same-store community baseline in priceFindings. */
    communityBaseline: z.boolean().optional(),
  })
  .refine((b) => (b.imageBase64 !== undefined) !== (b.images !== undefined), {
    message: 'image_or_images',
  });
