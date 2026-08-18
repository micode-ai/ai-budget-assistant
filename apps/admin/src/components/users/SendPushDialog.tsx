"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useSendPush } from "@/hooks/use-communications";
import { Bell } from "lucide-react";
import { toast } from "sonner";

export function SendPushDialog({
  userId,
  userName,
  disabled,
}: {
  userId: string;
  userName: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const sendPush = useSendPush();

  const handleSendPush = () => {
    sendPush.mutate(
      { userIds: [userId], title: pushTitle, body: pushBody },
      {
        onSuccess: () => {
          toast.success("Push notification sent");
          setOpen(false);
          setPushTitle("");
          setPushBody("");
        },
        onError: () => toast.error("Failed to send push"),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full" disabled={disabled}>
          <Bell className="h-4 w-4 mr-2" />
          Send Push Notification
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Push to {userName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>Title</Label>
            <Input value={pushTitle} onChange={(e) => setPushTitle(e.target.value)} placeholder="Notification title" />
          </div>
          <div className="space-y-1">
            <Label>Body</Label>
            <Textarea value={pushBody} onChange={(e) => setPushBody(e.target.value)} placeholder="Notification body" rows={4} />
          </div>
          <Button onClick={handleSendPush} disabled={!pushTitle || !pushBody || sendPush.isPending} className="w-full">
            {sendPush.isPending ? "Sending..." : "Send Push"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
