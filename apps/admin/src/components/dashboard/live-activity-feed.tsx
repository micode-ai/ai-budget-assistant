"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatRelative } from "@/lib/utils";
import type { RealtimeEvent } from "@/types";
import { UserPlus, BrainCircuit, AlertTriangle, CreditCard } from "lucide-react";

const eventIcons: Record<RealtimeEvent["type"], typeof UserPlus> = {
  new_user: UserPlus,
  ai_request: BrainCircuit,
  error: AlertTriangle,
  subscription_change: CreditCard,
};

const eventColors: Record<RealtimeEvent["type"], string> = {
  new_user: "bg-blue-500/10 text-blue-600",
  ai_request: "bg-purple-500/10 text-purple-600",
  error: "bg-red-500/10 text-red-600",
  subscription_change: "bg-green-500/10 text-green-600",
};

interface LiveActivityFeedProps {
  events: RealtimeEvent[];
}

export function LiveActivityFeed({ events }: LiveActivityFeedProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Live Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[260px]">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No recent activity
            </p>
          ) : (
            <div className="space-y-3">
              {events.map((event, i) => {
                const Icon = eventIcons[event.type];
                return (
                  <div key={i} className="flex items-start gap-3">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${eventColors[event.type]}`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs capitalize">
                          {event.type.replace("_", " ")}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatRelative(event.timestamp)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5 truncate">
                        {JSON.stringify(event.data).slice(0, 80)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
