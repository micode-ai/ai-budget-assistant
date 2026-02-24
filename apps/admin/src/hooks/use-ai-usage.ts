"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AiUsageTrend } from "@/types";

export function useAiUsage(startDate?: string, endDate?: string) {
  return useQuery<AiUsageTrend[]>({
    queryKey: ["admin", "ai-usage", startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      return api.get(`admin/analytics/ai-usage?${params}`).json();
    },
  });
}
