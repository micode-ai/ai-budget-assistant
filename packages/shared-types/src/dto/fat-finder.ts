import type { FatFinderReport } from '../entities';

export interface FatFinderResponse {
  report: FatFinderReport;
  isStale: boolean;
  /** True when some amounts were FX-converted into the report currency at today's rate. */
  fxConverted?: boolean;
  /** True when some expenses were excluded because no exchange rate was available. */
  fxApproximate?: boolean;
}

export interface GenerateFatFinderRequest {
  forceRegenerate?: boolean;
  language?: string;
}
