"use client";

import type { RetentionCurvePoint } from "@budget/shared-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { InfoHint } from "./stat";

export function RetentionCurve({ curve }: { curve: RetentionCurvePoint[] }) {
  const data = curve
    .filter((p) => p.rate != null)
    .map((p) => ({ week: `W${p.week}`, rate: Math.round((p.rate as number) * 1000) / 10, users: p.users }));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          Retention curve
          <InfoHint text="Share of signups who logged a transaction in their n-th week (W0 = signup week), pooled over every cohort whose week n has fully passed. A curve that flattens instead of falling to zero is the sign of a core of lasting users. Later weeks rest on fewer, older cohorts; hover a point to see how many users it stands on." />
        </CardTitle>
      </CardHeader>
      <CardContent style={{ height: 260 }}>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cohort has finished its first week yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="week" fontSize={12} />
              <YAxis unit="%" domain={[0, 100]} fontSize={12} />
              <Tooltip
                formatter={(v, _name, item) => [`${v}% of ${(item as { payload: { users: number } }).payload.users} users`, "Active"]}
              />
              <Line type="monotone" dataKey="rate" stroke="#3b82f6" strokeWidth={2} dot />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
