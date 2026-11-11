import type { AdminLeafletSummary } from "@budget/shared-types";

export type LeafletState = "reading" | "failed" | "draft" | "live" | "unpublished";

/** A leaflet is live while publishedAt is set and unpublishedAt is not (server rule: isLive). */
export function leafletState(l: Pick<AdminLeafletSummary, "status" | "publishedAt" | "unpublishedAt">): LeafletState {
  if (l.publishedAt && !l.unpublishedAt) return "live";
  if (l.status === "reading") return "reading";
  if (l.status === "failed") return "failed";
  return l.publishedAt ? "unpublished" : "draft";
}
