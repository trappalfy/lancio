import { identiconSvg, svgDataUri } from "@/lib/identicon";
import { cn } from "@/lib/utils";

/** Deterministic avatar for an address (brand palette). */
export function Identicon({ address, size = 32, className }: { address: string; size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- inline data URI, nothing to optimise
    <img
      src={svgDataUri(identiconSvg(address, 64))}
      width={size}
      height={size}
      alt=""
      aria-hidden
      className={cn("shrink-0 rounded-full", className)}
      style={{ width: size, height: size }}
    />
  );
}
