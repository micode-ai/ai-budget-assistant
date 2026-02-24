import { Badge } from "@/components/ui/badge";

interface StatusBadgeProps {
  active: boolean;
}

export function StatusBadge({ active }: StatusBadgeProps) {
  return (
    <Badge variant={active ? "default" : "destructive"}>
      {active ? "Active" : "Inactive"}
    </Badge>
  );
}
