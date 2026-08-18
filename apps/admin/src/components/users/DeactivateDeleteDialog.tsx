"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useDeactivateUser, useDeleteUser } from "@/hooks/use-users";
import { UserX, Trash2 } from "lucide-react";
import { toast } from "sonner";

export function DeactivateDeleteDialog({
  userId,
  userName,
  userEmail,
  isActive,
}: {
  userId: string;
  userName: string;
  userEmail: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const deactivate = useDeactivateUser();
  const deleteUser = useDeleteUser();

  const handleDeactivate = () => {
    if (!confirm("Are you sure you want to deactivate this user?")) return;
    deactivate.mutate(userId, {
      onSuccess: () => toast.success("User deactivated"),
      onError: () => toast.error("Failed to deactivate user"),
    });
  };

  const handleDeleteUser = () => {
    deleteUser.mutate(userId, {
      onSuccess: () => {
        toast.success(`${userName} has been permanently deleted`);
        setDeleteDialogOpen(false);
        router.push("/users");
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to delete user"),
    });
  };

  return (
    <>
      <Button
        variant="destructive"
        className="w-full"
        onClick={handleDeactivate}
        disabled={!isActive || deactivate.isPending}
      >
        <UserX className="h-4 w-4 mr-2" />
        {isActive ? "Deactivate User" : "Already Inactive"}
      </Button>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="destructive" className="w-full">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete User
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permanently Delete User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to permanently delete <strong>{userName}</strong> ({userEmail})?
              This will remove ALL their data including expenses, incomes, budgets, and accounts.
            </p>
            <p className="text-sm font-medium text-destructive">
              This action cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteUser} disabled={deleteUser.isPending}>
                {deleteUser.isPending ? "Deleting..." : "Delete Permanently"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
