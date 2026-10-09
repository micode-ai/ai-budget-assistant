"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AdminGroupMetricsResponse } from "@budget/shared-types";

type Totals = AdminGroupMetricsResponse["totals"];

/** Guests who later created or linked an account, as a share of all guest members. */
export function guestConversion(totals: Totals): string {
  if (totals.guestMembers === 0) return "—";
  return `${((totals.guestsLinked / totals.guestMembers) * 100).toFixed(1)}%`;
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

export function GroupKpiCards({ totals, windowDays }: { totals: Totals; windowDays: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <Kpi label="Groups created" value={String(totals.groupsCreated)} sub="all time" />
      <Kpi
        label={`Active groups (${windowDays}d)`}
        value={String(totals.activeGroups)}
        sub="non-archived, with an expense or settlement in the window"
      />
      <Kpi label="Archived groups" value={String(totals.archivedGroups)} sub="all time" />
      <Kpi label="Members" value={String(totals.membersTotal)} sub="current, all groups" />
      <Kpi label="Guest members" value={String(totals.guestMembers)} sub="joined from the guest link" />
      <Kpi label="Guests linked" value={String(totals.guestsLinked)} sub="guest seat linked to an account" />
      <Kpi
        label="Guest → account conversion"
        value={guestConversion(totals)}
        sub="guests linked / guest members"
      />
      <Kpi
        label="App users joined via link"
        value={String(totals.appUsersJoinedViaLink)}
        sub="existing users who opened an invite"
      />
    </div>
  );
}
