"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useScheduledNotifications,
  useCancelScheduledNotification,
} from "@/hooks/use-communications";
import { formatDateTime } from "@/lib/utils";
import { toast } from "sonner";
import { X } from "lucide-react";

export function ScheduledTab() {
  const { data: scheduled, isLoading } = useScheduledNotifications();
  const cancelMutation = useCancelScheduledNotification();

  if (isLoading) return <p className="text-muted-foreground py-4">Loading...</p>;

  return (
    <Card>
      <CardContent className="pt-6">
        {(!scheduled || scheduled.length === 0) ? (
          <p className="text-center text-muted-foreground py-8">No scheduled notifications</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Title/Subject</TableHead>
                <TableHead>Scheduled For</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scheduled.map((n) => (
                <TableRow key={n.id}>
                  <TableCell><Badge variant="outline">{n.type}</Badge></TableCell>
                  <TableCell>{n.title || n.subject || "—"}</TableCell>
                  <TableCell>{formatDateTime(n.scheduledAt)}</TableCell>
                  <TableCell><Badge>{n.status}</Badge></TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        cancelMutation.mutate(n.id, {
                          onSuccess: () => toast.success("Cancelled"),
                        })
                      }
                      disabled={cancelMutation.isPending}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
