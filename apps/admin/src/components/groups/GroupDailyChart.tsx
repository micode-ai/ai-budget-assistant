"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { AdminGroupMetricsDailyPoint } from "@budget/shared-types";

export function GroupDailyChart({
  data,
  windowDays,
}: {
  data: AdminGroupMetricsDailyPoint[];
  windowDays: number;
}) {
  const formatted = data.map((d) => ({ ...d, date: d.date.slice(5) })); // "MM-DD"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Daily activity ({windowDays} days, UTC)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={formatted}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="groupsCreated" name="Groups created" fill="#3b82f6" />
              <Bar dataKey="guestsJoined" name="Guests joined" fill="#f59e0b" />
              <Bar dataKey="guestsLinked" name="Guests linked" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
