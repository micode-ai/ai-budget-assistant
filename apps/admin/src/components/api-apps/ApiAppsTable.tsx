"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import type { AdminOAuthClient, UpdateAdminOAuthClientDto } from "@budget/shared-types";
import { LimitInput } from "./LimitInput";

export function ApiAppsTable({
  apps,
  onPatch,
  onBlock,
}: {
  apps: AdminOAuthClient[];
  onPatch: (id: string, dto: UpdateAdminOAuthClientDto) => void;
  onBlock: (app: AdminOAuthClient) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>App</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="text-right">Grants</TableHead>
          <TableHead className="text-right">Req/min</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Verified</TableHead>
          <TableHead>Per grant / min</TableHead>
          <TableHead>Per app / min</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {apps.map((a) => (
          <TableRow key={a.id} className={a.isDeleted ? "opacity-60" : undefined}>
            <TableCell>
              <div className="font-medium">{a.name}</div>
              <div className="text-xs text-muted-foreground">{a.homepageUrl}</div>
            </TableCell>
            <TableCell>
              <Link href={`/users/${a.ownerId}`} className="hover:underline">
                {a.ownerName}
              </Link>
              <div className="text-xs text-muted-foreground">{a.ownerEmail}</div>
            </TableCell>
            <TableCell className="text-muted-foreground">{formatDateTime(a.createdAt)}</TableCell>
            <TableCell className="text-right">{a.activeGrants}</TableCell>
            <TableCell className="text-right">{a.requestsLastMinute}</TableCell>
            <TableCell>
              {a.isDeleted ? (
                <Badge variant="outline">deleted</Badge>
              ) : a.status === "blocked" ? (
                <Badge variant="destructive">blocked</Badge>
              ) : (
                <Badge>active</Badge>
              )}
              {!a.isDeleted && a.status === "blocked" && a.blockedReason && (
                <div className="mt-1 max-w-48 truncate text-xs text-muted-foreground" title={a.blockedReason}>
                  {a.blockedReason}
                </div>
              )}
            </TableCell>
            <TableCell>
              <Switch
                aria-label={`Verified ${a.name}`}
                checked={a.isVerified}
                disabled={a.isDeleted}
                onCheckedChange={(v) => onPatch(a.id, { isVerified: v })}
              />
            </TableCell>
            <TableCell>
              {a.isDeleted ? (
                "-"
              ) : (
                <LimitInput
                  key={`g-${a.id}-${a.rateLimitPerGrant}`}
                  label="Rate limit per grant"
                  value={a.rateLimitPerGrant}
                  onSave={(v) => onPatch(a.id, { rateLimitPerGrant: v })}
                />
              )}
            </TableCell>
            <TableCell>
              {a.isDeleted ? (
                "-"
              ) : (
                <LimitInput
                  key={`c-${a.id}-${a.rateLimitPerClient}`}
                  label="Rate limit per app"
                  value={a.rateLimitPerClient}
                  onSave={(v) => onPatch(a.id, { rateLimitPerClient: v })}
                />
              )}
            </TableCell>
            <TableCell>
              {!a.isDeleted &&
                (a.status === "blocked" ? (
                  <Button size="sm" variant="outline" onClick={() => onPatch(a.id, { status: "active" })}>
                    Unblock
                  </Button>
                ) : (
                  <Button size="sm" variant="destructive" onClick={() => onBlock(a)}>
                    Block
                  </Button>
                ))}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
