"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { PageSkeleton } from "@/components/common/loading-skeleton";
import { formatDistanceToNow } from "date-fns";
import {
  Users,
  CheckCircle,
  Clock,
  Gift,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface ReferralStats {
  totalReferrals: number;
  qualifiedReferrals: number;
  pendingReferrals: number;
  expiredReferrals: number;
  totalBonusAiRequests: number;
  activeReferrers: number;
  qualifiedRate: number;
}

interface ReferralRecord {
  id: string;
  code: string;
  status: "pending" | "qualified" | "expired";
  createdAt: string;
  qualifiedAt: string | null;
  referrer: {
    id: string;
    name: string;
    email: string;
  };
  referred: {
    id: string;
    name: string;
    email: string;
  };
}

interface ReferralsResponse {
  data: ReferralRecord[];
  total: number;
  page: number;
  limit: number;
}

const STATUS_BADGE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  qualified: "default",
  expired: "destructive",
};

const PAGE_SIZE = 20;

export default function ReferralsPage() {
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const { data: stats, isLoading: statsLoading } = useQuery<ReferralStats>({
    queryKey: ["admin", "referrals", "stats"],
    queryFn: () => api.get("admin/referrals/stats").json(),
  });

  const { data: referrals, isLoading: referralsLoading } = useQuery<ReferralsResponse>({
    queryKey: ["admin", "referrals", { status, page }],
    queryFn: () => {
      const params: Record<string, string> = {
        page: String(page),
        limit: String(PAGE_SIZE),
      };
      if (status !== "all") params.status = status;
      return api.get("admin/referrals", { searchParams: params }).json();
    },
  });

  if (statsLoading) return <PageSkeleton />;

  const totalPages = referrals ? Math.ceil(referrals.total / PAGE_SIZE) : 1;

  const handleStatusChange = (value: string) => {
    setStatus(value);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Referrals</h1>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4" />
              Total Referrals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats?.totalReferrals ?? 0}</p>
            <p className="text-xs text-muted-foreground">
              {stats?.pendingReferrals ?? 0} pending
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Qualified Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-emerald-600">
              {stats?.qualifiedRate != null ? `${stats.qualifiedRate.toFixed(1)}%` : "0%"}
            </p>
            <p className="text-xs text-muted-foreground">
              {stats?.qualifiedReferrals ?? 0} qualified
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Gift className="h-4 w-4" />
              Bonus AI Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-purple-600">
              {stats?.totalBonusAiRequests ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">total awarded</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Active Referrers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">
              {stats?.activeReferrers ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">unique referrers</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Status:</span>
        <Select value={status} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="qualified">Qualified</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {referralsLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referrer</TableHead>
                  <TableHead>Referred</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Qualified</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(referrals?.data ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No referrals found
                    </TableCell>
                  </TableRow>
                ) : (
                  (referrals?.data ?? []).map((referral) => (
                    <TableRow key={referral.id}>
                      <TableCell>
                        <div>
                          <span className="font-medium">{referral.referrer.name}</span>
                          <span className="text-xs text-muted-foreground block">
                            {referral.referrer.email}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <span className="font-medium">{referral.referred.name}</span>
                          <span className="text-xs text-muted-foreground block">
                            {referral.referred.email}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                          {referral.code}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_BADGE[referral.status] ?? "outline"}>
                          {referral.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(referral.createdAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {referral.qualifiedAt
                          ? formatDistanceToNow(new Date(referral.qualifiedAt), { addSuffix: true })
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
