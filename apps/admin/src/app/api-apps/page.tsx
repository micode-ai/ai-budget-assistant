"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { useApiApps, useUpdateApiApp } from "@/hooks/use-api-apps";
import { ApiAppsTable } from "@/components/api-apps/ApiAppsTable";
import { BlockAppDialog } from "@/components/api-apps/BlockAppDialog";
import type { AdminOAuthClient, UpdateAdminOAuthClientDto } from "@budget/shared-types";

export default function ApiAppsPage() {
  const { data: apps = [], isLoading } = useApiApps();
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
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : apps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No apps registered yet.</p>
          ) : (
            <ApiAppsTable apps={apps} onPatch={patch} onBlock={setBlocking} />
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
