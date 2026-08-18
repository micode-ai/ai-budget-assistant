"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSetCustomAiLimit } from "@/hooks/use-users";
import { toast } from "sonner";

/**
 * Inline (non-modal) custom AI request limit editor shown on the
 * Subscription card of the user detail page.
 */
export function AiLimitCard({
  userId,
  customAiLimit,
}: {
  userId: string;
  customAiLimit: number | null | undefined;
}) {
  const [aiLimitInput, setAiLimitInput] = useState("");
  const setAiLimit = useSetCustomAiLimit();

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <span className="text-sm text-muted-foreground">AI Request Limit</span>
      <p className="text-sm font-medium">
        {customAiLimit != null ? `Custom: ${customAiLimit}` : "Tier default"}
      </p>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          placeholder="Custom limit"
          value={aiLimitInput}
          onChange={(e) => setAiLimitInput(e.target.value)}
          className="w-32 h-8 text-sm"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!aiLimitInput || setAiLimit.isPending}
          onClick={() => {
            const val = parseInt(aiLimitInput);
            if (isNaN(val) || val < 0) return;
            setAiLimit.mutate(
              { userId, customAiLimit: val },
              {
                onSuccess: () => {
                  toast.success(`AI limit set to ${val}`);
                  setAiLimitInput("");
                },
              }
            );
          }}
        >
          Set
        </Button>
        {customAiLimit != null && (
          <Button
            size="sm"
            variant="ghost"
            disabled={setAiLimit.isPending}
            onClick={() => {
              setAiLimit.mutate(
                { userId, customAiLimit: null },
                {
                  onSuccess: () => {
                    toast.success("Reset to tier default");
                    setAiLimitInput("");
                  },
                }
              );
            }}
          >
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}
