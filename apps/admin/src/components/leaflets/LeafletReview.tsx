"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { useLeaflets } from "@/hooks/use-leaflets";
import { LeafletDetail } from "./LeafletDetail";
import { leafletState, type LeafletState } from "./leaflet-state";

const STATE_LABEL: Record<LeafletState, string> = {
  reading: "Reading",
  failed: "Failed",
  draft: "Ready to review",
  live: "Published",
  unpublished: "Unpublished",
};

const STATE_VARIANT: Record<LeafletState, "default" | "secondary" | "destructive" | "outline"> = {
  reading: "secondary",
  failed: "destructive",
  draft: "outline",
  live: "default",
  unpublished: "secondary",
};

export function LeafletReview({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { data, isLoading, isError } = useLeaflets();

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Leaflets</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : isError ? (
            <p className="text-sm text-destructive">Could not load leaflets.</p>
          ) : !data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No leaflets yet. Upload one above.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Chain</TableHead>
                  <TableHead>Valid</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Pages</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((l) => {
                  const state = leafletState(l);
                  return (
                    <TableRow key={l.id} data-state={l.id === selectedId ? "selected" : undefined}>
                      <TableCell>{l.chain ?? "-"}</TableCell>
                      <TableCell>
                        {l.validFrom && l.validTo ? `${l.validFrom} to ${l.validTo}` : "-"}
                      </TableCell>
                      <TableCell>{l.itemCount}</TableCell>
                      <TableCell>
                        {l.pagesRead}
                        {l.pagesUnreadable + l.pagesDropped > 0 && (
                          <span className="text-muted-foreground">
                            {" "}
                            ({l.pagesUnreadable + l.pagesDropped} skipped)
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATE_VARIANT[state]}>{STATE_LABEL[state]}</Badge>
                      </TableCell>
                      <TableCell>{formatDateTime(l.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant={l.id === selectedId ? "secondary" : "outline"}
                          onClick={() => onSelect(l.id === selectedId ? null : l.id)}
                        >
                          {l.id === selectedId ? "Close" : state === "draft" ? "Review" : "Open"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {selectedId && <LeafletDetail key={selectedId} id={selectedId} />}
    </>
  );
}
