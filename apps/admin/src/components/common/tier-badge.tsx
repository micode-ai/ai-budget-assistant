import { Badge } from "@/components/ui/badge";
import type { SubscriptionTier } from "@/types";

const tierConfig: Record<SubscriptionTier, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  free: { label: "Free", variant: "secondary" },
  pro: { label: "Pro", variant: "default" },
  business: { label: "Business", variant: "outline" },
};

export function TierBadge({ tier }: { tier: SubscriptionTier }) {
  const config = tierConfig[tier] || tierConfig.free;
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
