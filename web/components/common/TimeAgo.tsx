"use client";

import { timeAgo } from "@lancio/shared";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** "now", "8s ago", "3h ago" — re-renders live; gold while younger than freshSeconds. ts in unix seconds. */
export function TimeAgo({ ts, freshSeconds = 10, className }: { ts: number | null | undefined; freshSeconds?: number; className?: string }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const age = ts ? now - ts : Infinity;
  useEffect(() => {
    if (!ts) return;
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), age < 120 ? 1000 : 30_000);
    return () => clearInterval(id);
  }, [ts, age < 120]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ts) return <span className={cn("text-muted", className)}>—</span>;
  return (
    <time
      dateTime={new Date(ts * 1000).toISOString()}
      title={new Date(ts * 1000).toLocaleString()}
      suppressHydrationWarning
      className={cn("tabular whitespace-nowrap transition-colors", age <= freshSeconds ? "text-accent-text" : "text-muted", className)}
    >
      {timeAgo(ts, now)}
    </time>
  );
}
