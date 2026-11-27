"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supportErrorMessage, useReplySupport } from "@/hooks/use-support";

const MAX_LENGTH = 4000;

export function ReplyBox({ threadId }: { threadId: string }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const reply = useReplySupport(threadId);

  async function send() {
    const text = body.trim();
    if (!text || reply.isPending) return;
    setError(null);
    try {
      await reply.mutateAsync(text);
      setBody("");
    } catch (err) {
      const msg = await supportErrorMessage(err);
      setError(msg === "user_inactive" ? "This user's account is deleted; replies are disabled." : msg);
    }
  }

  return (
    <div className="space-y-2 border-t p-3">
      <Textarea
        rows={3}
        maxLength={MAX_LENGTH}
        value={body}
        placeholder="Reply in your language, it is translated for the user. Ctrl+Enter to send."
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void send();
          }
        }}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {body.length}/{MAX_LENGTH}
        </span>
        <Button onClick={() => void send()} disabled={!body.trim() || reply.isPending}>
          {reply.isPending ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}
