"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  BrainCircuit,
  CreditCard,
  MessageSquare,
  ScrollText,
  Settings,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  Smartphone,
  LineChart,
  Megaphone,
  Activity,
  UsersRound,
  KeyRound,
  TrendingUp,
  Newspaper,
  LifeBuoy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useState } from "react";
import { useSupportUnread } from "@/hooks/use-support";

export const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/metrics", label: "Investor Metrics", icon: LineChart },
  { href: "/activation", label: "Activation", icon: TrendingUp },
  { href: "/acquisition", label: "Acquisition", icon: Megaphone },
  { href: "/telemetry", label: "Telemetry", icon: Activity },
  { href: "/users", label: "Users", icon: Users },
  { href: "/ai-usage", label: "AI Usage", icon: BrainCircuit },
  { href: "/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/support", label: "Support", icon: LifeBuoy },
  { href: "/communications", label: "Communications", icon: MessageSquare },
  { href: "/app-versions", label: "App Versions", icon: Smartphone },
  { href: "/leaflets", label: "Leaflets", icon: Newspaper },
  { href: "/referrals", label: "Referrals", icon: UserPlus },
  { href: "/groups", label: "Groups", icon: UsersRound },
  { href: "/api-apps", label: "API apps", icon: KeyRound },
  { href: "/audit-log", label: "Audit Log", icon: ScrollText },
  { href: "/settings", label: "Settings", icon: Settings },
];

function UnreadBadge({ href, collapsed }: { href: string; collapsed?: boolean }) {
  const { data } = useSupportUnread();
  const total = href === "/support" ? (data?.total ?? 0) : 0;
  if (total <= 0) return null;
  return (
    <span
      className={cn(
        "rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground",
        collapsed ? "absolute right-1 top-0" : "ml-auto"
      )}
    >
      {total}
    </span>
  );
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <nav className="flex-1 space-y-1 p-2">
      {navItems.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            )}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            <span>{item.label}</span>
            <UnreadBadge href={item.href} />
          </Link>
        );
      })}
    </nav>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <aside
      className={cn(
        "relative hidden md:flex flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-200",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center border-b px-4",
          collapsed ? "justify-center" : "gap-2"
        )}
      >
        {!collapsed && (
          <h1 className="text-lg font-semibold truncate">
            Admin Panel
          </h1>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-8 w-8 shrink-0", !collapsed && "ml-auto")}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {navItems.map((item) => {
          const active = isActive(item.href);
          const linkContent = (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                collapsed && "justify-center px-2"
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
              <UnreadBadge href={item.href} collapsed={collapsed} />
            </Link>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.href} delayDuration={0}>
                <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          }

          return linkContent;
        })}
      </nav>
    </aside>
  );
}
