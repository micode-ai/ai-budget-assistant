import { IsArray, IsString, MaxLength, ArrayMaxSize } from 'class-validator';

/**
 * Two different numbers guard two different things, and neither is
 * `MAX_EVENTS_PER_BATCH` (40, in `telemetry.validator.ts`).
 *
 * The app's global `ValidationPipe` (`main.ts`) is `forbidNonWhitelisted`
 * with no custom `exceptionFactory`, so a `class-validator` violation on a
 * declared property is a hard 400 — and the web client that posts here is
 * fire-and-forget and never retries, so a 400 is a silent, permanent loss of
 * the whole batch. `sanitizeEvents`'s job is to truncate an oversized batch
 * to 40 and keep going, not to have the transport reject it outright — so
 * the DTO bound must sit well above 40, wide enough that it only ever
 * catches a payload that could not have come from this client at all.
 *
 * `MAX_EVENTS_PER_REQUEST` (200) is that transport ceiling: a `keepalive`
 * request body is capped at 64 KB and one event is roughly 100 bytes of
 * JSON, so ~200 events is still a request a real client could have
 * produced — 5x the client's own contract of 40 — while anything above it
 * is not our client and is rejected before any work happens.
 * `MAX_SESSION_ID_LENGTH` (200) is the same idea for `sessionId`: the
 * service truncates to `SESSION_ID_MAX` (64) after this pipe has already
 * let the request through.
 *
 * `MAX_EVENTS_PER_BATCH` (40) remains the sole authority on what is
 * actually stored — a batch between 41 and 200 passes this pipe intact and
 * is then truncated to 40 by `sanitizeEvents`, never refused outright.
 */
const MAX_EVENTS_PER_REQUEST = 200;
const MAX_SESSION_ID_LENGTH = 200;

export class IngestTelemetryDto {
  @IsString()
  @MaxLength(32)
  platform: string;

  @IsString()
  @MaxLength(MAX_SESSION_ID_LENGTH)
  sessionId: string;

  /** Deliberately `unknown[]`: the shape is decided by the allow-list in
   * `sanitizeEvents`, not by class-validator, so a client one version ahead
   * cannot fail the whole batch on an unknown field. */
  @IsArray()
  @ArrayMaxSize(MAX_EVENTS_PER_REQUEST)
  events: unknown[];
}
