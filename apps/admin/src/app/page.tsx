"use client";

import { useDashboard, useAnalyticsOverview, useAiUsageTrends } from "@/hooks/use-dashboard";
import { useRealtime } from "@/hooks/use-realtime";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { SubscriptionPieChart } from "@/components/dashboard/subscription-pie-chart";
import { RegistrationsChart } from "@/components/dashboard/registrations-chart";
import { AiCostChart } from "@/components/dashboard/ai-cost-chart";
import { LiveActivityFeed } from "@/components/dashboard/live-activity-feed";
import { PageSkeleton } from "@/components/common/loading-skeleton";

export default function DashboardPage() {
  const { data: dashboard, isLoading: dashLoading } = useDashboard();
  const { data: overview, isLoading: overviewLoading } = useAnalyticsOverview();
  const { data: aiTrends } = useAiUsageTrends();
  const { events } = useRealtime();

  if (dashLoading || overviewLoading) return <PageSkeleton />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <KpiCards
        totalUsers={dashboard?.totalUsers ?? 0}
        activeToday={overview?.activeUsersToday ?? 0}
        totalExpenses={dashboard?.totalExpenses ?? 0}
        mrr={overview?.mrr ?? 0}
        mrrChange={overview?.mrrChange ?? 0}
        aiCost={dashboard?.aiUsage?.totalEstimatedCostUsd ?? 0}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <SubscriptionPieChart
          subscriptions={dashboard?.subscriptions ?? { free: 0, pro: 0, business: 0, trialing: 0 }}
        />
        <LiveActivityFeed events={events} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <RegistrationsChart data={overview?.dailyRegistrations ?? []} />
        <AiCostChart data={aiTrends ?? []} />
      </div>

      {dashboard?.aiUsage?.users && dashboard.aiUsage.users.length > 0 && (
        <div className="rounded-lg border bg-card p-6">
          <h3 className="text-base font-semibold mb-4">Top AI Spenders</h3>
          <div className="space-y-3">
            {dashboard.aiUsage.users.slice(0, 5).map((user) => (
              <div key={user.userId} className="flex items-center justify-between">
                <div>
                  <span className="font-medium">{user.userName}</span>
                  <span className="text-sm text-muted-foreground ml-2">
                    {user.userEmail}
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-mono font-medium">
                    ${user.estimatedCostUsd.toFixed(4)}
                  </span>
                  <span className="text-sm text-muted-foreground ml-2">
                    ({user.requestCount} req)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
