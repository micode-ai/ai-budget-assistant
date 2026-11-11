"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  leafletErrorMessage,
  useLeaflet,
  useLeafletRecipients,
  usePublishLeaflet,
  useUnpublishLeaflet,
  useUpdateLeaflet,
} from "@/hooks/use-leaflets";
import { LeafletItemsTable } from "./LeafletItemsTable";
import { leafletState } from "./leaflet-state";

export function LeafletDetail({ id }: { id: string }) {
  const { data: leaflet, isLoading, isError } = useLeaflet(id);
  const update = useUpdateLeaflet();
  const publish = usePublishLeaflet();
  const unpublish = useUnpublishLeaflet();

  // Unsaved edits overlay the server copy; cleared on save. The parent keys this component by id.
  const [edits, setEdits] = useState<{ chain?: string; validFrom?: string; validTo?: string }>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const recipients = useLeafletRecipients(id, confirmOpen);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  if (isError || !leaflet) return <p className="text-sm text-destructive">Could not load this leaflet.</p>;

  const state = leafletState(leaflet);
  const live = state === "live";
  const chain = edits.chain ?? leaflet.chain ?? "";
  const validFrom = edits.validFrom ?? leaflet.validFrom ?? "";
  const validTo = edits.validTo ?? leaflet.validTo ?? "";
  const dirty = Object.keys(edits).length > 0;
  const setChain = (v: string) => setEdits((e) => ({ ...e, chain: v }));
  const setValidFrom = (v: string) => setEdits((e) => ({ ...e, validFrom: v }));
  const setValidTo = (v: string) => setEdits((e) => ({ ...e, validTo: v }));

  const run = async (fn: () => Promise<unknown>, success: string) => {
    try {
      await fn();
      if (success) toast.success(success);
    } catch (err) {
      toast.error(await leafletErrorMessage(err));
    }
  };

  const save = () =>
    run(async () => {
      await update.mutateAsync({
        id,
        dto: { chain: chain.trim(), validFrom: validFrom || null, validTo: validTo || null },
      });
      setEdits({});
    }, "Saved");

  const doPublish = async () => {
    try {
      const res = await publish.mutateAsync(id);
      toast.success(`Published. ${res.promosWritten} promo${res.promosWritten === 1 ? "" : "s"} written.`);
      setConfirmOpen(false);
    } catch (err) {
      toast.error(await leafletErrorMessage(err));
      setConfirmOpen(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{leaflet.chain ?? "Leaflet"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {state === "reading" && (
          <p className="text-sm text-muted-foreground">
            Reading the leaflet... {leaflet.pagesRead} page{leaflet.pagesRead === 1 ? "" : "s"} done, {leaflet.itemCount}{" "}
            offers found so far. This updates every 2 seconds.
          </p>
        )}
        {state === "failed" && (
          <p className="text-sm text-destructive">
            The read failed or timed out. Upload the leaflet again; a failed leaflet cannot be published.
          </p>
        )}
        {live && (
          <p className="rounded-md bg-muted p-3 text-sm">
            This leaflet is published, so it is read-only. To correct it: Unpublish, edit, then Publish again
            (publishing replaces this leaflet&apos;s promos).
          </p>
        )}
        {leaflet.pagesUnreadable + leaflet.pagesDropped > 0 && state !== "reading" && (
          <p className="text-sm text-muted-foreground">
            {leaflet.pagesUnreadable} unreadable and {leaflet.pagesDropped} dropped page(s) were skipped.
          </p>
        )}

        {state !== "reading" && state !== "failed" && (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor="leaflet-chain">Chain</Label>
                <Input id="leaflet-chain" value={chain} disabled={live} onChange={(e) => setChain(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="leaflet-from">Valid from</Label>
                <Input
                  id="leaflet-from"
                  type="date"
                  value={validFrom}
                  disabled={live}
                  onChange={(e) => setValidFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="leaflet-to">Valid to</Label>
                <Input
                  id="leaflet-to"
                  type="date"
                  value={validTo}
                  disabled={live}
                  onChange={(e) => setValidTo(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button variant="outline" disabled={live || !dirty || update.isPending} onClick={save}>
                  Save details
                </Button>
              </div>
            </div>

            <LeafletItemsTable leafletId={id} items={leaflet.items} readOnly={live} />

            <div className="flex justify-end gap-2">
              {live ? (
                <Button
                  variant="outline"
                  disabled={unpublish.isPending}
                  onClick={() => run(() => unpublish.mutateAsync(id), "Unpublished")}
                >
                  Unpublish
                </Button>
              ) : (
                <Button
                  disabled={dirty || leaflet.items.length === 0 || publish.isPending}
                  title={dirty ? "Save the details first" : undefined}
                  onClick={() => setConfirmOpen(true)}
                >
                  Publish
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publish this leaflet?</DialogTitle>
            <DialogDescription>
              {leaflet.items.length} offers for {leaflet.chain ?? "this chain"}, {leaflet.validFrom} to{" "}
              {leaflet.validTo}. Admin uploads are confirmed immediately.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            {recipients.isLoading
              ? "Counting recipients..."
              : recipients.isError
                ? "Could not count recipients."
                : `${recipients.data?.users ?? 0} users will be notified (at most one push per user per day).`}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button disabled={publish.isPending} onClick={doPublish}>
              {publish.isPending ? "Publishing..." : "Publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
