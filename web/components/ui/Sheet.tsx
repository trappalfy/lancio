"use client";

import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const SIDES = {
  bottom: "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-section border-t",
  right: "inset-y-0 right-0 h-dvh w-[min(360px,88vw)] rounded-l-section border-l",
  left: "inset-y-0 left-0 h-dvh w-[min(360px,88vw)] rounded-r-section border-r",
} as const;

/** Slide-over panel (mobile menu, mobile trade panel, filters). */
export function Sheet({
  open,
  onOpenChange,
  trigger,
  side = "bottom",
  title,
  children,
  className,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  side?: keyof typeof SIDES;
  title: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <D.Trigger asChild>{trigger}</D.Trigger>}
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-sm" />
        <D.Content
          className={cn("fixed z-50 flex flex-col overflow-y-auto border-border bg-surface p-5 shadow-pop focus:outline-none", SIDES[side], className)}
        >
          <div className="mb-4 flex items-center justify-between gap-4">
            <D.Title className="text-base font-semibold text-text">{title}</D.Title>
            <D.Description className="sr-only">{typeof title === "string" ? title : "Panel"}</D.Description>
            <D.Close className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-text" aria-label="Close">
              <X size={18} />
            </D.Close>
          </div>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export const SheetClose = D.Close;
