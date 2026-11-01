"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AdminOAuthClient, UpdateAdminOAuthClientDto } from "@budget/shared-types";

const KEY = ["admin", "oauth-clients"] as const;

export function useApiApps() {
  return useQuery<AdminOAuthClient[]>({
    queryKey: KEY,
    queryFn: () => api.get("admin/oauth-clients").json(),
    refetchInterval: 15_000,
  });
}

export function useUpdateApiApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateAdminOAuthClientDto }) =>
      api.patch(`admin/oauth-clients/${id}`, { json: dto }).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
