"use client";

import { useSubscriptionStats } from "@/hooks/use-subscriptions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageSkeleton } from "@/components/common/loading-skeleton";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

const COLORS = ["#94a3b8", "#3b82f6", "#8b5cf6", "#f59e0b"];

export default function SubscriptionsPage() {
  const { data, isLoading } = useSubscriptionStats();

  if (isLoading) return <PageSkeleton />;
  if (!data) return null;

  const dist = data.distribution;
  const total = dist.free + dist.pro + dist.business + dist.trialing;
  const pieData = [
    { name: "Free", value: dist.free },
    { name: "Pro", value: dist.pro },
    { name: "Business", value: dist.business },
    { name: "Trialing", value: dist.trialing },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Subscriptions</h1>

      {/* Stats cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Free</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{dist.free}</p>
            <p className="text-xs text-muted-foreground">
              {total > 0 ? ((dist.free / total) * 100).toFixed(1) : 0}% of total
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Pro</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">{dist.pro}</p>
            <p className="text-xs text-muted-foreground">
              {total > 0 ? ((dist.pro / total) * 100).toFixed(1) : 0}% of total
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Business</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-purple-600">{dist.business}</p>
            <p className="text-xs text-muted-foreground">
              {total > 0 ? ((dist.business / total) * 100).toFixed(1) : 0}% of total
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">MRR</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-emerald-600">{formatCurrency(data.mrr)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pie chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value">
                    {pieData.map((_, i) => (
                      <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Metrics */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Key Metrics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <span className="text-sm text-muted-foreground">Churn Rate (Monthly)</span>
              <p className="text-2xl font-bold">{data.churnRate}%</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Conversion Rate (Free → Paid)</span>
              <p className="text-2xl font-bold">{data.conversionRate}%</p>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">Trialing</span>
              <p className="text-2xl font-bold">{dist.trialing}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent changes */}
      {data.recentChanges.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Tier Changes</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Admin</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>User ID</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentChanges.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.adminName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{c.action}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{c.targetId?.slice(0, 8)}...</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {JSON.stringify(c.details)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(c.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
