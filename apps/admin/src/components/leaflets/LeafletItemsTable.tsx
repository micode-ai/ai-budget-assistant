"use client";

import { useState } from "react";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { leafletErrorMessage, useDeleteLeafletItem, useUpdateLeafletItem } from "@/hooks/use-leaflets";
import type { AdminLeafletItem } from "@budget/shared-types";

type Draft = { name: string; canonicalName: string; promoPrice: string; regularPrice: string; condition: string };

function toDraft(i: AdminLeafletItem): Draft {
  return {
    name: i.name,
    canonicalName: i.canonicalName,
    promoPrice: String(i.promoPrice),
    regularPrice: i.regularPrice == null ? "" : String(i.regularPrice),
    condition: i.condition ?? "",
  };
}

export function LeafletItemsTable({
  leafletId,
  items,
  readOnly,
}: {
  leafletId: string;
  items: AdminLeafletItem[];
  readOnly: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const update = useUpdateLeafletItem();
  const remove = useDeleteLeafletItem();

  const startEdit = (i: AdminLeafletItem) => {
    setEditingId(i.id);
    setDraft(toDraft(i));
  };

  const save = async (i: AdminLeafletItem) => {
    if (!draft) return;
    const promoPrice = Number(draft.promoPrice.replace(",", "."));
    const regularPrice = draft.regularPrice.trim() === "" ? null : Number(draft.regularPrice.replace(",", "."));
    if (!Number.isFinite(promoPrice) || promoPrice <= 0 || (regularPrice !== null && !Number.isFinite(regularPrice))) {
      toast.error("Enter valid prices.");
      return;
    }
    if (!draft.name.trim() || !draft.canonicalName.trim()) {
      toast.error("Name and canonical name are required.");
      return;
    }
    try {
      await update.mutateAsync({
        id: leafletId,
        itemId: i.id,
        dto: {
          name: draft.name.trim(),
          canonicalName: draft.canonicalName.trim(),
          promoPrice,
          regularPrice,
          condition: draft.condition.trim() === "" ? null : draft.condition.trim(),
        },
      });
      setEditingId(null);
      setDraft(null);
    } catch (err) {
      toast.error(await leafletErrorMessage(err));
    }
  };

  const del = async (i: AdminLeafletItem) => {
    try {
      await remove.mutateAsync({ id: leafletId, itemId: i.id });
    } catch (err) {
      toast.error(await leafletErrorMessage(err));
    }
  };

  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((d) => (d ? { ...d, [k]: e.target.value } : d));

  if (items.length === 0) return <p className="text-sm text-muted-foreground">No offers were extracted.</p>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Pg</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Canonical</TableHead>
          <TableHead>Promo</TableHead>
          <TableHead>Regular</TableHead>
          <TableHead>Condition</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((i) => {
          const editing = editingId === i.id && draft;
          return (
            <TableRow key={i.id}>
              <TableCell>{i.page}</TableCell>
              {editing ? (
                <>
                  <TableCell><Input value={draft.name} onChange={set("name")} /></TableCell>
                  <TableCell><Input value={draft.canonicalName} onChange={set("canonicalName")} /></TableCell>
                  <TableCell><Input className="w-24" value={draft.promoPrice} onChange={set("promoPrice")} /></TableCell>
                  <TableCell><Input className="w-24" value={draft.regularPrice} onChange={set("regularPrice")} /></TableCell>
                  <TableCell><Input value={draft.condition} onChange={set("condition")} /></TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button size="icon" variant="ghost" aria-label="Save item" disabled={update.isPending} onClick={() => save(i)}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Cancel edit"
                      onClick={() => {
                        setEditingId(null);
                        setDraft(null);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </>
              ) : (
                <>
                  <TableCell>{i.name}</TableCell>
                  <TableCell>{i.canonicalName}</TableCell>
                  <TableCell>{i.promoPrice} {i.currencyCode}</TableCell>
                  <TableCell>{i.regularPrice ?? "-"}</TableCell>
                  <TableCell>{i.condition ?? "-"}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button size="icon" variant="ghost" aria-label="Edit item" disabled={readOnly} onClick={() => startEdit(i)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Delete item"
                      disabled={readOnly || remove.isPending}
                      onClick={() => del(i)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
