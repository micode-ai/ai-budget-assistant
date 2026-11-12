"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useApiApps, useUpdateApiApp, type ApiAppSourceFilter } from "@/hooks/use-api-apps";
import { ApiAppsTable } from "@/components/api-apps/ApiAppsTable";
import { BlockAppDialog } from "@/components/api-apps/BlockAppDialog";
import type { AdminOAuthClient, UpdateAdminOAuthClientDto } from "@budget/shared-types";

export default function ApiAppsPage() {
  const [source, setSource] = useState<ApiAppSourceFilter>("all");
  const [page, setPage] = useState(1);
  const { data, isLoading } = useApiApps(source, page);
  const apps = data?.items ?? [];
  const update = useUpdateApiApp();
  const [blocking, setBlocking] = useState<AdminOAuthClient | null>(null);

  async function patch(id: string, dto: UpdateAdminOAuthClientDto) {
    try {
      await update.mutateAsync({ id, dto });
      toast.success("Saved");
      setBlocking(null);
    } catch (err: unknown) {
      const anyErr = err as { response?: { json: () => Promise<{ message?: string }> }; message?: string };
      let msg: string | undefined;
      try {
        msg = (await anyErr.response?.json())?.message;
      } catch {
        // body not parseable
      }
      toast.error(msg || anyErr?.message || "Failed to save");
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">API apps</h1>
        <p className="text-muted-foreground text-sm">
          Third-party apps registered for the public API. Blocking takes effect on the next request and
          keeps existing grants. An empty limit means the default.
        </p>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <label htmlFor="api-apps-source" className="text-muted-foreground">Source</label>
        <select
          id="api-apps-source"
          value={source}
          onChange={(e) => {
            setSource(e.target.value as ApiAppSourceFilter);
            setPage(1);
          }}
          className="h-9 rounded-md border bg-background px-2"
        >
          <option value="all">All</option>
          <option value="manual">Registered by a developer</option>
          <option value="mcp_dcr">Registered by an AI assistant</option>
        </select>
      </div>
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : apps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No apps found.</p>
          ) : (
            <ApiAppsTable apps={apps} onPatch={patch} onBlock={setBlocking} />
          )}
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <span className="text-muted-foreground">
                Page {data.page} of {data.totalPages} ({data.total} total)
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= data.totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <BlockAppDialog
        appName={blocking?.name ?? ""}
        open={blocking !== null}
        pending={update.isPending}
        onClose={() => setBlocking(null)}
        onConfirm={(reason) => blocking && patch(blocking.id, { status: "blocked", blockedReason: reason })}
      />
    </div>
  );
}
