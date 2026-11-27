"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  AdminSupportMessageView,
  AdminSupportThreadSummary,
  SupportThreadFilter,
} from "@/types";

export interface SupportThreadDetail {
  summary: AdminSupportThreadSummary;
  messages: AdminSupportMessageView[];
}

export function useSupportThreads(filter: SupportThreadFilter) {
  return useQuery<AdminSupportThreadSummary[]>({
    queryKey: ["support", "threads", filter],
    queryFn: () => api.get("admin/support/threads", { searchParams: { filter } }).json(),
  });
}

export function useSupportThread(id: string | null) {
  return useQuery<SupportThreadDetail>({
    queryKey: ["support", "thread", id],
    queryFn: () => api.get(`admin/support/threads/${id}`).json(),
    enabled: !!id,
  });
}

export function useSupportUnread() {
  return useQuery<{ total: number }>({
    queryKey: ["support", "unread"],
    queryFn: () => api.get("admin/support/unread-count").json(),
    refetchInterval: 60_000,
  });
}

function useInvalidateSupport() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["support"] });
}

export function useReplySupport(threadId: string) {
  const invalidate = useInvalidateSupport();
  return useMutation({
    mutationFn: (body: string) =>
      api.post(`admin/support/threads/${threadId}/reply`, { json: { body } }).json<AdminSupportMessageView>(),
    onSuccess: invalidate,
  });
}

export function useUpdateSupportThread(threadId: string) {
  const invalidate = useInvalidateSupport();
  return useMutation({
    mutationFn: (dto: { status?: "open" | "closed"; muted?: boolean }) =>
      api.patch(`admin/support/threads/${threadId}`, { json: dto }).json<AdminSupportThreadSummary>(),
    onSuccess: invalidate,
  });
}

export function useTranslateSupportMessage() {
  const invalidate = useInvalidateSupport();
  return useMutation({
    mutationFn: (messageId: string) =>
      api.post(`admin/support/messages/${messageId}/translate`).json<AdminSupportMessageView>(),
    onSuccess: invalidate,
  });
}

/** Reads the API's `message` from a ky HTTPError, e.g. `user_inactive` on a 409. */
export async function supportErrorMessage(err: unknown): Promise<string> {
  const e = err as { response?: { json: () => Promise<{ message?: unknown }> }; message?: string };
  if (e?.response) {
    try {
      const body = await e.response.json();
      if (typeof body?.message === "string") return body.message;
    } catch {
      // not JSON
    }
  }
  return e?.message || "Request failed";
}
