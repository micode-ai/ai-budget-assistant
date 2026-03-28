"use client";

import { use, useState } from "react";
import { useUserDetail, useChangeSubscriptionTier, useSetCustomAiLimit, useDeactivateUser, useDeleteUser } from "@/hooks/use-users";
import { useSendPush, useSendEmail, useUserNotificationHistory } from "@/hooks/use-communications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { TierBadge } from "@/components/common/tier-badge";
import { StatusBadge } from "@/components/common/status-badge";
import { PageSkeleton } from "@/components/common/loading-skeleton";
import { formatDate, formatCurrency } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ArrowLeft, Shield, UserX, Trash2, Bell, Mail, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { SubscriptionTier } from "@/types";

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: user, isLoading } = useUserDetail(id);
  const changeTier = useChangeSubscriptionTier();
  const setAiLimit = useSetCustomAiLimit();
  const deactivate = useDeactivateUser();
  const deleteUser = useDeleteUser();
  const sendPush = useSendPush();
  const sendEmail = useSendEmail();
  const { data: notifHistory } = useUserNotificationHistory(id);
  const [tierDialogOpen, setTierDialogOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string>("");
  const [pushDialogOpen, setPushDialogOpen] = useState(false);
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailHtml, setEmailHtml] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [aiLimitInput, setAiLimitInput] = useState("");

  if (isLoading) return <PageSkeleton />;
  if (!user) return <p>User not found</p>;

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleChangeTier = () => {
    if (!selectedTier) return;
    changeTier.mutate(
      { userId: id, tier: selectedTier },
      {
        onSuccess: () => {
          toast.success(`Tier changed to ${selectedTier}`);
          setTierDialogOpen(false);
        },
        onError: () => toast.error("Failed to change tier"),
      }
    );
  };

  const handleDeactivate = () => {
    if (!confirm("Are you sure you want to deactivate this user?")) return;
    deactivate.mutate(id, {
      onSuccess: () => toast.success("User deactivated"),
      onError: () => toast.error("Failed to deactivate user"),
    });
  };

  const handleDeleteUser = () => {
    deleteUser.mutate(id, {
      onSuccess: () => {
        toast.success(`${user.name} has been permanently deleted`);
        setDeleteDialogOpen(false);
        router.push("/users");
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to delete user"),
    });
  };

  const handleSendPush = () => {
    sendPush.mutate(
      { userIds: [id], title: pushTitle, body: pushBody },
      {
        onSuccess: () => {
          toast.success("Push notification sent");
          setPushDialogOpen(false);
          setPushTitle(""); setPushBody("");
        },
        onError: () => toast.error("Failed to send push"),
      }
    );
  };

  const handleSendEmail = () => {
    sendEmail.mutate(
      { userIds: [id], subject: emailSubject, html: emailHtml },
      {
        onSuccess: () => {
          toast.success("Email sent");
          setEmailDialogOpen(false);
          setEmailSubject(""); setEmailHtml("");
        },
        onError: () => toast.error("Failed to send email"),
      }
    );
  };

  const featureChartData = user.aiUsage?.byFeature.map((f) => ({
    name: f.featureType,
    cost: f.estimatedCostUsd,
    count: f.count,
  })) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/users">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">User Detail</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="text-lg">{initials}</AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-semibold text-lg">{user.name}</h3>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Status</span>
                <div className="mt-1"><StatusBadge active={user.isActive} /></div>
              </div>
              <div>
                <span className="text-muted-foreground">Language</span>
                <p className="font-medium mt-1">{user.language.toUpperCase()}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Currency</span>
                <p className="font-medium mt-1">{user.currencyCode}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Timezone</span>
                <p className="font-medium mt-1">{user.timezone}</p>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Registered</span>
                <p className="font-medium mt-1">{formatDate(user.createdAt)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Subscription */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Subscription</CardTitle>
            <Dialog open={tierDialogOpen} onOpenChange={setTierDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Shield className="h-3 w-3 mr-1" />
                  Change Tier
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Change Subscription Tier</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <Select value={selectedTier} onValueChange={setSelectedTier}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select tier" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">Free</SelectItem>
                      <SelectItem value="pro">Pro</SelectItem>
                      <SelectItem value="business">Business</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={handleChangeTier} disabled={!selectedTier || changeTier.isPending} className="w-full">
                    {changeTier.isPending ? "Changing..." : "Confirm Change"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <TierBadge tier={(user.subscription?.tier ?? "free") as SubscriptionTier} />
              <Badge variant="outline">{user.subscription?.status ?? "none"}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">AI Requests Used</span>
                <p className="font-medium mt-1">{user.subscription?.aiRequestsUsed ?? 0}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Period End</span>
                <p className="font-medium mt-1">
                  {user.subscription?.currentPeriodEnd
                    ? formatDate(user.subscription.currentPeriodEnd)
                    : "N/A"}
                </p>
              </div>
            </div>
            <div className="border rounded-lg p-3 space-y-2">
              <span className="text-sm text-muted-foreground">AI Request Limit</span>
              <p className="text-sm font-medium">
                {user.subscription?.customAiLimit != null
                  ? `Custom: ${user.subscription.customAiLimit}`
                  : "Tier default"}
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="Custom limit"
                  value={aiLimitInput}
                  onChange={(e) => setAiLimitInput(e.target.value)}
                  className="w-32 h-8 text-sm"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!aiLimitInput || setAiLimit.isPending}
                  onClick={() => {
                    const val = parseInt(aiLimitInput);
                    if (isNaN(val) || val < 0) return;
                    setAiLimit.mutate(
                      { userId: id, customAiLimit: val },
                      { onSuccess: () => { toast.success(`AI limit set to ${val}`); setAiLimitInput(""); } },
                    );
                  }}
                >
                  Set
                </Button>
                {user.subscription?.customAiLimit != null && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={setAiLimit.isPending}
                    onClick={() => {
                      setAiLimit.mutate(
                        { userId: id, customAiLimit: null },
                        { onSuccess: () => { toast.success("Reset to tier default"); setAiLimitInput(""); } },
                      );
                    }}
                  >
                    Reset
                  </Button>
                )}
              </div>
            </div>
            {user.subscription?.stripeCustomerId && (
              <div className="text-sm">
                <span className="text-muted-foreground">Stripe ID</span>
                <p className="font-mono text-xs mt-1">{user.subscription.stripeCustomerId}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Send Push */}
            <Dialog open={pushDialogOpen} onOpenChange={setPushDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full" disabled={!user.pushToken}>
                  <Bell className="h-4 w-4 mr-2" />
                  Send Push Notification
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Send Push to {user.name}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="space-y-1">
                    <Label>Title</Label>
                    <Input value={pushTitle} onChange={(e) => setPushTitle(e.target.value)} placeholder="Notification title" />
                  </div>
                  <div className="space-y-1">
                    <Label>Body</Label>
                    <Textarea value={pushBody} onChange={(e) => setPushBody(e.target.value)} placeholder="Notification body" rows={4} />
                  </div>
                  <Button onClick={handleSendPush} disabled={!pushTitle || !pushBody || sendPush.isPending} className="w-full">
                    {sendPush.isPending ? "Sending..." : "Send Push"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Send Email */}
            <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full">
                  <Mail className="h-4 w-4 mr-2" />
                  Send Email
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Send Email to {user.name}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div className="space-y-1">
                    <Label>Subject</Label>
                    <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder="Email subject" />
                  </div>
                  <div className="space-y-1">
                    <Label>Body</Label>
                    <Textarea value={emailHtml} onChange={(e) => setEmailHtml(e.target.value)} placeholder="Email body (HTML supported)" rows={6} />
                  </div>
                  <Button onClick={handleSendEmail} disabled={!emailSubject || !emailHtml || sendEmail.isPending} className="w-full">
                    {sendEmail.isPending ? "Sending..." : "Send Email"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Deactivate */}
            <Button
              variant="destructive"
              className="w-full"
              onClick={handleDeactivate}
              disabled={!user.isActive || deactivate.isPending}
            >
              <UserX className="h-4 w-4 mr-2" />
              {user.isActive ? "Deactivate User" : "Already Inactive"}
            </Button>

            {/* Delete permanently */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" className="w-full">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete User
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Permanently Delete User</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <p className="text-sm text-muted-foreground">
                    Are you sure you want to permanently delete <strong>{user.name}</strong> ({user.email})?
                    This will remove ALL their data including expenses, incomes, budgets, and accounts.
                  </p>
                  <p className="text-sm font-medium text-destructive">
                    This action cannot be undone.
                  </p>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleDeleteUser}
                      disabled={deleteUser.isPending}
                    >
                      {deleteUser.isPending ? "Deleting..." : "Delete Permanently"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <div className="text-sm text-muted-foreground space-y-0.5">
              <p>Push token: {user.pushToken ? "Active" : "None"}</p>
              <p>Weekly email: {user.weeklyEmailEnabled ? "On" : "Off"}</p>
              <p>Monthly digest: {user.monthlyDigestEnabled ? "On" : "Off"}</p>
              <p>AI mode: {user.aiResponseMode ?? "default"}</p>
              <p>AI model: {user.aiModel ?? "default"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Accounts */}
      {user.accounts && user.accounts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Accounts ({user.accounts.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Currency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {user.accounts.map((acc) => (
                  <TableRow key={acc.id}>
                    <TableCell className="font-medium">{acc.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{acc.type}</Badge>
                    </TableCell>
                    <TableCell className="capitalize">{acc.role}</TableCell>
                    <TableCell>{acc.currencyCode}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* AI Usage Chart */}
      {featureChartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI Usage This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={featureChartData}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(value) => [`$${Number(value).toFixed(4)}`, "Cost"]} />
                  <Bar dataKey="cost" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Expenses */}
      {user.recentExpenses && user.recentExpenses.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {user.recentExpenses.slice(0, 10).map((exp) => (
                  <TableRow key={exp.id}>
                    <TableCell className="text-muted-foreground">{formatDate(exp.date)}</TableCell>
                    <TableCell>{exp.description || "—"}</TableCell>
                    <TableCell>{exp.categoryName || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{exp.source}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(exp.amount, exp.currencyCode)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Notification History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4" />
            Notification History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!notifHistory || notifHistory.data.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No notifications sent to this user yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Subject / Body</TableHead>
                  <TableHead>Sent by</TableHead>
                  <TableHead className="text-right">Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notifHistory.data.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatDate(log.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          log.type === "push"
                            ? "border-blue-500 text-blue-500"
                            : log.type === "email"
                            ? "border-purple-500 text-purple-500"
                            : "border-orange-500 text-orange-500"
                        }
                      >
                        {log.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm">
                      {log.subject || log.body || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.adminName}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      <span className="text-green-600">{log.successCount} ok</span>
                      {log.failCount > 0 && (
                        <span className="text-destructive ml-2">{log.failCount} fail</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
