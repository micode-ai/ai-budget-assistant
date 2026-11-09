"use client";

import { useState } from "react";
import { useActivationReport } from "@/hooks/use-activation-report";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PageSkeleton } from "@/components/common/loading-skeleton";
import { ActivationKpis } from "@/components/activation/activation-kpis";
import { RetentionCurve } from "@/components/activation/retention-curve";
import { ChannelTable } from "@/components/activation/channel-table";
import { CohortTable } from "@/components/activation/cohort-table";
import { InfoHint } from "@/components/activation/stat";

const WINDOWS = [12, 26, 52] as const;

export default function ActivationPage() {
  const [weeks, setWeeks] = useState<number>(26);
  const [includeInternal, setIncludeInternal] = useState(false);
  const { data, isLoading, isError, refetch } = useActivationReport(weeks, includeInternal);

  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <h1 className="text-2xl font-semibold flex items-center gap-1.5">
        Activation &amp; Retention
        <InfoHint text="Built from transactions on the server, so it covers every platform (Android, web, bots), unlike Telemetry, which sees only the web app. Activated = logged a first expense or income; active in a week = logged one that week. Same definitions as Investor Metrics." />
      </h1>
      <div className="ml-auto flex items-center gap-1">
        <Button
          variant={includeInternal ? "default" : "outline"}
          size="sm"
          aria-pressed={includeInternal}
          onClick={() => setIncludeInternal((v) => !v)}
          className="mr-2"
        >
          Include internal accounts
        </Button>
        {WINDOWS.map((w) => (
          <Button key={w} variant={w === weeks ? "default" : "outline"} size="sm" onClick={() => setWeeks(w)}>
            {w}w
          </Button>
        ))}
      </div>
    </div>
  );

  if (isError) {
    return (
      <TooltipProvider delayDuration={150}>
        <div className="space-y-6 p-6">
          {header}
          <Card>
            <CardHeader>
              <CardTitle>Couldn&apos;t load the report</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">The request failed. Retry before reading anything into it.</p>
              <Button size="sm" onClick={() => refetch()}>Retry</Button>
            </CardContent>
          </Card>
        </div>
      </TooltipProvider>
    );
  }

  if (isLoading || !data) return <PageSkeleton />;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6 p-6">
        {header}
        <p className="text-sm text-muted-foreground">
          Signups from the last {data.weeks} weeks.{" "}
          {data.internalExcluded
            ? `Internal accounts excluded (${data.excludedAccounts} from ADMIN_EMAILS).`
            : "Internal accounts included: these figures count the team's own use."}
        </p>

        <ActivationKpis s={data.summary} />
        <RetentionCurve curve={data.curve} />
        <div className="grid gap-6 xl:grid-cols-2">
          <ChannelTable rows={data.channels} />
          <CohortTable rows={data.cohorts} />
        </div>
      </div>
    </TooltipProvider>
  );
}
