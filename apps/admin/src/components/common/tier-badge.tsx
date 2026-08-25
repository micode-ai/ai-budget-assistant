import { Badge } from "@/components/ui/badge";
import type { SubscriptionTier } from "@/types";

const tierConfig: Record<SubscriptionTier, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  free: { label: "Free", variant: "secondary" },
  pro: { label: "Pro", variant: "default" },
  business: { label: "Business", variant: "outline" },
};

/**
 * `complimentary` marks a paid tier an admin granted with no payment behind it. It is rendered
 * as a second badge rather than a third tier, because the tier itself is real — what differs is
 * that no money backs it, and every MRR figure excludes these users.
 */
export function TierBadge({ tier, complimentary = false }: { tier: SubscriptionTier; complimentary?: boolean }) {
  const config = tierConfig[tier] || tierConfig.free;
  if (!complimentary) return <Badge variant={config.variant}>{config.label}</Badge>;
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant={config.variant}>{config.label}</Badge>
      <Badge
        variant="outline"
        className="border-amber-500 text-amber-700 dark:text-amber-400"
        title="Granted manually — no payment. Excluded from MRR."
      >
        Comped
      </Badge>
    </span>
  );
}
