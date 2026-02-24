"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useSendPush,
  useSendEmail,
  useSendBroadcast,
  useNotificationHistory,
  useScheduledNotifications,
  useCancelScheduledNotification,
} from "@/hooks/use-communications";
import { formatDate, formatDateTime } from "@/lib/utils";
import { toast } from "sonner";
import { Send, Mail, Megaphone, Clock, X } from "lucide-react";

export default function CommunicationsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Communications</h1>

      <Tabs defaultValue="push">
        <TabsList>
          <TabsTrigger value="push">
            <Send className="h-4 w-4 mr-1" />
            Send Push
          </TabsTrigger>
          <TabsTrigger value="email">
            <Mail className="h-4 w-4 mr-1" />
            Send Email
          </TabsTrigger>
          <TabsTrigger value="broadcast">
            <Megaphone className="h-4 w-4 mr-1" />
            Broadcast
          </TabsTrigger>
          <TabsTrigger value="scheduled">
            <Clock className="h-4 w-4 mr-1" />
            Scheduled
          </TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="push"><PushForm /></TabsContent>
        <TabsContent value="email"><EmailForm /></TabsContent>
        <TabsContent value="broadcast"><BroadcastForm /></TabsContent>
        <TabsContent value="scheduled"><ScheduledList /></TabsContent>
        <TabsContent value="history"><HistoryTable /></TabsContent>
      </Tabs>
    </div>
  );
}

function PushForm() {
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

function EmailForm() {
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

function BroadcastForm() {
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

function ScheduledList() {
  const { data: scheduled, isLoading } = useScheduledNotifications();
  const cancelMutation = useCancelScheduledNotification();

  if (isLoading) return <p className="text-muted-foreground py-4">Loading...</p>;

  return (
    <Card>
      <CardContent className="pt-6">
        {(!scheduled || scheduled.length === 0) ? (
          <p className="text-center text-muted-foreground py-8">No scheduled notifications</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Title/Subject</TableHead>
                <TableHead>Scheduled For</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scheduled.map((n) => (
                <TableRow key={n.id}>
                  <TableCell><Badge variant="outline">{n.type}</Badge></TableCell>
                  <TableCell>{n.title || n.subject || "—"}</TableCell>
                  <TableCell>{formatDateTime(n.scheduledAt)}</TableCell>
                  <TableCell><Badge>{n.status}</Badge></TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        cancelMutation.mutate(n.id, {
                          onSuccess: () => toast.success("Cancelled"),
                        })
                      }
                      disabled={cancelMutation.isPending}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function HistoryTable() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useNotificationHistory(page);

  if (isLoading) return <p className="text-muted-foreground py-4">Loading...</p>;

  return (
    <Card>
      <CardContent className="pt-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Recipients</TableHead>
              <TableHead>Success</TableHead>
              <TableHead>Failed</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data?.data ?? []).map((log) => (
              <TableRow key={log.id}>
                <TableCell><Badge variant="outline">{log.type}</Badge></TableCell>
                <TableCell className="max-w-[200px] truncate">{log.subject || log.body?.slice(0, 50) || "—"}</TableCell>
                <TableCell>{log.recipientCount}</TableCell>
                <TableCell className="text-green-600">{log.successCount}</TableCell>
                <TableCell className="text-red-600">{log.failCount}</TableCell>
                <TableCell className="text-muted-foreground">{formatDateTime(log.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {data && data.totalPages > 1 && (
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              Prev
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= data.totalPages}>
              Next
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
