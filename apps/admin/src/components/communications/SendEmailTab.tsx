"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSendEmail } from "@/hooks/use-communications";
import { toast } from "sonner";

export function SendEmailTab() {
  const [userIds, setUserIds] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const sendEmail = useSendEmail();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ids = userIds.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) { toast.error("Enter at least one user ID"); return; }
    sendEmail.mutate(
      { userIds: ids, subject, html },
      {
        onSuccess: (data) => {
          const d = data as { successCount: number; failCount: number };
          toast.success(`Email sent: ${d.successCount} success, ${d.failCount} failed`);
          setUserIds(""); setSubject(""); setHtml("");
        },
        onError: () => toast.error("Failed to send email"),
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
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Email subject" required />
          </div>
          <div className="space-y-2">
            <Label>HTML Body</Label>
            <Textarea value={html} onChange={(e) => setHtml(e.target.value)} rows={8} placeholder="<h1>Hello</h1><p>...</p>" required />
          </div>
          <Button type="submit" disabled={sendEmail.isPending}>
            {sendEmail.isPending ? "Sending..." : "Send Email"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
