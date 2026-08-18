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
import { useSendEmail } from "@/hooks/use-communications";
import { Mail } from "lucide-react";
import { toast } from "sonner";

export function SendEmailDialog({ userId, userName }: { userId: string; userName: string }) {
  const [open, setOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailHtml, setEmailHtml] = useState("");
  const sendEmail = useSendEmail();

  const handleSendEmail = () => {
    sendEmail.mutate(
      { userIds: [userId], subject: emailSubject, html: emailHtml },
      {
        onSuccess: () => {
          toast.success("Email sent");
          setOpen(false);
          setEmailSubject("");
          setEmailHtml("");
        },
        onError: () => toast.error("Failed to send email"),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <Mail className="h-4 w-4 mr-2" />
          Send Email
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Email to {userName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label>Subject</Label>
            <Input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder="Email subject" />
          </div>
          <div className="space-y-1">
            <Label>Body</Label>
            <Textarea value={emailHtml} onChange={(e) => setEmailHtml(e.target.value)} placeholder="Email body (HTML supported)" rows={6} />
          </div>
          <Button onClick={handleSendEmail} disabled={!emailSubject || !emailHtml || sendEmail.isPending} className="w-full">
            {sendEmail.isPending ? "Sending..." : "Send Email"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
