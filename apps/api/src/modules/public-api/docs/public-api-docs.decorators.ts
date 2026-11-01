import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiProperty, ApiPropertyOptional, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { PUBLIC_API_ERROR_CODES } from '../public-api-error';

/**
 * OpenAPI-only shapes and decorators for the `/public/v1` reference. Nothing here runs on a
 * request: these classes exist so the published document has a named, shared error schema.
 * Descriptions are filled per language from `texts.<lang>.ts` (see `openapi.ts`).
 */

export class PublicApiErrorObject {
  @ApiProperty({ type: String, enum: PUBLIC_API_ERROR_CODES, example: 'validation_failed' })
  code!: string;

  @ApiProperty({ type: String, example: 'The request is invalid.' })
  message!: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    example: { fields: { amount: ['amount must be a decimal string with at most 2 decimal places'] } },
  })
  details?: Record<string, unknown>;
}

/** `{ "error": { "code", "message", "details"? } }` — the body of every `/public/v1` error. */
export class PublicApiErrorResponse {
  @ApiProperty({ type: () => PublicApiErrorObject })
  error!: PublicApiErrorObject;
}

/** Statuses every `/public/v1` operation can answer, whatever the route. */
export const PUBLIC_COMMON_ERROR_STATUSES = [400, 401, 403, 404, 429, 503] as const;

/**
 * Adds the shared error responses to a `/public/v1` operation: the common set plus any
 * route-specific statuses (`409`, `422`).
 */
export function ApiPublicErrors(...extra: number[]): MethodDecorator & ClassDecorator {
  const statuses = [...new Set([...PUBLIC_COMMON_ERROR_STATUSES, ...extra])].sort((a, b) => a - b);
  return applyDecorators(
    ApiExtraModels(PublicApiErrorResponse, PublicApiErrorObject),
    ...statuses.map((status) =>
      ApiResponse({ status, description: '', schema: { $ref: getSchemaPath(PublicApiErrorResponse) } }),
    ),
  );
}
