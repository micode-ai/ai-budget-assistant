"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { connectSocket, disconnectSocket, getSocket } from "@/lib/socket";
import { useAuth } from "@/providers/auth-provider";
import type { RealtimeEvent } from "@/types";

export function useRealtime() {
  const { user } = useAuth();
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

    return () => {
      disconnectSocket();
      socketRef.current = null;
    };
  }, [user]);

  const clearEvents = useCallback(() => setEvents([]), []);

  return { connected, events, clearEvents };
}
