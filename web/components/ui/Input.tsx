import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const field =
  "w-full rounded-2xl bg-surface-2 border border-border text-text placeholder:text-muted transition-colors outline-none focus:border-accent focus-visible:outline-none aria-invalid:border-sell disabled:opacity-60";

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Icon/text inside the field on the left (e.g. search icon). */
  leading?: ReactNode;
  /** Inside on the right (e.g. "ETH", ⌘K hint, Max button). */
  trailing?: ReactNode;
  inputClassName?: string;
};

export function Input({ leading, trailing, className, inputClassName, ...rest }: InputProps) {
  if (!leading && !trailing) return <input className={cn(field, "h-12 px-4 text-sm", className)} {...rest} />;
  return (
    <div className={cn("relative flex items-center", className)}>
      {leading && <span className="pointer-events-none absolute left-4 flex items-center text-muted">{leading}</span>}
      <input className={cn(field, "h-12 text-sm", leading ? "pl-11" : "pl-4", trailing ? "pr-24" : "pr-4", inputClassName)} {...rest} />
      {trailing && <span className="absolute right-3 flex items-center gap-2 text-muted">{trailing}</span>}
    </div>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, "min-h-28 px-4 py-3 text-sm leading-6 resize-y", className)} {...rest} />;
}

/** Label + control + hint/error. Pass the control's id as htmlFor. */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  aside,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  /** Right side of the label row (e.g. "0 / 280"). */
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-13 font-medium text-muted">
          {label}
        </label>
        {aside && <span className="text-xs text-muted tabular">{aside}</span>}
      </div>
      {children}
      {error ? (
        <p role="alert" className="text-13 text-sell">
          {error}
        </p>
      ) : hint ? (
        <p className="text-13 text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
