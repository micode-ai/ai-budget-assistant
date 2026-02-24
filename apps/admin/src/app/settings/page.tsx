"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SystemHealth } from "@/types";
import { Activity, Database, Server, Wifi } from "lucide-react";

export default function SettingsPage() {
  const { data: health, isLoading } = useQuery<SystemHealth>({
    queryKey: ["admin", "system", "health"],
    queryFn: () => api.get("admin/system/health").json(),
    refetchInterval: 30000,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* System Health */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">System Health</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : health ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <HealthItem
                icon={Server}
                label="API"
                status={health.api}
              />
              <HealthItem
                icon={Database}
                label="Database"
                status={health.database}
              />
              <HealthItem
                icon={Wifi}
                label="Redis"
                status={health.redis}
              />
              <div className="flex items-center gap-3 rounded-lg border p-4">
                <Activity className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Uptime</p>
                  <p className="text-sm text-muted-foreground">
                    {Math.floor(health.uptime / 3600)}h {Math.floor((health.uptime % 3600) / 60)}m
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">Unable to fetch health status</p>
          )}
          {health && (
            <p className="text-sm text-muted-foreground mt-4">
              Memory usage: {health.memoryUsage} MB
            </p>
          )}
        </CardContent>
      </Card>

      {/* AI Cost Rates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Cost Rates (per request)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 max-w-md">
            {[
              { feature: "voice", cost: 0.02, desc: "Whisper-1 transcription" },
              { feature: "chat", cost: 0.011, desc: "GPT-4 Turbo chat" },
              { feature: "parse", cost: 0.008, desc: "GPT-4 Turbo parsing" },
              { feature: "categorization", cost: 0.005, desc: "GPT-4 Turbo categorization" },
              { feature: "ocr", cost: 0.012, desc: "GPT-4o Vision OCR" },
            ].map((rate) => (
              <div key={rate.feature} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium capitalize">{rate.feature}</p>
                  <p className="text-xs text-muted-foreground">{rate.desc}</p>
                </div>
                <span className="font-mono text-sm font-medium">${rate.cost}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Admin Access</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Admin access is controlled via the <code className="text-xs bg-muted px-1 py-0.5 rounded">ADMIN_EMAILS</code> environment
            variable on the API server. Contact the system administrator to add or remove admin users.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function HealthItem({
  icon: Icon,
  label,
  status,
}: {
  icon: typeof Server;
  label: string;
  status: "ok" | "error";
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-4">
      <Icon className="h-5 w-5 text-muted-foreground" />
      <div className="flex-1">
        <p className="text-sm font-medium">{label}</p>
      </div>
      <Badge variant={status === "ok" ? "default" : "destructive"}>
        {status}
      </Badge>
    </div>
  );
}
