import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./Spinner";

export type ButtonVariant = "accent" | "outline" | "ghost" | "cream-outline" | "buy" | "sell";
export type ButtonSize = "sm" | "md" | "lg" | "icon" | "icon-sm";

const VARIANTS: Record<ButtonVariant, string> = {
  accent: "bg-accent text-on-accent hover:brightness-110 active:brightness-95",
  outline: "border border-border bg-transparent text-text hover:bg-surface-2",
  ghost: "bg-transparent text-muted hover:text-text hover:bg-surface-2",
  "cream-outline": "border border-cream/60 bg-transparent text-cream hover:bg-cream/10",
  buy: "bg-buy-bg text-on-buy hover:brightness-110 active:brightness-95",
  sell: "bg-sell-bg text-on-sell hover:brightness-110 active:brightness-95",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3.5 text-13 gap-1.5",
  md: "h-10 px-5 text-sm gap-2",
  lg: "h-12 px-7 text-base gap-2.5",
  icon: "size-10 p-0",
  "icon-sm": "size-8 p-0",
};

export function buttonClass(variant: ButtonVariant = "accent", size: ButtonSize = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center rounded-full font-medium whitespace-nowrap select-none transition-[background-color,color,filter,border-color] duration-150",
    "disabled:opacity-50 disabled:pointer-events-none aria-disabled:opacity-50 aria-disabled:pointer-events-none",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Renders a Next <Link> (internal) or <a target=_blank> (http…) instead of <button>. */
  href?: string;
  children?: ReactNode;
};

export function Button({ variant = "accent", size = "md", loading, href, className, children, disabled, type, ...rest }: ButtonProps) {
  const cls = buttonClass(variant, size, className);
  const content = (
    <>
      {loading && <Spinner size={size === "lg" ? 18 : 14} />}
      {children}
    </>
  );
  if (href && !disabled) {
    if (/^https?:\/\//.test(href)) {
      return (
        <a href={href} target="_blank" rel="noreferrer" className={cls} aria-label={rest["aria-label"]} title={rest.title}>
          {content}
        </a>
      );
    }
    return (
      <Link href={href} className={cls} aria-label={rest["aria-label"]} title={rest.title}>
        {content}
      </Link>
    );
  }
  return (
    <button type={type ?? "button"} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {content}
    </button>
  );
}
