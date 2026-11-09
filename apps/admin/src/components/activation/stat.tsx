"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

/** Below this many users a rate is shown dimmed — one person moves it by 20 points or more. */
export const SMALL_SAMPLE = 5;

export function pct(num: number, den: number): string {
  return den > 0 ? `${((num / den) * 100).toFixed(0)}%` : "—";
}

export function InfoHint({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="What is this?"
          className="inline-flex text-muted-foreground/60 hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-snug">{text}</TooltipContent>
    </Tooltip>
  );
}

export function Stat({ label, value, sub, hint }: { label: string; value: string; sub?: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground flex items-center gap-1">
          {label}
          {hint && <InfoHint text={hint} />}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}
