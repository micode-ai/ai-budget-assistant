"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/utils";
import {
  useAppVersions,
  useCreateAppVersion,
  useDeleteAppVersion,
} from "@/hooks/use-app-versions";
import type { AppPlatform, AppVersion } from "@budget/shared-types";

const LOCALES = ["en", "de", "es", "fr", "pl", "ru", "ua", "be", "nl"] as const;
type Locale = (typeof LOCALES)[number];

const DEFAULT_STORE_URL: Record<AppPlatform, string> = {
  android: "https://play.google.com/store/apps/details?id=com.budget.assistant",
  ios: "https://apps.apple.com/app/id000000000",
};

type PlatformPanelProps = {
  platform: AppPlatform;
  versions: AppVersion[];
  isLoading: boolean;
  onNew: (platform: AppPlatform) => void;
  onOpen: (v: AppVersion) => void;
  onDelete: (v: AppVersion) => void;
};

function PlatformPanel({ platform, versions, isLoading, onNew, onOpen, onDelete }: PlatformPanelProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="capitalize">{platform}</CardTitle>
        <Button
          onClick={() => onNew(platform)}
          size="sm"
        >
          <Plus className="h-4 w-4 mr-1" /> New release
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No releases yet.</p>
        ) : (
          <ul className="space-y-2">
            {versions.map((v, idx) => (
              <li
                key={v.id}
                className="flex items-start justify-between rounded-md border p-3"
              >
                <button
                  type="button"
                  onClick={() => onOpen(v)}
                  className="flex-1 space-y-1 text-left hover:opacity-80"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{v.latestVersion}</span>
                    <span className="text-xs text-muted-foreground">
                      min: {v.minSupportedVersion}
                    </span>
                    {idx === 0 && <Badge>Current</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDateTime(v.publishedAt)}
                  </div>
                  {v.releaseNotes?.en && (
                    <p className="text-sm mt-1 max-w-2xl truncate">
                      {v.releaseNotes.en}
                    </p>
                  )}
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(v)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function AppVersionsPage() {
  const { data: versions = [], isLoading } = useAppVersions();
  const createMutation = useCreateAppVersion();
  const deleteMutation = useDeleteAppVersion();

  const [activePlatform, setActivePlatform] = useState<AppPlatform>("android");
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AppVersion | null>(null);
  const [detailVersion, setDetailVersion] = useState<AppVersion | null>(null);

  // Form state
  const [latestVersion, setLatestVersion] = useState("");
  const [minSupportedVersion, setMinSupportedVersion] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [releaseNotes, setReleaseNotes] = useState<Record<Locale, string>>(
    () => Object.fromEntries(LOCALES.map((l) => [l, ""])) as Record<Locale, string>,
  );

  function openNewDialog(platform: AppPlatform) {
    setActivePlatform(platform);
    setLatestVersion("");
    setMinSupportedVersion("");
    setStoreUrl(DEFAULT_STORE_URL[platform]);
    setReleaseNotes(Object.fromEntries(LOCALES.map((l) => [l, ""])) as Record<Locale, string>);
    setShowNewDialog(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedNotes: Record<string, string> = {};
    for (const l of LOCALES) {
      const v = releaseNotes[l].trim();
      if (v) trimmedNotes[l] = v;
    }
    try {
      await createMutation.mutateAsync({
        platform: activePlatform,
        latestVersion: latestVersion.trim(),
        minSupportedVersion: minSupportedVersion.trim(),
        storeUrl: storeUrl.trim(),
        releaseNotes: Object.keys(trimmedNotes).length > 0 ? trimmedNotes : undefined,
      });
      toast.success("Release published");
      setShowNewDialog(false);
    } catch (err: unknown) {
      const anyErr = err as { response?: { json: () => Promise<{ message?: string }> }; message?: string };
      let jsonMsg: string | undefined;
      if (anyErr?.response) {
        try {
          const body = await anyErr.response.json();
          jsonMsg = typeof body?.message === "string" ? body.message : undefined;
        } catch {
          // body not parseable — fall through
        }
      }
      toast.error(jsonMsg || anyErr?.message || "Failed to publish release");
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteMutation.mutateAsync(confirmDelete.id);
      toast.success("Release deleted");
      setConfirmDelete(null);
    } catch (err: unknown) {
      const anyErr = err as { message?: string };
      toast.error(anyErr?.message || "Failed to delete release");
    }
  }

  const filtered = (platform: AppPlatform) =>
    versions
      .filter((v) => v.platform === platform)
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">App Versions</h1>
        <p className="text-muted-foreground text-sm">
          Publish a row after each Play / App Store release. Mobile clients
          below <code>latestVersion</code> see an update prompt; below{" "}
          <code>minSupportedVersion</code> see a forced update.
        </p>
      </div>

      <Tabs
        value={activePlatform}
        onValueChange={(v) => setActivePlatform(v as AppPlatform)}
      >
        <TabsList>
          <TabsTrigger value="android">Android</TabsTrigger>
          <TabsTrigger value="ios">iOS</TabsTrigger>
        </TabsList>
        <TabsContent value="android" className="mt-4">
          <PlatformPanel
            platform="android"
            versions={filtered("android")}
            isLoading={isLoading}
            onNew={(p) => openNewDialog(p)}
            onOpen={(v) => setDetailVersion(v)}
            onDelete={(v) => setConfirmDelete(v)}
          />
        </TabsContent>
        <TabsContent value="ios" className="mt-4">
          <PlatformPanel
            platform="ios"
            versions={filtered("ios")}
            isLoading={isLoading}
            onNew={(p) => openNewDialog(p)}
            onOpen={(v) => setDetailVersion(v)}
            onDelete={(v) => setConfirmDelete(v)}
          />
        </TabsContent>
      </Tabs>

      {/* New release dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New {activePlatform} release</DialogTitle>
            <DialogDescription>
              Provide the version published to the store. EN release notes are
              required; other locales are optional.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="latestVersion">Latest version</Label>
                <Input
                  id="latestVersion"
                  required
                  pattern="^\d+\.\d+\.\d+$"
                  placeholder="1.2.0"
                  value={latestVersion}
                  onChange={(e) => setLatestVersion(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="minSupportedVersion">Min supported</Label>
                <Input
                  id="minSupportedVersion"
                  required
                  pattern="^\d+\.\d+\.\d+$"
                  placeholder="1.0.0"
                  value={minSupportedVersion}
                  onChange={(e) => setMinSupportedVersion(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="storeUrl">Store URL</Label>
              <Input
                id="storeUrl"
                required
                value={storeUrl}
                onChange={(e) => setStoreUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Release notes</Label>
              {LOCALES.map((l) => (
                <div key={l} className="space-y-1">
                  <Label
                    htmlFor={`notes-${l}`}
                    className="text-xs uppercase text-muted-foreground"
                  >
                    {l}
                    {l === "en" ? " (required)" : ""}
                  </Label>
                  <Textarea
                    id={`notes-${l}`}
                    required={l === "en"}
                    rows={2}
                    value={releaseNotes[l]}
                    onChange={(e) =>
                      setReleaseNotes((prev) => ({ ...prev, [l]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowNewDialog(false)}
                disabled={createMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Publishing…" : "Publish"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Version detail dialog */}
      <Dialog
        open={!!detailVersion}
        onOpenChange={(open) => !open && setDetailVersion(null)}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detailVersion && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="capitalize">{detailVersion.platform}</span>
                  <span>{detailVersion.latestVersion}</span>
                </DialogTitle>
                <DialogDescription>
                  Published {formatDateTime(detailVersion.publishedAt)}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs uppercase text-muted-foreground">
                      Latest version
                    </Label>
                    <p>{detailVersion.latestVersion}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs uppercase text-muted-foreground">
                      Min supported
                    </Label>
                    <p>{detailVersion.minSupportedVersion}</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs uppercase text-muted-foreground">
                    Store URL
                  </Label>
                  <a
                    href={detailVersion.storeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block break-all text-primary hover:underline"
                  >
                    {detailVersion.storeUrl}
                  </a>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs uppercase text-muted-foreground">
                    Release notes
                  </Label>
                  {LOCALES.some((l) => detailVersion.releaseNotes?.[l]) ? (
                    <div className="space-y-2">
                      {LOCALES.filter((l) => detailVersion.releaseNotes?.[l]).map(
                        (l) => (
                          <div key={l} className="rounded-md border p-2">
                            <div className="text-xs uppercase text-muted-foreground">
                              {l}
                            </div>
                            <p className="whitespace-pre-wrap">
                              {detailVersion.releaseNotes?.[l]}
                            </p>
                          </div>
                        ),
                      )}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">No release notes.</p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDetailVersion(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete release?</DialogTitle>
            <DialogDescription>
              {confirmDelete &&
                `This will permanently delete the ${confirmDelete.platform} ${confirmDelete.latestVersion} record. The previous row (if any) becomes the current latest.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmDelete(null)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
