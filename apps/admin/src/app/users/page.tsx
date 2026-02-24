"use client";

import { useState } from "react";
import Link from "next/link";
import { useUsers } from "@/hooks/use-users";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { TierBadge } from "@/components/common/tier-badge";
import { StatusBadge } from "@/components/common/status-badge";
import { TableSkeleton } from "@/components/common/loading-skeleton";
import { formatDate, formatRelative } from "@/lib/utils";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import type { SubscriptionTier } from "@/types";

export default function UsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tier, setTier] = useState<string>("");
  const [isActive, setIsActive] = useState<string>("");

  const { data, isLoading } = useUsers({
    page,
    search: debouncedSearch,
    tier: tier || undefined,
    isActive: isActive || undefined,
  });

  const handleSearch = (value: string) => {
    setSearch(value);
    const timeout = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Users</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={tier} onValueChange={(v) => { setTier(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All tiers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tiers</SelectItem>
            <SelectItem value="free">Free</SelectItem>
            <SelectItem value="pro">Pro</SelectItem>
            <SelectItem value="business">Business</SelectItem>
          </SelectContent>
        </Select>
        <Select value={isActive} onValueChange={(v) => { setIsActive(v === "all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <TableSkeleton />
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>AI Requests</TableHead>
                  <TableHead>Registered</TableHead>
                  <TableHead>Last Login</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data.map((user) => (
                  <TableRow key={user.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell>
                      <Link href={`/users/${user.id}`} className="font-medium hover:underline">
                        {user.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{user.email}</TableCell>
                    <TableCell>
                      <TierBadge tier={(user.subscription?.tier ?? "free") as SubscriptionTier} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge active={user.isActive} />
                    </TableCell>
                    <TableCell>{user.subscription?.aiRequestsUsed ?? 0}</TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(user.createdAt)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.lastSyncAt ? formatRelative(user.lastSyncAt) : "Never"}
                    </TableCell>
                  </TableRow>
                ))}
                {data?.data.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No users found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, data.total)} of {data.total}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                  disabled={page === data.totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
