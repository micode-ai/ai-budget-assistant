import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiExtraModels, ApiProperty, ApiPropertyOptional, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { PUBLIC_SCOPES } from '../oauth-scopes';
import { OAUTH_TOKEN_ERROR_CODES } from '../oauth-token.service';

/**
 * OpenAPI-only body schemas for `POST /oauth/token` and `POST /oauth/revoke`.
 *
 * The controller deliberately types its body as a plain record (the global ValidationPipe must not
 * turn a standard OAuth param into a non-RFC 400), so Swagger cannot infer anything from it. These
 * classes are referenced ONLY through `@ApiBody`/`@ApiResponse` and never become the reflected
 * parameter type — validation stays in `OAuthTokenService`. Descriptions come from the public docs'
 * per-language text tables.
 */

export class OAuthTokenRequest {
  @ApiProperty({ type: String, enum: ['authorization_code', 'refresh_token'], example: 'authorization_code' })
  grant_type!: string;

  @ApiPropertyOptional({ type: String, example: 'aba_ac_Xv3kP9qLm2Rt7Yw1Zb5Nc8Hd4Fg6Js0Ke2Ua9Wi3Oo' })
  code?: string;

  @ApiPropertyOptional({ type: String, example: 'https://example.com/oauth/callback' })
  redirect_uri?: string;

  @ApiPropertyOptional({ type: String, minLength: 43, maxLength: 128, example: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk' })
  code_verifier?: string;

  @ApiPropertyOptional({ type: String, example: 'aba_rt_8fJ2kL5mN9pQ3rS7tU1vW4xY6zA0bC2dE5fG8hI1jK' })
  refresh_token?: string;

  @ApiPropertyOptional({ type: String, example: PUBLIC_SCOPES.join(' ') })
  scope?: string;

  @ApiPropertyOptional({ type: String, example: 'aba_ci_q7Lx2Vb9TmR4kWc8Zp1sYg' })
  client_id?: string;

  @ApiPropertyOptional({ type: String, example: 'aba_cs_W3nR8tY2uI6oP0aS4dF7gH1jK5lZ9xC3vB6nM2qE8rT' })
  client_secret?: string;
}

export class OAuthRevokeRequest {
  @ApiProperty({ type: String, example: 'aba_rt_8fJ2kL5mN9pQ3rS7tU1vW4xY6zA0bC2dE5fG8hI1jK' })
  token!: string;

  @ApiPropertyOptional({ type: String, enum: ['access_token', 'refresh_token'], example: 'refresh_token' })
  token_type_hint?: string;

  @ApiPropertyOptional({ type: String, example: 'aba_ci_q7Lx2Vb9TmR4kWc8Zp1sYg' })
  client_id?: string;

  @ApiPropertyOptional({ type: String, example: 'aba_cs_W3nR8tY2uI6oP0aS4dF7gH1jK5lZ9xC3vB6nM2qE8rT' })
  client_secret?: string;
}

export class OAuthTokenResponse {
  @ApiProperty({ type: String, example: 'aba_at_Hq7Wm2Ks9Lp4Nx1Vb6Cz3Rt8Yu5Ie0Oa2Sd7Fg4Jk9L' })
  access_token!: string;

  @ApiProperty({ type: String, enum: ['Bearer'], example: 'Bearer' })
  token_type!: string;

  @ApiProperty({ type: Number, example: 3600 })
  expires_in!: number;

  @ApiProperty({ type: String, example: 'aba_rt_Pz4Xc8Vb2Nm6Lk0Jh3Gf7Ds1Aq5We9Rt2Yu6Io0Pa' })
  refresh_token!: string;

  @ApiProperty({ type: String, example: 'expenses:read expenses:write categories:read' })
  scope!: string;

  @ApiProperty({ type: String, format: 'uuid', example: '7c9e1a3b-5d7f-4b2c-8e4a-6f8b0d2c4e6a' })
  account_id!: string;
}

/** RFC 6749 §5.2 error body. */
export class OAuthErrorResponse {
  @ApiProperty({ type: String, enum: OAUTH_TOKEN_ERROR_CODES, example: 'invalid_grant' })
  error!: string;

  @ApiProperty({ type: String, example: 'authorization code is invalid, expired or already used' })
  error_description!: string;
}

/** Statuses `/oauth/token` and `/oauth/revoke` can answer with an RFC 6749 error. */
export const OAUTH_ERROR_STATUSES = [400, 401, 404, 429, 503] as const;

function oauthErrors() {
  return [
    ApiExtraModels(OAuthErrorResponse),
    ...OAUTH_ERROR_STATUSES.map((status) =>
      ApiResponse({ status, description: '', schema: { $ref: getSchemaPath(OAuthErrorResponse) } }),
    ),
  ];
}

/** Both media types reach the controller (main.ts registers both parsers). */
function oauthBody(type: new () => unknown) {
  return [ApiConsumes('application/x-www-form-urlencoded', 'application/json'), ApiBody({ type, required: true })];
}

export const ApiOAuthTokenDocs = () =>
  applyDecorators(
    ...oauthBody(OAuthTokenRequest),
    ApiResponse({ status: 200, description: '', type: OAuthTokenResponse }),
    ...oauthErrors(),
  );

export const ApiOAuthRevokeDocs = () =>
  applyDecorators(
    ...oauthBody(OAuthRevokeRequest),
    ApiResponse({ status: 200, description: '', schema: { type: 'object', properties: {}, example: {} } }),
    ...oauthErrors(),
  );
