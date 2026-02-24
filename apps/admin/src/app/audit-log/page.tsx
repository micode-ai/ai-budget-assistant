"use client";

import { useState } from "react";
import { useAuditLog } from "@/hooks/use-audit-log";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { formatDateTime } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState("");

  const { data, isLoading } = useAuditLog({
    page,
    action: action || undefined,
    targetType: targetType || undefined,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Audit Log</h1>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter by action..."
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select value={targetType} onValueChange={(v) => { setTargetType(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All targets" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All targets</SelectItem>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="subscription">Subscription</SelectItem>
            <SelectItem value="notification">Notification</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Admin</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.data ?? []).map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      <div>
                        <span className="font-medium">{log.adminName}</span>
                        <span className="text-xs text-muted-foreground block">{log.adminEmail}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">{log.action}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs">
                        {log.targetType}
                        {log.targetId && (
                          <span className="text-muted-foreground ml-1 font-mono">
                            {log.targetId.slice(0, 8)}...
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <span className="text-xs text-muted-foreground truncate block">
                        {log.details ? JSON.stringify(log.details).slice(0, 80) : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {log.ipAddress || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDateTime(log.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
                {data?.data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No audit log entries
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {data && data.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <span className="text-sm text-muted-foreground">
                  Page {page} of {data.totalPages} ({data.total} entries)
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= data.totalPages}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
