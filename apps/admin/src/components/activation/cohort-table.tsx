"use client";

import type { ActivationCohortRow } from "@budget/shared-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InfoHint, SMALL_SAMPLE, pct } from "./stat";

export function CohortTable({ rows }: { rows: ActivationCohortRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          Activation by signup week
          <InfoHint text="Each row is the week users signed up. Read top to bottom to see whether onboarding changes moved activation. The 7-day rate counts only members at least a week old. Rows under 5 users are dimmed. Week-by-week retention per cohort is on Investor Metrics." />
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Signup week</TableHead>
              <TableHead>Signups</TableHead>
              <TableHead>Within 24 h</TableHead>
              <TableHead>Within 7 days</TableHead>
              <TableHead>Ever</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...rows].reverse().map((r) => (
              <TableRow key={r.cohortWeekStart} className={r.size < SMALL_SAMPLE ? "opacity-50" : ""}>
                <TableCell>{r.cohortWeekStart}</TableCell>
                <TableCell>{r.size}</TableCell>
                <TableCell>{pct(r.activatedD1, r.size)}</TableCell>
                <TableCell>{r.d7Eligible > 0 ? pct(r.activatedD7, r.d7Eligible) : "—"}</TableCell>
                <TableCell>{pct(r.activated, r.size)}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                  No signups in this window
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
