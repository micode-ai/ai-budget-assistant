"use client";

import { useState } from "react";
import { useInvestorMetrics } from "@/hooks/use-investor-metrics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/common/loading-skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/lib/utils";
import type { SegmentMetrics } from "@budget/shared-types";

// Metric values from the API are fractions in [0,1] (e.g. 0.42 = 42%). Most
// metrics on this page are point-in-time levels (retention, activation,
// conversion, margin, churn, etc.), not deltas, so they render as a plain
// percentage with no leading sign.
function pct(v: number | null | undefined): string {
  return v == null ? "—" : `${(v * 100).toFixed(1)}%`;
}

// MoM Growth is a genuine delta (can be negative) — sign it explicitly.
function pctSigned(v: number | null | undefined): string {
  return v == null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent><div className="text-2xl font-bold">{value}</div></CardContent>
    </Card>
  );
}

function heat(v: number | null): string {
  if (v == null) return "bg-transparent text-muted-foreground";
  if (v >= 0.4) return "bg-green-500/30";
  if (v >= 0.2) return "bg-green-500/15";
  if (v > 0) return "bg-yellow-500/15";
  return "bg-red-500/10";
}

export default function MetricsPage() {
  const { data, isLoading } = useInvestorMetrics();
  const [segment, setSegment] = useState<"all" | "pl" | "other">("all");

  if (isLoading || !data) return <PageSkeleton />;

  const m = data.monetization;
  const seg: SegmentMetrics | undefined =
    segment === "all" ? undefined : data.segments.find((s) => s.segment === segment);
  const headline = seg ? seg.retentionHeadline : data.retention.headline;
  const activation = seg ? seg.activationRate : data.activation.activationRate;
  const conversion = seg ? seg.freeToPaidConversion : m.freeToPaidConversion;
  const mrr = seg ? seg.mrrUsd : m.mrrUsd;

  const weekCount = data.retention.weekly.reduce((mx, r) => Math.max(mx, r.retention.length), 0);

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Investor Metrics</h1>
        <div className="flex gap-1">
          {(["all", "pl", "other"] as const).map((s) => (
            <Button key={s} variant={segment === s ? "default" : "outline"} size="sm" onClick={() => setSegment(s)}>
              {s === "all" ? "All" : s.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="W4 Retention" value={pct(headline.w4)} />
        <Stat label="Activation" value={pct(activation)} />
        <Stat label={`MRR${m.mrrApproximate ? " ≈" : ""}`} value={formatCurrency(mrr)} />
        <Stat label="MoM Growth" value={pctSigned(data.growth.momGrowthRate)} />
        <Stat label="DAU/MAU" value={pct(data.engagement.dauMauRatio)} />
        <Stat label="Gross Margin" value={pct(m.grossMargin)} />
      </div>

      <Card>
        <CardHeader><CardTitle>Weekly cohort retention</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cohort week</TableHead>
                <TableHead>Users</TableHead>
                {Array.from({ length: weekCount }).map((_, i) => <TableHead key={i}>W{i}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...data.retention.weekly].reverse().map((row) => (
                <TableRow key={row.cohortWeekStart} className={row.cohortSize < 5 ? "opacity-50" : ""}>
                  <TableCell>{row.cohortWeekStart}</TableCell>
                  <TableCell>{row.cohortSize}</TableCell>
                  {row.retention.map((v, i) => (
                    <TableCell key={i} className={heat(v)}>{v == null ? "" : `${(v * 100).toFixed(0)}%`}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>New users per month</CardTitle></CardHeader>
        <CardContent style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.growth.monthly}>
              <XAxis dataKey="period" fontSize={12} />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip />
              <Bar dataKey="newUsers" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Paying users" value={String(m.payingUsers)} />
        <Stat label="Trialing" value={String(m.trialingUsers)} />
        <Stat label="ARPU" value={formatCurrency(m.arpuUsd)} />
        <Stat label="ARPPU" value={formatCurrency(m.arppuUsd)} />
        <Stat label="Free→Paid" value={pct(conversion)} />
        <Stat label="Trial→Paid" value={pct(m.trialToPaidConversion)} />
        <Stat label="Logo churn" value={pct(m.logoChurnMonthly)} />
        <Stat label="Revenue churn" value={pct(m.revenueChurnMonthly)} />
        <Stat label="AI COGS (mo)" value={formatCurrency(m.aiCogsUsd)} />
        <Stat label="Total users" value={String(data.scale.totalUsers)} />
        <Stat label="Total accounts" value={String(data.scale.totalAccounts)} />
        <Stat label="Transactions" value={String(data.scale.totalTransactions)} />
      </div>
    </div>
  );
}
