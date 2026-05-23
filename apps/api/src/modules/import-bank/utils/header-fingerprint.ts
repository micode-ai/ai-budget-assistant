import { createHash } from 'crypto';

export function headerFingerprint(headers: string[]): string {
  const normalized = headers
    .map((h) => h.trim().toLowerCase().replace(/\s+/g, ' '))
    .filter((h) => h.length > 0)
    .sort();
  return createHash('sha256').update(normalized.join('|')).digest('hex');
}
