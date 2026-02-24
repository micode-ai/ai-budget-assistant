"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AuditLogItem, PaginatedResponse } from "@/types";

export function useAuditLog(params: {
  page: number;
  limit?: number;
  action?: string;
  targetType?: string;
}) {
  const { page, limit = 20, action, targetType } = params;

  return useQuery<PaginatedResponse<AuditLogItem>>({
    queryKey: ["admin", "audit-log", { page, limit, action, targetType }],
    queryFn: async () => {
      const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (action) qs.set("action", action);
      if (targetType) qs.set("targetType", targetType);
      return api.get(`admin/audit-log?${qs}`).json();
    },
  });
}
