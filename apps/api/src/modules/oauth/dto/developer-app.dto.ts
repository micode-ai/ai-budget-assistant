import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { hasForbiddenChars, isReservedAppName } from '../app-name.util';
import { isAllowedRedirectUri } from '../redirect-uri.util';

@ValidatorConstraint({ name: 'allowedRedirectUris', async: false })
class AllowedRedirectUris implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return Array.isArray(value) && value.every((v) => typeof v === 'string' && isAllowedRedirectUri(v));
  }
  defaultMessage(): string {
    return 'each redirect URI must be https:// (or http://localhost / http://127.0.0.1) without a fragment';
  }
}

/** Error messages start with a stable code: the app maps them to a translated explanation. */
@ValidatorConstraint({ name: 'appNameChars', async: false })
class AppNameChars implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value !== 'string' || !hasForbiddenChars(value);
  }
  defaultMessage(): string {
    return 'app_name_invalid_characters: name must not contain line breaks or control characters';
  }
}

@ValidatorConstraint({ name: 'appNameReserved', async: false })
class AppNameNotReserved implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value !== 'string' || !isReservedAppName(value);
  }
  defaultMessage(): string {
    return 'app_name_reserved: name must not be or start with "AI Budget", "AI Budżet" or "MiCode"';
  }
}

@ValidatorConstraint({ name: 'appDescriptionChars', async: false })
class AppDescriptionChars implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value !== 'string' || !hasForbiddenChars(value);
  }
  defaultMessage(): string {
    return 'app_description_invalid_characters: description must not contain line breaks or control characters';
  }
}

/** Present-but-null on a non-nullable column must be a 400, not a Prisma 500: validate unless absent. */
const unlessAbsent = ValidateIf((_o, v) => v !== undefined);

const HTTPS_URL = { require_protocol: true, protocols: ['https'] };

export class CreateDeveloperAppDto {
  @IsString()
  @Length(1, 60)
  @Validate(AppNameChars)
  @Validate(AppNameNotReserved)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Validate(AppDescriptionChars)
  description?: string;

  @IsOptional()
  @IsUrl(HTTPS_URL)
  logoUrl?: string;

  @IsUrl(HTTPS_URL)
  homepageUrl!: string;

  @IsOptional()
  @IsUrl(HTTPS_URL)
  privacyPolicyUrl?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @Validate(AllowedRedirectUris)
  redirectUris!: string[];

  /** Confidential clients get a client secret; public clients (SPAs, native) rely on PKCE alone. Default true. */
  @IsOptional()
  @IsBoolean()
  isConfidential?: boolean;
}

export class UpdateDeveloperAppDto {
  @unlessAbsent
  @IsNotEmpty()
  @IsString()
  @Length(1, 60)
  @Validate(AppNameChars)
  @Validate(AppNameNotReserved)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Validate(AppDescriptionChars)
  description?: string;

  @IsOptional()
  @IsUrl(HTTPS_URL)
  logoUrl?: string;

  @unlessAbsent
  @IsNotEmpty()
  @IsUrl(HTTPS_URL)
  homepageUrl?: string;

  @IsOptional()
  @IsUrl(HTTPS_URL)
  privacyPolicyUrl?: string;

  @unlessAbsent
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @Validate(AllowedRedirectUris)
  redirectUris?: string[];
}
