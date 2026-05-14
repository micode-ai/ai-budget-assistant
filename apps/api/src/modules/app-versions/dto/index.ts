import { IsString, IsEnum, IsOptional, IsObject, Matches, IsDateString, IsUrl } from 'class-validator';

export const APP_PLATFORMS = ['ios', 'android'] as const;
export type AppPlatformValue = typeof APP_PLATFORMS[number];

const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;

export class CreateAppVersionDto {
  @IsEnum(APP_PLATFORMS)
  platform!: AppPlatformValue;

  @IsString()
  @Matches(SEMVER_REGEX, { message: 'latestVersion must be x.y.z' })
  latestVersion!: string;

  @IsString()
  @Matches(SEMVER_REGEX, { message: 'minSupportedVersion must be x.y.z' })
  minSupportedVersion!: string;

  @IsOptional()
  @IsObject()
  releaseNotes?: Record<string, string>;

  @IsString()
  @IsUrl({ require_tld: false })
  storeUrl!: string;

  @IsOptional()
  @IsDateString()
  publishedAt?: string;
}

export class UpdateAppVersionDto {
  @IsOptional()
  @IsEnum(APP_PLATFORMS)
  platform?: AppPlatformValue;

  @IsOptional()
  @IsString()
  @Matches(SEMVER_REGEX, { message: 'latestVersion must be x.y.z' })
  latestVersion?: string;

  @IsOptional()
  @IsString()
  @Matches(SEMVER_REGEX, { message: 'minSupportedVersion must be x.y.z' })
  minSupportedVersion?: string;

  @IsOptional()
  @IsObject()
  releaseNotes?: Record<string, string>;

  @IsOptional()
  @IsString()
  @IsUrl({ require_tld: false })
  storeUrl?: string;

  @IsOptional()
  @IsDateString()
  publishedAt?: string;
}

export class CheckAppVersionQueryDto {
  @IsEnum(APP_PLATFORMS)
  platform!: AppPlatformValue;

  @IsString()
  @Matches(SEMVER_REGEX, { message: 'version must be x.y.z' })
  version!: string;
}
