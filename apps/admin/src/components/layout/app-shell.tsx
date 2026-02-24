"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { AppSidebar } from "./app-sidebar";
import { Header } from "./header";
import { useRealtime } from "@/hooks/use-realtime";
import { Skeleton } from "@/components/ui/skeleton";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const { connected } = useRealtime();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Skeleton className="h-8 w-32" />
      </div>
    );
  }

  // Login page — no shell
  if (pathname === "/login" || !user) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header connected={connected} />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
