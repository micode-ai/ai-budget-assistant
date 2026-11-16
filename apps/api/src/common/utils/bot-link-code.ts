import { Logger } from '@nestjs/common';
import { randomInt } from 'crypto';
import type { CacheService } from '../cache/cache.service';

/**
 * Bot account-linking codes (ABA-808), shared by Telegram, WhatsApp and Slack.
 *
 * A code links whoever types it to the app user who generated it, with full bot
 * access to their account. It is looked up across ALL users, so its strength is
 * what stands between a stranger and someone else's account: the old 6 hex
 * characters (24 bits) with unlimited attempts could be brute-forced while any
 * code was live. Now it is 8 characters from a 31-letter alphabet (~40 bits),
 * and attempts are capped per chat identity AND globally per platform.
 */

/** No 0/O, 1/I/L: the code is read off a screen and typed by hand. */
export const LINK_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const LINK_CODE_LENGTH = 8;

/** Attempts one chat identity may make in the window — a person mistyping needs a few. */
export const LINK_ATTEMPTS_PER_IDENTITY = 5;
/** Attempts across a whole platform in the window — bounds a many-identity attack. */
export const LINK_ATTEMPTS_PER_PLATFORM = 300;
export const LINK_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

export const LINK_TOO_MANY_ATTEMPTS = 'Too many attempts. Please wait 15 minutes and try again.';
export const LINK_INVALID_CODE = 'Invalid or expired code. Please generate a new one in the app.';

export type BotPlatform = 'telegram' | 'whatsapp' | 'slack';

const logger = new Logger('BotLinkCode');

export function generateLinkCode(): string {
  let code = '';
  for (let i = 0; i < LINK_CODE_LENGTH; i++) code += LINK_CODE_ALPHABET[randomInt(LINK_CODE_ALPHABET.length)];
  return code;
}

/** What the user typed, as the stored code: upper case, without spaces or dashes. */
export function normalizeLinkCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, '');
}

/**
 * Counts this attempt and says whether it may go ahead. FAILS CLOSED: a Redis
 * outage refuses the attempt (`incrementWindow` throws), because an uncounted
 * attempt is exactly the brute force this limit exists to stop.
 */
export async function linkAttemptAllowed(cache: CacheService, platform: BotPlatform, identity: string): Promise<boolean> {
  try {
    const mine = await cache.incrementWindow(`botlink:${platform}:id:${identity}`, LINK_ATTEMPT_WINDOW_MS);
    if (mine > LINK_ATTEMPTS_PER_IDENTITY) return false;
    const all = await cache.incrementWindow(`botlink:${platform}:all`, LINK_ATTEMPT_WINDOW_MS);
    if (all > LINK_ATTEMPTS_PER_PLATFORM) {
      logger.warn(`${platform} link attempts over the platform ceiling — possible brute force`);
      return false;
    }
    return true;
  } catch (err) {
    logger.warn(`${platform} link attempt refused, rate limit unavailable: ${(err as Error).message}`);
    return false;
  }
}
