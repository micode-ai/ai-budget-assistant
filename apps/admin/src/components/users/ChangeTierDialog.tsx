"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useChangeSubscriptionTier } from "@/hooks/use-users";
import { Shield } from "lucide-react";
import { toast } from "sonner";

export function ChangeTierDialog({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string>("");
  const changeTier = useChangeSubscriptionTier();

  const handleChangeTier = () => {
    if (!selectedTier) return;
    changeTier.mutate(
      { userId, tier: selectedTier },
      {
        onSuccess: () => {
          toast.success(`Tier changed to ${selectedTier}`);
          setOpen(false);
        },
        onError: () => toast.error("Failed to change tier"),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Shield className="h-3 w-3 mr-1" />
          Change Tier
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Subscription Tier</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <Select value={selectedTier} onValueChange={setSelectedTier}>
            <SelectTrigger>
              <SelectValue placeholder="Select tier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="pro">Pro</SelectItem>
              <SelectItem value="business">Business</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleChangeTier} disabled={!selectedTier || changeTier.isPending} className="w-full">
            {changeTier.isPending ? "Changing..." : "Confirm Change"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
