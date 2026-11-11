"use client";

import { HTTPError } from "ky";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  AdminLeafletDetail,
  AdminLeafletItem,
  AdminLeafletPublishResult,
  AdminLeafletStats,
  AdminLeafletSummary,
  UpdateAdminLeafletItemRequest,
  UpdateAdminLeafletRequest,
} from "@budget/shared-types";

const KEY = ["admin", "leaflets"] as const;

/** Turns a ky failure into a message an admin can act on (a 413 may carry no JSON and no CORS headers). */
export async function leafletErrorMessage(err: unknown): Promise<string> {
  if (err instanceof HTTPError) {
    if (err.response.status === 413) {
      return "The file is too large for the server limit. Upload fewer pages at a time or a smaller file.";
    }
    try {
      const body = (await err.response.clone().json()) as { message?: string | string[]; code?: string };
      const message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
      if (message) return message;
    } catch {
      // fall through
    }
    return `Request failed (${err.response.status}).`;
  }
  if (err instanceof TypeError) {
    // A body-less nginx 413 reaches the browser as a CORS/network failure.
    return "Network error. If the file is large, it may exceed the server upload limit.";
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}

export function useLeaflets() {
  return useQuery<AdminLeafletSummary[]>({
    queryKey: KEY,
    queryFn: () => api.get("admin/leaflets").json(),
  });
}

/** Polls every 2 s while the leaflet is still being read. */
export function useLeaflet(id: string | null) {
  return useQuery<AdminLeafletDetail>({
    queryKey: [...KEY, "detail", id],
    queryFn: () => api.get(`admin/leaflets/${id}`).json(),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data?.status === "reading" ? 2000 : false),
  });
}

export function useLeafletRecipients(id: string | null, enabled: boolean) {
  return useQuery<{ users: number }>({
    queryKey: [...KEY, "recipients", id],
    queryFn: () => api.get(`admin/leaflets/${id}/recipients`).json(),
    enabled: !!id && enabled,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useLeafletStats(days = 30) {
  return useQuery<AdminLeafletStats>({
    queryKey: [...KEY, "stats", days],
    queryFn: () => api.get("admin/leaflets/stats", { searchParams: { days } }).json(),
  });
}

export function useUploadLeaflet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (files: File[]) => {
      const form = new FormData();
      for (const f of files) form.append("files", f);
      // FormData body: ky drops its JSON content-type so the browser sets the multipart boundary.
      return api.post("admin/leaflets", { body: form, timeout: false }).json<{ id: string }>();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: KEY });
}

export function useUpdateLeaflet() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateAdminLeafletRequest }) =>
      api.patch(`admin/leaflets/${id}`, { json: dto }).json<AdminLeafletDetail>(),
    onSuccess: invalidate,
  });
}

export function useUpdateLeafletItem() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, itemId, dto }: { id: string; itemId: string; dto: UpdateAdminLeafletItemRequest }) =>
      api.patch(`admin/leaflets/${id}/items/${itemId}`, { json: dto }).json<AdminLeafletItem>(),
    onSuccess: invalidate,
  });
}

export function useDeleteLeafletItem() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, itemId }: { id: string; itemId: string }) =>
      api.delete(`admin/leaflets/${id}/items/${itemId}`).then(() => undefined),
    onSuccess: invalidate,
  });
}

export function usePublishLeaflet() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.post(`admin/leaflets/${id}/publish`).json<AdminLeafletPublishResult>(),
    onSuccess: invalidate,
  });
}

export function useUnpublishLeaflet() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.post(`admin/leaflets/${id}/unpublish`).json<AdminLeafletDetail>(),
    onSuccess: invalidate,
  });
}
