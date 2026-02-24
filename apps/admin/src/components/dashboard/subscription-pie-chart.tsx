"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";

interface SubscriptionPieChartProps {
  subscriptions: {
    free: number;
    pro: number;
    business: number;
    trialing: number;
  };
}

const COLORS = ["#94a3b8", "#3b82f6", "#8b5cf6", "#f59e0b"];

export function SubscriptionPieChart({ subscriptions }: SubscriptionPieChartProps) {
  const data = [
    { name: "Free", value: subscriptions.free },
    { name: "Pro", value: subscriptions.pro },
    { name: "Business", value: subscriptions.business },
    { name: "Trialing", value: subscriptions.trialing },
  ].filter((d) => d.value > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Subscription Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
