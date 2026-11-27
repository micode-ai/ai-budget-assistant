"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  supportErrorMessage,
  useSupportThread,
  useTranslateSupportMessage,
  useUpdateSupportThread,
} from "@/hooks/use-support";
import { MessageBubble } from "./message-bubble";
import { ReplyBox } from "./reply-box";
import type { SupportContext } from "@/types";

function ContextPanel({ context }: { context: SupportContext | null }) {
  if (!context) return <p className="text-xs text-muted-foreground">No context.</p>;
  const rows: [string, string | undefined][] = [
    ["App", `${context.appVersion}${context.buildSha ? ` (${context.buildSha})` : ""}`],
    ["Platform", `${context.platform}${context.osVersion ? ` ${context.osVersion}` : ""}`],
    ["Locale", context.locale],
    ["Tier", context.tier],
    ["Account type", context.accountType],
    ["From", context.fromRoute],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      {rows
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="break-all">{v}</dd>
          </div>
        ))}
    </dl>
  );
}

export function ThreadView({ threadId }: { threadId: string }) {
  const { data, isLoading } = useSupportThread(threadId);
  const update = useUpdateSupportThread(threadId);
  const translate = useTranslateSupportMessage();
  const endRef = useRef<HTMLDivElement>(null);
  const count = data?.messages.length ?? 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [count, threadId]);

  if (isLoading || !data) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  const { summary, messages } = data;
  const latestContext = [...messages].reverse().find((m) => m.context)?.context ?? null;

  async function run(p: Promise<unknown>) {
    try {
      await p;
    } catch (err) {
      toast.error(await supportErrorMessage(err));
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Link href={`/users/${summary.userId}`} className="font-medium text-primary hover:underline">
              {summary.userName || summary.userEmail}
            </Link>
            <p className="text-xs text-muted-foreground">
              {summary.userEmail} · language: {summary.userLanguage}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {summary.muted && <Badge variant="secondary">Muted</Badge>}
            {summary.status === "closed" && <Badge variant="secondary">Closed</Badge>}
            <Button
              size="sm"
              variant="outline"
              disabled={update.isPending}
              onClick={() => run(update.mutateAsync({ muted: !summary.muted }))}
            >
              {summary.muted ? "Unmute" : "Mute"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={update.isPending}
              onClick={() =>
                run(update.mutateAsync({ status: summary.status === "open" ? "closed" : "open" }))
              }
            >
              {summary.status === "open" ? "Close" : "Reopen"}
            </Button>
          </div>
        </div>
        <ContextPanel context={latestContext} />
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            translating={translate.isPending && translate.variables === m.id}
            onTranslate={(id) => run(translate.mutateAsync(id))}
          />
        ))}
        <div ref={endRef} />
      </div>
      <ReplyBox threadId={threadId} />
    </div>
  );
}
