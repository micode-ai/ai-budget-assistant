"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AdminOAuthClient, AdminOAuthClientPage, UpdateAdminOAuthClientDto } from "@budget/shared-types";

const KEY = ["admin", "oauth-clients"] as const;

export type ApiAppSourceFilter = "all" | AdminOAuthClient["source"];

export const API_APPS_PAGE_SIZE = 50;

/** One page of API apps (newest first); the server pages, so the list stays bounded. */
export function useApiApps(source: ApiAppSourceFilter = "all", page = 1) {
  return useQuery<AdminOAuthClientPage>({
    queryKey: [...KEY, source, page],
    queryFn: () =>
      api
        .get("admin/oauth-clients", {
          searchParams: {
            ...(source === "all" ? {} : { source }),
            page: String(page),
            limit: String(API_APPS_PAGE_SIZE),
          },
        })
        .json(),
    refetchInterval: 15_000,
    placeholderData: (prev) => prev,
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
