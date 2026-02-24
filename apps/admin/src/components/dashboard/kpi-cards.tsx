"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Users,
  Activity,
  DollarSign,
  BrainCircuit,
  Receipt,
} from "lucide-react";
import { formatNumber, formatCurrency, formatPercent } from "@/lib/utils";

interface KpiCardsProps {
  totalUsers: number;
  activeToday: number;
  totalExpenses: number;
  mrr: number;
  mrrChange: number;
  aiCost: number;
}

const cards = [
  {
    key: "totalUsers",
    label: "Total Users",
    icon: Users,
    color: "text-blue-600",
    format: (v: number) => formatNumber(v),
  },
  {
    key: "activeToday",
    label: "Active Today",
    icon: Activity,
    color: "text-green-600",
    format: (v: number) => formatNumber(v),
  },
  {
    key: "totalExpenses",
    label: "Total Expenses",
    icon: Receipt,
    color: "text-orange-600",
    format: (v: number) => formatNumber(v),
  },
  {
    key: "mrr",
    label: "MRR",
    icon: DollarSign,
    color: "text-emerald-600",
    format: (v: number) => formatCurrency(v),
  },
  {
    key: "aiCost",
    label: "AI Cost (Month)",
    icon: BrainCircuit,
    color: "text-purple-600",
    format: (v: number) => formatCurrency(v),
  },
] as const;

export function KpiCards(props: KpiCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      {cards.map((card) => {
        const value = props[card.key as keyof KpiCardsProps] as number;
        return (
          <Card key={card.key}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.label}
              </CardTitle>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.format(value)}</div>
              {card.key === "mrr" && props.mrrChange !== 0 && (
                <p
                  className={`text-xs mt-1 ${
                    props.mrrChange > 0
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {formatPercent(props.mrrChange)} vs last month
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
