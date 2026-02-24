"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { DashboardStats, AnalyticsOverview, AiUsageTrend } from "@/types";

export function useDashboard(startDate?: string, endDate?: string) {
  return useQuery<DashboardStats>({
    queryKey: ["admin", "dashboard", startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      return api.get(`admin/dashboard?${params}`).json();
    },
  });
}

export function useAnalyticsOverview() {
  return useQuery<AnalyticsOverview>({
    queryKey: ["admin", "analytics", "overview"],
    queryFn: () => api.get("admin/analytics/overview").json(),
  });
}

export function useAiUsageTrends(startDate?: string, endDate?: string) {
  return useQuery<AiUsageTrend[]>({
    queryKey: ["admin", "analytics", "ai-usage", startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      return api.get(`admin/analytics/ai-usage?${params}`).json();
    },
  });
}
