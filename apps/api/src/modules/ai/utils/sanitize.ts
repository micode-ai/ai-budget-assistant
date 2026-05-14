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

export const ScanReceiptRequestSchema = z.object({
  imageBase64: z.string().min(1),
  userPrompt: z.string().max(300).optional(),
  mimeType: z.string().optional(),
});
