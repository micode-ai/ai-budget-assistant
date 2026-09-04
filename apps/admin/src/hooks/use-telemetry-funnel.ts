"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { TelemetryFunnelResponse } from "@budget/shared-types";

export function useTelemetryFunnel(days = 30) {
  return useQuery<TelemetryFunnelResponse>({
    queryKey: ["admin", "telemetry", "funnel", days],
    queryFn: () => api.get(`admin/telemetry/funnel?days=${days}`).json(),
  });
}
