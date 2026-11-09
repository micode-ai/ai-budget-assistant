"use client";

import type { ActivationChannelRow } from "@budget/shared-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InfoHint, SMALL_SAMPLE, pct } from "./stat";

const LABELS: Record<string, string> = {
  manual: "Manual entry",
  ocr: "Receipt scan",
  voice: "Voice",
  import: "Bank import",
  notification: "Bank notification",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  slack: "Slack",
};

export function ChannelTable({ rows }: { rows: ActivationChannelRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          First transaction channel
          <InfoHint text="How each activated user entered their very first transaction, and how those users behaved afterwards. It shows correlation, not cause: people who start with a receipt scan may simply be more committed. Rows under 5 users are dimmed." />
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Channel</TableHead>
              <TableHead>Users</TableHead>
              <TableHead>Within 24 h</TableHead>
              <TableHead>Avg active weeks</TableHead>
              <TableHead>Active in W4</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.source} className={r.users < SMALL_SAMPLE ? "opacity-50" : ""}>
                <TableCell>{LABELS[r.source] ?? r.source}</TableCell>
                <TableCell>{r.users}</TableCell>
                <TableCell>{pct(r.activatedD1, r.users)}</TableCell>
                <TableCell>{r.avgActiveWeeks}</TableCell>
                <TableCell>
                  {pct(r.w4Retained, r.w4Eligible)}
                  <span className="text-muted-foreground text-xs"> ({r.w4Retained}/{r.w4Eligible})</span>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                  No activated users in this window
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
