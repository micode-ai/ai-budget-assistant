"use client";

import { Badge } from "@/components/ui/badge";
import { cn, formatDateTime } from "@/lib/utils";
import type { AdminSupportThreadSummary } from "@/types";

interface Props {
  threads: AdminSupportThreadSummary[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function ThreadList({ threads, isLoading, selectedId, onSelect }: Props) {
  if (isLoading) return <p className="p-3 text-sm text-muted-foreground">Loading…</p>;
  if (threads.length === 0) return <p className="p-3 text-sm text-muted-foreground">No threads.</p>;
  return (
    <ul className="divide-y">
      {threads.map((t) => (
        <li key={t.id}>
          <button
            type="button"
            onClick={() => onSelect(t.id)}
            className={cn(
              "w-full space-y-1 px-3 py-2 text-left hover:bg-muted/50",
              selectedId === t.id && "bg-muted"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">{t.userName || t.userEmail}</span>
              {t.developerUnreadCount > 0 && <Badge>{t.developerUnreadCount}</Badge>}
            </div>
            <p className="truncate text-xs text-muted-foreground">{t.lastMessagePreview}</p>
            <p className="text-[11px] text-muted-foreground">{formatDateTime(t.lastMessageAt)}</p>
          </button>
        </li>
      ))}
    </ul>
  );
}
