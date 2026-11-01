"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function BlockAppDialog({
  appName,
  open,
  pending,
  onClose,
  onConfirm,
}: {
  appName: string;
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Block {appName}</DialogTitle>
          <DialogDescription>
            Every request from this app is refused immediately. Existing grants are kept, so
            unblocking restores access.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={reason}
          maxLength={300}
          placeholder="Reason (required, max 300 characters)"
          onChange={(e) => setReason(e.target.value)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!trimmed || pending}
            onClick={() => {
              onConfirm(trimmed);
              setReason("");
            }}
          >
            Block
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
