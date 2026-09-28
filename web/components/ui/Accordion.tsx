"use client";

import * as A from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type AccordionItem = { value: string; title: ReactNode; content: ReactNode };

/** FAQ-style accordion (single open item by default). */
export function Accordion({
  items,
  type = "single",
  defaultValue,
  className,
}: {
  items: AccordionItem[];
  type?: "single" | "multiple";
  defaultValue?: string;
  className?: string;
}) {
  const inner = items.map((it) => (
    <A.Item key={it.value} value={it.value} className="border-b border-border last:border-0">
      <A.Header>
        <A.Trigger className="group flex w-full items-center justify-between gap-4 py-4 text-left text-base font-medium text-text">
          {it.title}
          <ChevronDown size={18} className="shrink-0 text-muted transition-transform group-data-[state=open]:rotate-180" />
        </A.Trigger>
      </A.Header>
      <A.Content className="pb-4 text-sm leading-6 text-muted">{it.content}</A.Content>
    </A.Item>
  ));
  return type === "multiple" ? (
    <A.Root type="multiple" defaultValue={defaultValue ? [defaultValue] : undefined} className={cn(className)}>
      {inner}
    </A.Root>
  ) : (
    <A.Root type="single" collapsible defaultValue={defaultValue} className={cn(className)}>
      {inner}
    </A.Root>
  );
}
