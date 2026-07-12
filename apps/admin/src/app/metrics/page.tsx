"use client";

import { useState } from "react";
import { useInvestorMetrics } from "@/hooks/use-investor-metrics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/common/loading-skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip as UITooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";
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

// Plain-language descriptions shown on hover, so the metrics are self-explanatory.
const HINTS = {
  segment:
    "Filters the segment-aware metrics (W4 Retention, Activation, MRR, Free→Paid) by market — All, Poland (pl), or everyone else. The other cards stay account-wide.",
  w4Retention:
    "Share of a signup cohort still active (logged an expense or income) in their 4th week of life. A retention curve that flattens out — rather than falling to zero — is the core sign of product-market fit.",
  activation:
    "Share of new users who logged their first transaction within 3 days of signing up. This is the 'aha moment' rate — the bridge between growth and retention.",
  mrr:
    "Monthly Recurring Revenue: every active paid subscription normalized to a monthly amount (yearly plans ÷ 12), summed in USD. A trailing ≈ means some subs are billed in another currency and are approximated at the USD price.",
  momGrowth:
    "Month-over-month growth in new signups, comparing the two most recent complete months (the current partial month is excluded). Can be negative.",
  dauMau:
    "Stickiness = daily active users ÷ monthly active users. How often users come back; 20%+ is strong for a budgeting app.",
  grossMargin:
    "(MRR − estimated AI cost this month) ÷ MRR. What's left of the revenue after the AI/LLM cost of serving users.",
  retentionTable:
    "Each row is a signup week; each column Wn is the share of that cohort still active in their n-th week. Read left→right to see how fast a cohort drops off, and top→bottom to compare cohorts. Rows with fewer than 5 users are dimmed — too small to trust.",
  growthChart:
    "New user signups per calendar month. The last bar is the current, still-incomplete month.",
  payingUsers:
    "Active paying subscribers (Pro or Business). Trials are not counted here.",
  trialing:
    "Users currently in a free trial — not paying yet.",
  arpu:
    "Average Revenue Per User = MRR ÷ all monthly-active users (paying + free).",
  arppu:
    "Average Revenue Per Paying User = MRR ÷ paying users.",
  freeToPaid:
    "Share of all registered users who are currently paying.",
  trialToPaid:
    "Of the trials that have already ended, the share that converted to a paid subscription.",
  logoChurn:
    "Share of paying customers who canceled this month, counted by customer (logo), not by revenue.",
  revenueChurn:
    "Share of MRR lost to cancellations this month. Not available in v1 (—): the subscription tier is wiped on cancel, so the lost amount can't be reconstructed yet.",
  aiCogs:
    "Estimated AI/LLM cost incurred this month (Whisper, GPT, OCR, …) — the main variable cost of the product.",
  totalUsers:
    "All registered users, ever (active and deactivated).",
  totalAccounts:
    "All accounts across every type — personal, shared, business, trip.",
  transactions:
    "All expenses + incomes ever logged — a proxy for overall usage and scale.",
} as const;

function InfoHint({ text }: { text: string }) {
  return (
    <UITooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="What is this?"
          className="inline-flex text-muted-foreground/60 hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-snug">{text}</TooltipContent>
    </UITooltip>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
          {label}
          {hint && <InfoHint text={hint} />}
        </CardTitle>
      </CardHeader>
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
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Investor Metrics</h1>
          <div className="flex items-center gap-1">
            {(["all", "pl", "other"] as const).map((s) => (
              <Button key={s} variant={segment === s ? "default" : "outline"} size="sm" onClick={() => setSegment(s)}>
                {s === "all" ? "All" : s.toUpperCase()}
              </Button>
            ))}
            <span className="ml-1"><InfoHint text={HINTS.segment} /></span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          <Stat label="W4 Retention" value={pct(headline.w4)} hint={HINTS.w4Retention} />
          <Stat label="Activation" value={pct(activation)} hint={HINTS.activation} />
          <Stat label={`MRR${m.mrrApproximate ? " ≈" : ""}`} value={formatCurrency(mrr)} hint={HINTS.mrr} />
          <Stat label="MoM Growth" value={pctSigned(data.growth.momGrowthRate)} hint={HINTS.momGrowth} />
          <Stat label="DAU/MAU" value={pct(data.engagement.dauMauRatio)} hint={HINTS.dauMau} />
          <Stat label="Gross Margin" value={pct(m.grossMargin)} hint={HINTS.grossMargin} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              Weekly cohort retention
              <InfoHint text={HINTS.retentionTable} />
            </CardTitle>
          </CardHeader>
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
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              New users per month
              <InfoHint text={HINTS.growthChart} />
            </CardTitle>
          </CardHeader>
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
          <Stat label="Paying users" value={String(m.payingUsers)} hint={HINTS.payingUsers} />
          <Stat label="Trialing" value={String(m.trialingUsers)} hint={HINTS.trialing} />
          <Stat label="ARPU" value={formatCurrency(m.arpuUsd)} hint={HINTS.arpu} />
          <Stat label="ARPPU" value={formatCurrency(m.arppuUsd)} hint={HINTS.arppu} />
          <Stat label="Free→Paid" value={pct(conversion)} hint={HINTS.freeToPaid} />
          <Stat label="Trial→Paid" value={pct(m.trialToPaidConversion)} hint={HINTS.trialToPaid} />
          <Stat label="Logo churn" value={pct(m.logoChurnMonthly)} hint={HINTS.logoChurn} />
          <Stat label="Revenue churn" value={pct(m.revenueChurnMonthly)} hint={HINTS.revenueChurn} />
          <Stat label="AI COGS (mo)" value={formatCurrency(m.aiCogsUsd)} hint={HINTS.aiCogs} />
          <Stat label="Total users" value={String(data.scale.totalUsers)} hint={HINTS.totalUsers} />
          <Stat label="Total accounts" value={String(data.scale.totalAccounts)} hint={HINTS.totalAccounts} />
          <Stat label="Transactions" value={String(data.scale.totalTransactions)} hint={HINTS.transactions} />
        </div>
      </div>
    </TooltipProvider>
  );
}
