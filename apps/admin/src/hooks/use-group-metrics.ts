"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AdminGroupMetricsResponse } from "@budget/shared-types";

export function useGroupMetrics(days = 30) {
  return useQuery<AdminGroupMetricsResponse>({
    queryKey: ["admin", "groups", "metrics", days],
    queryFn: () => api.get(`admin/groups/metrics?days=${days}`).json(),
  });
}
