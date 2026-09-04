"use client";

import { useState } from "react";
import { useTelemetryFunnel } from "@/hooks/use-telemetry-funnel";
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
import type { TelemetryScreenRow } from "@budget/shared-types";

const WINDOWS = [7, 30, 90] as const;

const HINTS = {
  flows:
    "A flow reports 'started' when its screen opens and 'completed' when it saves. Both are counted once per visit, so a screen that lets you submit several times without leaving (chat, receipt scanning, rate alerts) reads as one completed visit, not one per save — this measures abandonment, not volume. 'Abandoned' is derived — started minus completed minus failed — because a screen that is left cannot run code to report itself; 'failed' is not deduplicated, so a visit that failed validation twice and then saved counts twice as failed. Completion can still exceed 100% near a window boundary, because a session that started before the window can complete inside it.",
  screens:
    "Screen views in the window, most viewed first. The name is the route pattern, so a dynamic route reads as expense/[id] and never carries a real id.",
  lastScreens: "The screen each session ended on, most frequent first. This is where people leave.",
  webOnly:
    "Signed-in web sessions only. Mobile sends nothing — the native client is a deliberate no-op — so these numbers are not app-wide.",
};

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

function ScreenTable({
  title,
  hint,
  rows,
}: {
  title: string;
  hint: string;
  rows: TelemetryScreenRow[];
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
              <TableHead>Screen</TableHead>
              <TableHead className="text-right">Count</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, 25).map((row) => (
              <TableRow key={row.screen}>
                <TableCell className="font-mono text-xs max-w-[24rem] truncate" title={row.screen}>
                  {row.screen}
                </TableCell>
                <TableCell className="text-right">{row.views}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={2}>No screen views in this window.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export default function TelemetryPage() {
  const [days, setDays] = useState<number>(30);
  const { data, isLoading, isError, refetch } = useTelemetryFunnel(days);

  if (isError) {
    return (
      <TooltipProvider delayDuration={150}>
        <div className="space-y-6 p-6">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold flex items-center gap-1.5">
              Product telemetry
              <InfoHint text={HINTS.webOnly} />
            </h1>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Couldn&apos;t load telemetry</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                The funnel request failed. This is not the same as an empty window —
                retry before concluding there is no data.
              </p>
              <Button size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      </TooltipProvider>
    );
  }

  if (isLoading || !data) return <PageSkeleton />;

  const flows = data?.flows ?? [];
  const totalStarted = flows.reduce((sum, f) => sum + f.started, 0);
  const totalCompleted = flows.reduce((sum, f) => sum + f.completed, 0);
  const sessions = (data?.lastScreens ?? []).reduce((sum, s) => sum + s.views, 0);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold flex items-center gap-1.5">
            Product telemetry
            <InfoHint text={HINTS.webOnly} />
          </h1>
          <div className="ml-auto flex gap-1">
            {WINDOWS.map((w) => (
              <Button
                key={w}
                variant={w === days ? "default" : "outline"}
                size="sm"
                onClick={() => setDays(w)}
              >
                {w}d
              </Button>
            ))}
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Sign-ups, activation and retention live on Investor metrics. This page
          answers what a signed-in web user did <em>before</em> writing anything.
        </p>

        {data.truncated && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <strong>Partial window.</strong> This window holds more events than one
            request will read, so the figures below cover only its most recent
            portion — not the full {days} days. Narrow the window for numbers that
            cover all of it.
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Stat
            label="Sessions with a screen view"
            value={String(sessions)}
            hint={HINTS.lastScreens}
          />
          <Stat label="Flows started" value={String(totalStarted)} hint={HINTS.flows} />
          <Stat
            label="Overall completion"
            value={totalStarted > 0 ? `${Math.round((totalCompleted / totalStarted) * 100)}%` : "—"}
            hint={HINTS.flows}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              Flows
              <InfoHint text={HINTS.flows} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Flow</TableHead>
                  <TableHead className="text-right">Started</TableHead>
                  <TableHead className="text-right">Completed</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Abandoned</TableHead>
                  <TableHead className="text-right">Completion</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flows.map((row) => {
                  // Derived, not reported: a screen that is left cannot run code.
                  const abandoned = Math.max(
                    row.abandoned,
                    row.started - row.completed - row.failed,
                  );
                  return (
                    <TableRow key={row.flow}>
                      <TableCell className="font-medium">{row.flow}</TableCell>
                      <TableCell className="text-right">{row.started}</TableCell>
                      <TableCell className="text-right">{row.completed}</TableCell>
                      <TableCell className="text-right">{row.failed}</TableCell>
                      <TableCell className="text-right">{abandoned}</TableCell>
                      <TableCell className="text-right">
                        {row.started > 0
                          ? `${Math.round((row.completed / row.started) * 100)}%`
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {flows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>No flow events in this window.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <ScreenTable title="Most viewed screens" hint={HINTS.screens} rows={data?.screens ?? []} />
          <ScreenTable
            title="Where sessions end"
            hint={HINTS.lastScreens}
            rows={data?.lastScreens ?? []}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}
