"use client";

import * as M from "@radix-ui/react-dropdown-menu";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type DropdownItem =
  | { type?: "item"; label: ReactNode; icon?: ReactNode; onSelect?: () => void; href?: string; danger?: boolean; disabled?: boolean }
  | { type: "separator" }
  | { type: "label"; label: ReactNode };

const itemCls =
  "flex w-full cursor-pointer select-none items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-text outline-none data-[highlighted]:bg-surface-2 data-[disabled]:opacity-50";

/** Menu from a trigger element (used asChild). Items: actions, links, separators, labels. */
export function Dropdown({
  trigger,
  items,
  align = "end",
  className,
}: {
  trigger: ReactNode;
  items: DropdownItem[];
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <M.Root modal={false}>
      <M.Trigger asChild>{trigger}</M.Trigger>
      <M.Portal>
        <M.Content
          align={align}
          sideOffset={8}
          className={cn("z-50 min-w-52 rounded-card border border-border bg-surface p-1.5 shadow-pop", className)}
        >
          {items.map((it, i) => {
            if (it.type === "separator") return <M.Separator key={i} className="my-1 h-px bg-border" />;
            if (it.type === "label")
              return (
                <M.Label key={i} className="px-3 py-1.5 text-xs text-muted">
                  {it.label}
                </M.Label>
              );
            const body = (
              <>
                {it.icon && <span className="text-muted [&>svg]:size-4">{it.icon}</span>}
                {it.label}
              </>
            );
            return it.href ? (
              <M.Item key={i} asChild disabled={it.disabled} className={cn(itemCls, it.danger && "text-sell")}>
                <Link href={it.href}>{body}</Link>
              </M.Item>
            ) : (
              <M.Item key={i} disabled={it.disabled} onSelect={it.onSelect} className={cn(itemCls, it.danger && "text-sell")}>
                {body}
              </M.Item>
            );
          })}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}
