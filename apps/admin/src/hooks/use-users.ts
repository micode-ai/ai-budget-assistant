"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AdminUserListItem, AdminUserDetail, PaginatedResponse } from "@/types";

export function useUsers(params: {
  page: number;
  limit?: number;
  search?: string;
  tier?: string;
  isActive?: string;
  sortBy?: string;
  order?: "asc" | "desc";
}) {
  const { page, limit = 20, search, tier, isActive, sortBy, order } = params;

  return useQuery<PaginatedResponse<AdminUserListItem>>({
    queryKey: ["admin", "users", { page, limit, search, tier, isActive, sortBy, order }],
    queryFn: async () => {
      const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) qs.set("search", search);
      if (tier) qs.set("tier", tier);
      if (isActive) qs.set("isActive", isActive);
      if (sortBy) qs.set("sortBy", sortBy);
      if (order) qs.set("order", order);
      return api.get(`admin/users?${qs}`).json();
    },
    refetchInterval: 30_000,
  });
}

export function useUserDetail(userId: string) {
  return useQuery<AdminUserDetail>({
    queryKey: ["admin", "users", userId],
    queryFn: () => api.get(`admin/users/${userId}`).json(),
    enabled: !!userId,
    refetchInterval: 30_000,
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: Record<string, unknown> }) => {
      return api.patch(`admin/users/${userId}`, { json: data }).json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useChangeSubscriptionTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, tier }: { userId: string; tier: string }) => {
      return api.patch(`admin/users/${userId}/subscription`, { json: { tier } }).json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      return api.delete(`admin/users/${userId}`).json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });
}
