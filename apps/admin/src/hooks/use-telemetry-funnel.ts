"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { TelemetryFunnelResponse } from "@budget/shared-types";

export type FormFactorFilter = "all" | "phone" | "tablet" | "desktop";
export type PlatformFilter = "all" | "web" | "android" | "ios";

export function useTelemetryFunnel(
  days = 30,
  includeInternal = false,
  formFactor: FormFactorFilter = "all",
  platform: PlatformFilter = "all",
) {
  return useQuery<TelemetryFunnelResponse>({
    queryKey: ["admin", "telemetry", "funnel", days, includeInternal, formFactor, platform],
    queryFn: () => {
      const params = new URLSearchParams({
        days: String(days),
        includeInternal: String(includeInternal),
      });
      if (formFactor !== "all") params.set("formFactor", formFactor);
      if (platform !== "all") params.set("platform", platform);
      return api.get(`admin/telemetry/funnel?${params}`).json();
    },
  });
}
