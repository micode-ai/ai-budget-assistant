"use client";

import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatDateTime } from "@/lib/utils";
import type { AdminSupportMessageView } from "@/types";

interface Props {
  message: AdminSupportMessageView;
  onTranslate: (id: string) => void;
  translating: boolean;
}

export function MessageBubble({ message, onTranslate, translating }: Props) {
  const mine = message.author === "developer";
  const hasTranslation = !!message.translatedBody;
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-lg border px-3 py-2 text-sm",
          mine ? "bg-primary/10" : "bg-muted"
        )}
      >
        <p className="whitespace-pre-wrap break-words">
          {hasTranslation ? message.translatedBody : message.body}
        </p>
        {hasTranslation && (
          <div className="mt-2 border-t pt-2 text-xs text-muted-foreground">
            <span className="uppercase">Original ({message.bodyLang})</span>
            <p className="whitespace-pre-wrap break-words">{message.body}</p>
          </div>
        )}
        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{formatDateTime(message.createdAt)}</span>
          <span>via {message.via}</span>
          {!hasTranslation && !mine && (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1 text-[11px]"
              disabled={translating}
              onClick={() => onTranslate(message.id)}
            >
              <Languages className="mr-1 h-3 w-3" />
              {translating ? "Translating…" : "Translate"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
