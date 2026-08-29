"use client";

import { useState } from "react";
import { useAcquisitionBreakdown } from "@/hooks/use-acquisition";
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
import type { AdminAcquisitionBreakdownRow } from "@budget/shared-types";

const WINDOWS = [7, 30, 90] as const;

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
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function valueLabel(row: AdminAcquisitionBreakdownRow): string {
  return row.value === "direct" ? "Direct / unknown" : row.value;
}

function BreakdownTable({
  title,
  hint,
  rows,
  total,
}: {
  title: string;
  hint: string;
  rows: AdminAcquisitionBreakdownRow[];
  total: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          {title}
          <InfoHint text={hint} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Value</TableHead>
              <TableHead>Signups</TableHead>
              <TableHead>Share</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-muted-foreground">
                  No data yet
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.value}>
                  <TableCell className={row.value === "direct" ? "text-muted-foreground italic" : ""}>
                    {valueLabel(row)}
                  </TableCell>
                  <TableCell>{row.count}</TableCell>
                  <TableCell>{total > 0 ? `${((row.count / total) * 100).toFixed(1)}%` : "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function AcquisitionPage() {
  const [days, setDays] = useState<number>(30);
  const { data, isLoading } = useAcquisitionBreakdown(days);

  if (isLoading || !data) return <PageSkeleton />;

  const attributionRate =
    data.windowSignups > 0 ? (data.attributedWindowSignups / data.windowSignups) * 100 : 0;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Acquisition</h1>
          <div className="flex items-center gap-1">
            {WINDOWS.map((w) => (
              <Button
                key={w}
                variant={days === w ? "default" : "outline"}
                size="sm"
                onClick={() => setDays(w)}
              >
                {w}d
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat
            label="Total users (all time)"
            value={String(data.totalUsers)}
            hint="All registered users, ever — including those who signed up before attribution tracking existed."
          />
          <Stat
            label={`Signups (last ${data.windowDays}d)`}
            value={String(data.windowSignups)}
            hint="New accounts created within the selected window."
          />
          <Stat
            label="Attributed signups"
            value={String(data.attributedWindowSignups)}
            hint="Signups in the window that arrived via a tagged link (?src=&loc=&lang=). The rest are direct/organic/native installs, which carry no query string."
          />
          <Stat
            label="Attribution rate"
            value={`${attributionRate.toFixed(1)}%`}
            hint="Share of window signups that could be traced back to a specific marketing link. Native app installs can never carry this (no query string on an install), so 100% is not the expected ceiling."
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <BreakdownTable
            title="By source (page type)"
            hint="Which site the signup's first-touch link came from: the marketing landing page, a blog article, or a help-center page."
            rows={data.bySource}
            total={data.windowSignups}
          />
          <BreakdownTable
            title="By location (link placement)"
            hint="Where on the page the clicked link sat — nav, hero, a feature band, a pricing card, the footer, or an in-article CTA."
            rows={data.byLocation}
            total={data.windowSignups}
          />
          <BreakdownTable
            title="By language"
            hint="The language of the page the visitor was on when they clicked through (bcp47 code, e.g. uk = Ukrainian)."
            rows={data.byLanguage}
            total={data.windowSignups}
          />
          <BreakdownTable
            title="By selected plan"
            hint="Which pricing tier the visitor had selected when they clicked through, if the link came from a pricing card."
            rows={data.byPlan}
            total={data.windowSignups}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}
