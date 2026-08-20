"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSendBroadcast } from "@/hooks/use-communications";
import { toast } from "sonner";

export function BroadcastTab() {
  const [type, setType] = useState<"push" | "email">("push");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [tier, setTier] = useState<string>("");
  const [language, setLanguage] = useState<string>("");
  const sendBroadcast = useSendBroadcast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const filters: Record<string, unknown> = { isActive: true };
    if (tier) filters.tier = tier;
    if (language) filters.language = language;

    sendBroadcast.mutate(
      {
        type,
        title: type === "push" ? title : undefined,
        subject: type === "email" ? subject : undefined,
        body,
        html: type === "email" ? body : undefined,
        filters: filters as { tier?: string; isActive?: boolean; language?: string },
      },
      {
        onSuccess: (data) => {
          const d = data as { successCount: number; recipientCount: number };
          toast.success(`Broadcast sent to ${d.recipientCount} users (${d.successCount} success)`);
        },
        onError: () => toast.error("Failed to send broadcast"),
      }
    );
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as "push" | "email")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="push">Push Notification</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-3">
            <div className="flex-1 space-y-2">
              <Label>Filter by Tier</Label>
              <Select value={tier} onValueChange={(v) => setTier(v === "all" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="All tiers" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All tiers</SelectItem>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="business">Business</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-2">
              <Label>Filter by Language</Label>
              <Select value={language} onValueChange={(v) => setLanguage(v === "all" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="All languages" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All languages</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ru">Russian</SelectItem>
                  <SelectItem value="ua">Ukrainian</SelectItem>
                  <SelectItem value="de">German</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                  <SelectItem value="pl">Polish</SelectItem>
                  <SelectItem value="be">Belarusian</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {type === "push" && (
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
          )}
          {type === "email" && (
            <div className="space-y-2">
              <Label>Subject</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} required />
            </div>
          )}
          <div className="space-y-2">
            <Label>Body</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} required />
          </div>
          <Button type="submit" disabled={sendBroadcast.isPending}>
            {sendBroadcast.isPending ? "Sending..." : "Send Broadcast"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
