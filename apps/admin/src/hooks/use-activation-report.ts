"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AdminActivationReportResponse } from "@budget/shared-types";

export function useActivationReport(weeks = 26, includeInternal = false) {
  return useQuery<AdminActivationReportResponse>({
    queryKey: ["admin", "activation", weeks, includeInternal],
    queryFn: () => {
      const params = new URLSearchParams({
        weeks: String(weeks),
        includeInternal: String(includeInternal),
      });
      return api.get(`admin/metrics/activation?${params}`).json();
    },
  });
}
