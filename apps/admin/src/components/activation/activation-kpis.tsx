"use client";

import type { ActivationSummary } from "@budget/shared-types";
import { Stat, pct } from "./stat";

function duration(h: number | null): string {
  if (h == null) return "—";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

export function ActivationKpis({ s }: { s: ActivationSummary }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
      <Stat label="Signups" value={String(s.signups)} hint="Users who registered in the selected weeks." />
      <Stat
        label="Activated (ever)"
        value={pct(s.activated, s.signups)}
        sub={`${s.activated} of ${s.signups}`}
        hint="Logged at least one expense or income, ever. Deleted transactions do not count."
      />
      <Stat
        label="Activated in 24 h"
        value={pct(s.activatedD1, s.d1Eligible)}
        sub={`${s.activatedD1} of ${s.d1Eligible} old enough`}
        hint="First transaction within 24 hours of signing up, over signups at least a day old."
      />
      <Stat
        label="Activated in 7 days"
        value={pct(s.activatedD7, s.d7Eligible)}
        sub={`${s.activatedD7} of ${s.d7Eligible} old enough`}
        hint="First transaction within 7 days of signing up, over signups at least a week old."
      />
      <Stat
        label="Median time to first"
        value={duration(s.medianHoursToFirst)}
        hint="Median time from signup to the first transaction, over activated users."
      />
      <Stat
        label="Never activated"
        value={String(s.neverActivated)}
        sub={`${s.neverReturned} never came back after day 1`}
        hint="Signed up but never logged a transaction. Never came back = not seen more than 24 h after signup (Last Active), among signups at least a day old: they left on day one, before trying anything. The rest returned at least once and still logged nothing."
      />
    </div>
  );
}
