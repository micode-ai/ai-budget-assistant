"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AdminInvestorMetricsResponse } from "@budget/shared-types";

export function useInvestorMetrics(months = 6, weeks = 12, activationDays = 3) {
  return useQuery<AdminInvestorMetricsResponse>({
    queryKey: ["admin", "investor-metrics", months, weeks, activationDays],
    queryFn: () =>
      api
        .get(`admin/metrics/investor?months=${months}&weeks=${weeks}&activationDays=${activationDays}`)
        .json(),
  });
}
