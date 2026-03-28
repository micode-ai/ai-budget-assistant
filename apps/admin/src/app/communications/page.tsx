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
import { cn, formatDate, formatDateTime, formatRelative } from "@/lib/utils";
import { toast } from "sonner";
import {
  Send,
  Mail,
  Megaphone,
  Clock,
  X,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Filter,
  History,
  Users,
  TrendingUp,
} from "lucide-react";
import type { NotificationLogItem } from "@/types";

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

const typeConfig = {
  push: { icon: Send, label: "Push", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  email: { icon: Mail, label: "Email", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  broadcast: { icon: Megaphone, label: "Broadcast", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
} as const;

function HistoryTable() {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data, isLoading } = useNotificationHistory(page);

  if (isLoading) return <p className="text-muted-foreground py-4">Loading...</p>;

  const items = data?.data ?? [];
  const filtered = typeFilter === "all" ? items : items.filter((l) => l.type === typeFilter);

  // Summary stats from current page
  const totalRecipients = items.reduce((s, l) => s + l.recipientCount, 0);
  const totalSuccess = items.reduce((s, l) => s + l.successCount, 0);
  const totalFail = items.reduce((s, l) => s + l.failCount, 0);
  const successRate = totalRecipients > 0 ? (totalSuccess / totalRecipients) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
              <History className="h-3.5 w-3.5" />
              Total Sent
            </div>
            <p className="text-2xl font-bold">{data?.total ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
              <Users className="h-3.5 w-3.5" />
              Recipients (page)
            </div>
            <p className="text-2xl font-bold">{totalRecipients}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
              Delivered
            </div>
            <p className="text-2xl font-bold text-green-600">{totalSuccess}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium mb-1">
              <TrendingUp className="h-3.5 w-3.5" />
              Success Rate
            </div>
            <p className="text-2xl font-bold">{successRate.toFixed(1)}%</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Notification History</CardTitle>
            {/* Type filter */}
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <div className="flex gap-1">
                {[
                  { value: "all", label: "All" },
                  { value: "push", label: "Push" },
                  { value: "email", label: "Email" },
                  { value: "broadcast", label: "Broadcast" },
                ].map((opt) => (
                  <Button
                    key={opt.value}
                    variant={typeFilter === opt.value ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs px-2.5"
                    onClick={() => { setTypeFilter(opt.value); setExpandedId(null); }}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No notifications found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead>Sent by</TableHead>
                  <TableHead className="text-right">Delivery</TableHead>
                  <TableHead className="text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((log) => (
                  <HistoryRow
                    key={log.id}
                    log={log}
                    expanded={expandedId === log.id}
                    onToggle={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  />
                ))}
              </TableBody>
            </Table>
          )}

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t">
              <p className="text-sm text-muted-foreground">
                Page {page} of {data.totalPages} ({data.total} total)
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= data.totalPages}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function HistoryRow({
  log,
  expanded,
  onToggle,
}: {
  log: NotificationLogItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const config = typeConfig[log.type] || typeConfig.push;
  const Icon = config.icon;
  const successRate = log.recipientCount > 0
    ? Math.round((log.successCount / log.recipientCount) * 100)
    : 0;
  const hasDetails = !!(log.body || log.filters || log.recipients?.length);

  return (
    <>
      <TableRow
        className={cn("cursor-pointer", expanded && "border-b-0")}
        onClick={hasDetails ? onToggle : undefined}
      >
        <TableCell className="w-8 pr-0">
          {hasDetails ? (
            expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )
          ) : null}
        </TableCell>
        <TableCell>
          <Badge variant="outline" className={cn("gap-1 font-medium", config.color)}>
            <Icon className="h-3 w-3" />
            {config.label}
          </Badge>
        </TableCell>
        <TableCell className="max-w-[250px]">
          <p className="truncate font-medium">
            {log.subject || log.body?.slice(0, 60) || "—"}
          </p>
        </TableCell>
        <TableCell>
          <span className="text-sm text-muted-foreground">{log.adminName || "System"}</span>
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-2">
            <div className="flex items-center gap-1 text-sm">
              <span className="text-green-600 font-medium">{log.successCount}</span>
              {log.failCount > 0 && (
                <>
                  <span className="text-muted-foreground">/</span>
                  <span className="text-red-600 font-medium">{log.failCount}</span>
                </>
              )}
              <span className="text-muted-foreground">of {log.recipientCount}</span>
            </div>
            {/* Mini success bar */}
            <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full",
                  successRate === 100 ? "bg-green-500" : successRate > 50 ? "bg-amber-500" : "bg-red-500"
                )}
                style={{ width: `${successRate}%` }}
              />
            </div>
          </div>
        </TableCell>
        <TableCell className="text-right">
          <div className="text-sm">{formatDateTime(log.createdAt)}</div>
          <div className="text-xs text-muted-foreground">{formatRelative(log.createdAt)}</div>
        </TableCell>
      </TableRow>
      {expanded && hasDetails && (
        <TableRow className="bg-muted/50 hover:bg-muted/50">
          <TableCell></TableCell>
          <TableCell colSpan={5} className="py-3">
            <div className="space-y-2 text-sm">
              {log.recipients?.length > 0 && (
                <div>
                  <span className="font-medium text-muted-foreground">Recipients: </span>
                  <div className="flex gap-1 flex-wrap mt-1">
                    {log.recipients.slice(0, 10).map((r) => (
                      <Badge key={r.id} variant="secondary" className="text-xs gap-1">
                        <Users className="h-3 w-3" />
                        {r.name || r.email}
                      </Badge>
                    ))}
                    {log.recipients.length > 10 && (
                      <Badge variant="outline" className="text-xs">
                        +{log.recipients.length - 10} more
                      </Badge>
                    )}
                  </div>
                </div>
              )}
              {log.body && (
                <div>
                  <span className="font-medium text-muted-foreground">Body: </span>
                  <span className="whitespace-pre-wrap">{log.body}</span>
                </div>
              )}
              {log.filters && Object.keys(log.filters).length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="font-medium text-muted-foreground">Filters: </span>
                  <div className="flex gap-1 flex-wrap">
                    {Object.entries(log.filters).map(([key, val]) => (
                      <Badge key={key} variant="secondary" className="text-xs">
                        {key}: {String(val)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
