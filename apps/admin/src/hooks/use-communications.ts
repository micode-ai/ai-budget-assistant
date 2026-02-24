"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  NotificationLogItem,
  ScheduledNotificationItem,
  PaginatedResponse,
} from "@/types";

export function useSendPush() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { userIds: string[]; title: string; body: string }) => {
      return api.post("admin/notifications/push", { json: data }).json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "notifications"] });
    },
  });
}

export function useSendEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { userIds: string[]; subject: string; html: string }) => {
      return api.post("admin/notifications/email", { json: data }).json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "notifications"] });
    },
  });
}

export function useSendBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      type: "push" | "email";
      title?: string;
      subject?: string;
      body: string;
      html?: string;
      filters?: { tier?: string; isActive?: boolean; language?: string };
    }) => {
      return api.post("admin/notifications/broadcast", { json: data }).json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "notifications"] });
    },
  });
}

export function useNotificationHistory(page: number, limit = 20) {
  return useQuery<PaginatedResponse<NotificationLogItem>>({
    queryKey: ["admin", "notifications", "history", page, limit],
    queryFn: () =>
      api
        .get(`admin/notifications/history?page=${page}&limit=${limit}`)
        .json(),
  });
}

export function useUserNotificationHistory(userId: string, page = 1, limit = 10) {
  return useQuery<PaginatedResponse<NotificationLogItem>>({
    queryKey: ["admin", "notifications", "history", "user", userId, page, limit],
    queryFn: () =>
      api
        .get(`admin/notifications/history?userId=${userId}&page=${page}&limit=${limit}`)
        .json(),
    enabled: !!userId,
    refetchInterval: 30_000,
  });
}

export function useScheduledNotifications() {
  return useQuery<ScheduledNotificationItem[]>({
    queryKey: ["admin", "notifications", "scheduled"],
    queryFn: () => api.get("admin/notifications/scheduled").json(),
  });
}

export function useScheduleNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      type: "push" | "email";
      title?: string;
      subject?: string;
      body: string;
      scheduledAt: string;
      userIds?: string[];
      filters?: Record<string, unknown>;
    }) => {
      return api.post("admin/notifications/schedule", { json: data }).json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "notifications", "scheduled"] });
    },
  });
}

export function useCancelScheduledNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      return api.delete(`admin/notifications/scheduled/${id}`).json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "notifications", "scheduled"] });
    },
  });
}
