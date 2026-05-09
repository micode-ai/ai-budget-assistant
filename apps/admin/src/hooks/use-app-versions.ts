"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AppVersion, CreateAppVersionDto, UpdateAppVersionDto } from "@budget/shared-types";

const KEY = ["admin", "app-versions"] as const;

export function useAppVersions() {
  return useQuery<AppVersion[]>({
    queryKey: KEY,
    queryFn: () => api.get("admin/app-versions").json(),
  });
}

export function useCreateAppVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateAppVersionDto) => api.post("admin/app-versions", { json: dto }).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateAppVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateAppVersionDto }) =>
      api.patch(`admin/app-versions/${id}`, { json: dto }).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteAppVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`admin/app-versions/${id}`).json(),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
