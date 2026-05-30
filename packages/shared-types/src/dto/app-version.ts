import type { AppPlatform } from '../entities';

export interface AppVersionCheckResponse {
  latestVersion: string;
  minSupportedVersion: string;
  isUpdateAvailable: boolean;
  isUpdateRequired: boolean;
  releaseNotes: Record<string, string> | null;
  storeUrl: string;
}

export interface CreateAppVersionDto {
  platform: AppPlatform;
  latestVersion: string;
  minSupportedVersion: string;
  releaseNotes?: Record<string, string>;
  storeUrl: string;
  publishedAt?: string;
}

export type UpdateAppVersionDto = Partial<CreateAppVersionDto>;
