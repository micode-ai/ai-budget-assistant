import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The OAuth request parameters are deliberately loose here (optional strings): the authorize
 * service validates them itself so the consent SPA gets an RFC 6749 error code
 * (`invalid_request`, `invalid_client`, …) instead of a class-validator message list.
 * Max lengths only bound the input.
 */
export class AuthorizePreviewQueryDto {
  @IsOptional() @IsString() @MaxLength(128) client_id?: string;
  @IsOptional() @IsString() @MaxLength(2048) redirect_uri?: string;
  @IsOptional() @IsString() @MaxLength(512) scope?: string;
  @IsOptional() @IsString() @MaxLength(256) code_challenge?: string;
  @IsOptional() @IsString() @MaxLength(32) code_challenge_method?: string;
  @IsOptional() @IsString() @MaxLength(32) response_type?: string;
  /** Accepted (the SPA forwards the whole query) but unused by preview. */
  @IsOptional() @IsString() @MaxLength(2048) state?: string;
}

export class AuthorizeApproveDto {
  @IsOptional() @IsString() @MaxLength(128) client_id?: string;
  @IsOptional() @IsString() @MaxLength(2048) redirect_uri?: string;
  @IsOptional() @IsString() @MaxLength(512) scope?: string;
  @IsOptional() @IsString() @MaxLength(2048) state?: string;
  @IsOptional() @IsString() @MaxLength(256) code_challenge?: string;
  @IsOptional() @IsString() @MaxLength(32) code_challenge_method?: string;
  /** Phase 1 single-account form; `account_ids` wins when both are sent. */
  @IsOptional() @IsString() @MaxLength(64) account_id?: string;
  /** Required for `allow` (this or `account_id`); ignored for `deny`. */
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(64, { each: true }) account_ids?: string[];
  @IsIn(['allow', 'deny']) decision!: 'allow' | 'deny';
}
