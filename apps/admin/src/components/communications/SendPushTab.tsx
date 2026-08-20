"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSendPush } from "@/hooks/use-communications";
import { toast } from "sonner";

export function SendPushTab() {
  const [userIds, setUserIds] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const sendPush = useSendPush();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ids = userIds.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) { toast.error("Enter at least one user ID"); return; }
    sendPush.mutate(
      { userIds: ids, title, body },
      {
        onSuccess: (data) => {
          const d = data as { successCount: number; failCount: number };
          toast.success(`Push sent: ${d.successCount} success, ${d.failCount} failed`);
          setUserIds(""); setTitle(""); setBody("");
        },
        onError: () => toast.error("Failed to send push"),
      }
    );
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
          <div className="space-y-2">
            <Label>User IDs (comma-separated)</Label>
            <Textarea value={userIds} onChange={(e) => setUserIds(e.target.value)} placeholder="user-id-1, user-id-2" />
          </div>
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Notification title" required />
          </div>
          <div className="space-y-2">
            <Label>Body</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Notification body" required />
          </div>
          <Button type="submit" disabled={sendPush.isPending}>
            {sendPush.isPending ? "Sending..." : "Send Push"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
