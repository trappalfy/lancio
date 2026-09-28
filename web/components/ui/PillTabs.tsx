"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Size = "sm" | "md";
type Common = { className?: string; size?: Size; "aria-label"?: string };

export type PillTabsProps<T extends string> = Common & {
  value: T;
  onChange: (value: T) => void;
  items: readonly { value: T; label: ReactNode; disabled?: boolean }[];
};
export type PillLinkTabsProps = Common & {
  items: readonly { href: string; label: ReactNode; active: boolean }[];
};

const wrap = "inline-flex items-center gap-0.5 rounded-full bg-surface-2 p-1";
const item = (active: boolean, size: Size) =>
  cn(
    "inline-flex items-center justify-center rounded-full font-medium whitespace-nowrap transition-colors",
    size === "sm" ? "h-7 px-3 text-13" : "h-8 px-4 text-sm",
    active ? "bg-pill-active text-text shadow-sm" : "text-muted hover:text-text",
  );

/**
 * Pill segmented control. Controlled: {value, onChange, items:{value,label}[]}.
 * Link variant (no onChange): {items:{href,label,active}[]} — for URL-driven filters.
 */
export function PillTabs<T extends string>(props: PillTabsProps<T> | PillLinkTabsProps) {
  const size = props.size ?? "md";
  if ("onChange" in props) {
    const { value, onChange, items } = props;
    return (
      <div role="tablist" aria-label={props["aria-label"]} className={cn(wrap, props.className)}>
        {items.map((it) => (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={it.value === value}
            disabled={it.disabled}
            onClick={() => onChange(it.value)}
            className={cn(item(it.value === value, size), "disabled:opacity-40")}
          >
            {it.label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <nav aria-label={props["aria-label"]} className={cn(wrap, props.className)}>
      {props.items.map((it) => (
        <Link key={it.href} href={it.href} scroll={false} aria-current={it.active ? "page" : undefined} className={item(it.active, size)}>
          {it.label}
        </Link>
      ))}
    </nav>
  );
}
