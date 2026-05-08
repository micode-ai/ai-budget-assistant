import type { AppVersionCheckResponse, AppPlatform } from '@budget/shared-types';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

export async function fetchVersionCheck(
  platform: AppPlatform,
  version: string,
  signal?: AbortSignal,
): Promise<AppVersionCheckResponse> {
  const url = `${API_BASE_URL}/app-versions/check?platform=${platform}&version=${encodeURIComponent(version)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Version check failed: ${res.status}`);
  }
  return res.json();
}
