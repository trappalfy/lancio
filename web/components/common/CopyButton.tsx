"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function CopyButton({ value, label = "Copy", size = 14, className }: { value: string; label?: string; size?: number; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={done ? "Copied" : label}
      title={done ? "Copied" : label}
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {}
      }}
      className={cn("inline-grid size-6 place-items-center rounded-full text-muted hover:text-text hover:bg-surface-2 transition-colors", className)}
    >
      {done ? <Check size={size} className="text-buy" /> : <Copy size={size} />}
    </button>
  );
}
