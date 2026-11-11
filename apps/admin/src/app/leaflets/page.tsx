"use client";

import { useState } from "react";
import { LeafletUpload } from "@/components/leaflets/LeafletUpload";
import { LeafletReview } from "@/components/leaflets/LeafletReview";
import { LeafletStats } from "@/components/leaflets/LeafletStats";

export default function LeafletsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Leaflets</h1>
      <LeafletStats />
      <LeafletUpload onUploaded={setSelectedId} />
      <LeafletReview selectedId={selectedId} onSelect={setSelectedId} />
    </div>
  );
}
