import { explorerAddress, explorerToken, explorerTx, shortAddress } from "@lancio/shared";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { CopyButton } from "./CopyButton";

/**
 * Short mono address/hash "0x9dDd…932e".
 * Default: links to the explorer (kind address|token|tx). With `href` (internal, e.g. /profile/0x…): links there
 * and shows a small explorer arrow next to it. `copy` adds a copy button.
 */
export function AddressLink({
  address,
  kind = "address",
  copy,
  href,
  className,
}: {
  address: string;
  kind?: "address" | "token" | "tx";
  copy?: boolean;
  href?: string;
  className?: string;
}) {
  const explorer = kind === "tx" ? explorerTx(address) : kind === "token" ? explorerToken(address) : explorerAddress(address);
  const label = shortAddress(address);
  const text = "whitespace-nowrap font-mono text-13 text-muted hover:text-text transition-colors";
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {href ? (
        <>
          <Link href={href} className={text} title={address}>
            {label}
          </Link>
          <a href={explorer} target="_blank" rel="noreferrer" aria-label="Open in explorer" className="text-muted hover:text-text">
            <ArrowUpRight size={13} />
          </a>
        </>
      ) : (
        <a href={explorer} target="_blank" rel="noreferrer" className={text} title={address}>
          {label}
        </a>
      )}
      {copy && <CopyButton value={address} label="Copy address" />}
    </span>
  );
}
