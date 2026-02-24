"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface RegistrationsChartProps {
  data: Array<{ date: string; count: number }>;
}

export function RegistrationsChart({ data }: RegistrationsChartProps) {
  const formatted = data.map((d) => ({
    ...d,
    date: d.date.slice(5), // "MM-DD"
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New Registrations (30 days)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={formatted}>
              <defs>
                <linearGradient id="regGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#3b82f6"
                fill="url(#regGrad)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
