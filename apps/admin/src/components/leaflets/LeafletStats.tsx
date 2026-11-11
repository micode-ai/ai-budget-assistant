"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLeafletStats } from "@/hooks/use-leaflets";

export function LeafletStats() {
  const { data, isLoading, isError } = useLeafletStats(30);
  const rows: [string, number | undefined][] = [
    ["Personal leaflets", data?.personalLeaflets],
    ["Shares with a match", data?.sharesWithMatch],
    ["Pages read", data?.pagesRead],
    ["Pages unreadable", data?.pagesUnreadable],
    ["Pages dropped", data?.pagesDropped],
    ["Matches shown", data?.matchesShown],
    ["Added to list", data?.addedToList],
    ["Pushes sent", data?.pushesSent],
    ["Pushes opened", data?.pushesOpened],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Last 30 days</CardTitle>
      </CardHeader>
      <CardContent>
        {isError ? (
          <p className="text-sm text-destructive">Could not load stats.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {rows.map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-semibold">{isLoading ? "-" : (value ?? 0)}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
