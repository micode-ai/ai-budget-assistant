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
import type { AiUsageTrend } from "@/types";

interface AiCostChartProps {
  data: AiUsageTrend[];
}

export function AiCostChart({ data }: AiCostChartProps) {
  const formatted = data.map((d) => ({
    date: d.date.slice(5),
    cost: d.totalCost,
    requests: d.totalRequests,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">AI Cost Trend</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={formatted}>
              <defs>
                <linearGradient id="aiGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                formatter={(value) => [`$${Number(value).toFixed(4)}`, "Cost"]}
              />
              <Area
                type="monotone"
                dataKey="cost"
                stroke="#8b5cf6"
                fill="url(#aiGrad)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
