import type { ConfigService } from '@nestjs/config';

/** The Public API feature flag. Default OFF: anything but the string `true` (trimmed, any case) is off. */
export function isPublicApiEnabled(config: ConfigService): boolean {
  return `${config.get<string>('PUBLIC_API_ENABLED') ?? ''}`.trim().toLowerCase() === 'true';
}
