"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { SubscriptionStats } from "@/types";

export function useSubscriptionStats() {
  return useQuery<SubscriptionStats>({
    queryKey: ["admin", "subscriptions"],
    queryFn: () => api.get("admin/analytics/subscriptions").json(),
  });
}
