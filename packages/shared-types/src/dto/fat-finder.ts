import type { FatFinderReport } from '../entities';

export interface FatFinderResponse {
  report: FatFinderReport;
  isStale: boolean;
}

export interface GenerateFatFinderRequest {
  forceRegenerate?: boolean;
  language?: string;
}
