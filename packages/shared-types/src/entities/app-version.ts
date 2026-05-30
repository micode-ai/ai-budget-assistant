import type { AppPlatform } from './primitives';

export interface AppVersion {
  id: string;
  platform: AppPlatform;
  latestVersion: string;
  minSupportedVersion: string;
  releaseNotes: Record<string, string> | null;
  storeUrl: string;
  publishedAt: string;
  updatedAt: string;
}
