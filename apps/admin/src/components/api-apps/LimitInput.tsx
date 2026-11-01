"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

/** Positive integer up to 100000, or empty for the default. Saves on blur when valid and changed. */
export function LimitInput({
  value,
  label,
  onSave,
}: {
  value: number | null;
  label: string;
  onSave: (v: number | null) => void;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const [invalid, setInvalid] = useState(false);

  function commit() {
    const t = text.trim();
    if (t === "") {
      setInvalid(false);
      if (value !== null) onSave(null);
      return;
    }
    const n = Number(t);
    if (!Number.isInteger(n) || n < 1 || n > 100000) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (n !== value) onSave(n);
  }

  return (
    <Input
      aria-label={label}
      className={`h-8 w-24 ${invalid ? "border-destructive" : ""}`}
      inputMode="numeric"
      placeholder="default"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
    />
  );
}
