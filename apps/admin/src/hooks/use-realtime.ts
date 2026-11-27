"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useCallback, useRef } from "react";
import { connectSocket, disconnectSocket, getSocket } from "@/lib/socket";
import { useAuth } from "@/providers/auth-provider";
import type { RealtimeEvent, AnalyticsOverview } from "@/types";

export function useRealtime() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const maxEvents = 50;
  const socketRef = useRef<ReturnType<typeof getSocket> | null>(null);

  useEffect(() => {
    if (!user) return;

    const socket = connectSocket();
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    const handleEvent = (event: RealtimeEvent) => {
      setEvents((prev) => [event, ...prev].slice(0, maxEvents));
    };

    socket.on("admin:new-user", (data) =>
      handleEvent({ type: "new_user", data, timestamp: new Date().toISOString() })
    );
    socket.on("admin:ai-request", (data) =>
      handleEvent({ type: "ai_request", data, timestamp: new Date().toISOString() })
    );
    socket.on("admin:error", (data) =>
      handleEvent({ type: "error", data, timestamp: new Date().toISOString() })
    );
    socket.on("admin:subscription-change", (data) =>
      handleEvent({ type: "subscription_change", data, timestamp: new Date().toISOString() })
    );

    // Support: refetch thread lists, the open thread and the unread badge.
    // The unread event must never invalidate the open thread: opening a thread
    // can itself emit it, which would refetch in a loop.
    const refreshSupportMessage = (data?: { threadId?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["support", "threads"] });
      queryClient.invalidateQueries({ queryKey: ["support", "unread"] });
      if (data?.threadId) {
        queryClient.invalidateQueries({ queryKey: ["support", "thread", data.threadId] });
      }
    };
    const refreshSupportUnread = () => {
      queryClient.invalidateQueries({ queryKey: ["support", "threads"] });
      queryClient.invalidateQueries({ queryKey: ["support", "unread"] });
    };
    socket.on("admin:support-message", refreshSupportMessage);
    socket.on("admin:support-unread", refreshSupportUnread);

    // Server pushes fresh KPI figures every 30 s; merge them into the overview query
    // that feeds the dashboard KPI cards (no refetch).
    socket.on(
      "admin:stats",
      (data: Pick<AnalyticsOverview, "newUsersToday" | "activeUsersToday" | "mrr">) => {
        queryClient.setQueryData<AnalyticsOverview>(
          ["admin", "analytics", "overview"],
          (prev) =>
            prev && {
              ...prev,
              newUsersToday: data.newUsersToday,
              activeUsersToday: data.activeUsersToday,
              mrr: data.mrr,
            }
        );
      }
    );

    return () => {
      socket.off("admin:stats");
      socket.off("admin:support-message", refreshSupportMessage);
      socket.off("admin:support-unread", refreshSupportUnread);
      disconnectSocket();
      socketRef.current = null;
    };
  }, [user, queryClient]);

  const clearEvents = useCallback(() => setEvents([]), []);

  return { connected, events, clearEvents };
}
