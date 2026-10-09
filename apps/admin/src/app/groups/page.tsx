"use client";

import { useState } from "react";
import { useGroupMetrics } from "@/hooks/use-group-metrics";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/common/loading-skeleton";
import { GroupKpiCards } from "@/components/groups/GroupKpiCards";
import { GroupDailyChart } from "@/components/groups/GroupDailyChart";

const WINDOWS = [7, 30, 90] as const;

export default function GroupsPage() {
  const [days, setDays] = useState<number>(30);
  const { data, isLoading } = useGroupMetrics(days);

  if (isLoading || !data) return <PageSkeleton />;

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Shared Groups</h1>
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

      <GroupKpiCards totals={data.totals} windowDays={data.windowDays} />

      <p className="text-xs text-muted-foreground">
        Totals are all-time except active groups. Join provenance (guest, linked, joined via
        link) is recorded only from 2026-10-09; members who joined earlier count in Members but
        in no provenance figure.
      </p>

      <GroupDailyChart data={data.daily} windowDays={data.windowDays} />
    </div>
  );
}
