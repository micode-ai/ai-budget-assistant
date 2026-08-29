"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AdminAcquisitionBreakdownResponse } from "@budget/shared-types";

export function useAcquisitionBreakdown(days = 30) {
  return useQuery<AdminAcquisitionBreakdownResponse>({
    queryKey: ["admin", "acquisition", days],
    queryFn: () => api.get(`admin/analytics/acquisition?days=${days}`).json(),
  });
}
