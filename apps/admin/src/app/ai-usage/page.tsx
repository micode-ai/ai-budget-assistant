"use client";

import { useState } from "react";
import { useDashboard } from "@/hooks/use-dashboard";
import { useAiUsage } from "@/hooks/use-ai-usage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/common/date-range-picker";
import { TierBadge } from "@/components/common/tier-badge";
import { PageSkeleton } from "@/components/common/loading-skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatCurrency, formatPercent } from "@/lib/utils";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { Download } from "lucide-react";
import type { SubscriptionTier } from "@/types";

const FEATURE_COLORS: Record<string, string> = {
  voice: "#f59e0b",
  chat: "#3b82f6",
  parse: "#10b981",
  categorization: "#8b5cf6",
  ocr: "#ef4444",
};

export default function AiUsagePage() {
  const [startDate, setStartDate] = useState(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState(endOfMonth(new Date()));

  const sd = format(startDate, "yyyy-MM-dd");
  const ed = format(endDate, "yyyy-MM-dd");

  const { data: dashboard, isLoading: dashLoading } = useDashboard(sd, ed);
  const { data: trends, isLoading: trendsLoading } = useAiUsage(sd, ed);

  if (dashLoading || trendsLoading) return <PageSkeleton />;

  const aiUsage = dashboard?.aiUsage;
  const totalCost = aiUsage?.totalEstimatedCostUsd ?? 0;
  const totalRequests = aiUsage?.totalRequests ?? 0;

  // Aggregate features across all users
  const featureMap = new Map<string, { cost: number; count: number }>();
  for (const user of aiUsage?.users ?? []) {
    for (const f of user.byFeature) {
      const entry = featureMap.get(f.featureType) || { cost: 0, count: 0 };
      entry.cost += f.estimatedCostUsd;
      entry.count += f.count;
      featureMap.set(f.featureType, entry);
    }
  }
  const featurePieData = Array.from(featureMap.entries()).map(([name, data]) => ({
    name,
    value: Math.round(data.cost * 10000) / 10000,
    count: data.count,
  }));

  const trendData = (trends ?? []).map((t) => ({
    date: t.date.slice(5),
    cost: t.totalCost,
    requests: t.totalRequests,
  }));

  const exportCsv = () => {
    const headers = "User,Email,Tier,Requests,Cost USD\n";
    const rows = (aiUsage?.users ?? [])
      .map((u) => `"${u.userName}","${u.userEmail}","${u.tier}",${u.requestCount},${u.estimatedCostUsd}`)
      .join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-usage-${sd}-${ed}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">AI Usage</h1>
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <DateRangePicker
        startDate={startDate}
        endDate={endDate}
        onChange={(s, e) => { setStartDate(s); setEndDate(e); }}
      />

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatCurrency(totalCost)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Requests</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalRequests.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Avg Cost/Request</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              ${totalRequests > 0 ? (totalCost / totalRequests).toFixed(4) : "0.0000"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Feature breakdown donut */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Feature Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={featurePieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {featurePieData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={FEATURE_COLORS[entry.name] || "#94a3b8"}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`$${Number(value).toFixed(4)}`, "Cost"]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Daily trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daily Cost Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="aiUsageGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(value) => [`$${Number(value).toFixed(4)}`, "Cost"]} />
                  <Area type="monotone" dataKey="cost" stroke="#8b5cf6" fill="url(#aiUsageGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-user table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-User Usage</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Requests</TableHead>
                <TableHead className="text-right">Est. Cost</TableHead>
                <TableHead>Features</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(aiUsage?.users ?? []).map((user) => (
                <TableRow key={user.userId}>
                  <TableCell>
                    <div>
                      <span className="font-medium">{user.userName}</span>
                      <span className="text-xs text-muted-foreground block">{user.userEmail}</span>
                    </div>
                  </TableCell>
                  <TableCell><TierBadge tier={user.tier as SubscriptionTier} /></TableCell>
                  <TableCell>{user.requestCount}</TableCell>
                  <TableCell className="text-right font-mono">${user.estimatedCostUsd.toFixed(4)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {user.byFeature.map((f) => (
                        <span key={f.featureType} className="text-xs px-1.5 py-0.5 rounded bg-muted">
                          {f.featureType}: {f.count}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
