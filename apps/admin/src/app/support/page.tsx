"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSupportThreads } from "@/hooks/use-support";
import { ThreadList } from "@/components/support/thread-list";
import { ThreadView } from "@/components/support/thread-view";
import type { SupportThreadFilter } from "@/types";

function SupportContent() {
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = params.get("thread");
  const [filter, setFilter] = useState<SupportThreadFilter>("open");
  const { data: threads = [], isLoading } = useSupportThreads(filter);

  function select(id: string) {
    router.replace(`/support?thread=${encodeURIComponent(id)}`);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Support</h1>
        <p className="text-sm text-muted-foreground">Messages from users to the developer.</p>
      </div>
      <div className="grid h-[calc(100vh-12rem)] min-h-[400px] grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
        <div className="flex min-h-0 flex-col rounded-md border">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as SupportThreadFilter)} className="p-2">
            <TabsList className="w-full">
              <TabsTrigger value="open">Open</TabsTrigger>
              <TabsTrigger value="closed">Closed</TabsTrigger>
              <TabsTrigger value="muted">Muted</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ThreadList threads={threads} isLoading={isLoading} selectedId={selectedId} onSelect={select} />
          </div>
        </div>
        <div className="min-h-0 rounded-md border">
          {selectedId ? (
            <ThreadView key={selectedId} threadId={selectedId} />
          ) : (
            <p className="p-4 text-sm text-muted-foreground">Select a thread.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SupportPage() {
  return (
    <Suspense fallback={null}>
      <SupportContent />
    </Suspense>
  );
}
