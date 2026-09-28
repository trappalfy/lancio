import { COPY, PARAMS } from "@lancio/shared";
import { Globe, Image as ImageIcon } from "lucide-react";
import type { ReactNode } from "react";
import { EthIcon, TelegramIcon, XIcon } from "@/components/ui";
import { CroppedImage } from "./CroppedImage";
import type { ImagePreview } from "./useImageUpload";

export type PreviewData = {
  name: string;
  ticker: string;
  description: string;
  image: ImagePreview | null;
  x: string | null;
  telegram: string | null;
  website: string | null;
};

const ROWS: { label: string; value: ReactNode; sub?: string }[] = [
  {
    label: "Launch fee",
    value: (
      <span className="inline-flex items-center gap-1.5">
        {PARAMS.launchFeeEth} ETH <EthIcon size={14} />
      </span>
    ),
  },
  { label: "Paired with", value: "ETH" },
  { label: "Trade fee", value: PARAMS.tradeFeePct, sub: `${PARAMS.creatorFeePct} creator · ${PARAMS.protocolFeePct} Lancio` },
  { label: "Launch window", value: `${PARAMS.launchCapPct} max per wallet`, sub: PARAMS.launchWindow },
  { label: "Graduation", value: `${PARAMS.graduationEth} ETH` },
  { label: "Supply", value: PARAMS.supply, sub: "no allocations" },
  { label: "Liquidity", value: "Locked forever" },
];

/** Live token card + fixed launch parameters (right column of /launchpad/create). */
export function TokenPreview({ data }: { data: PreviewData }) {
  const name = data.name.trim();
  const links = [
    data.x && { href: data.x, label: "X profile", icon: <XIcon size={14} /> },
    data.telegram && { href: data.telegram, label: "Telegram", icon: <TelegramIcon size={14} /> },
    data.website && { href: data.website, label: "Website", icon: <Globe size={14} /> },
  ].filter(Boolean) as { href: string; label: string; icon: ReactNode }[];

  return (
    <div className="rounded-card border border-border bg-surface p-5 shadow-pop md:p-7">
      {data.image ? (
        <CroppedImage preview={data.image} alt={name || "Token image"} className="size-20 rounded-image" />
      ) : (
        <span className="grid size-20 place-items-center rounded-image bg-surface-2 text-muted">
          <ImageIcon size={24} />
        </span>
      )}

      <p className={name ? "mt-5 break-words text-28 font-semibold text-text" : "mt-5 text-28 font-semibold text-muted"}>
        {name || COPY.create.previewEmptyName}
      </p>
      <p className="mt-1 text-sm text-muted">{data.ticker || COPY.create.previewEmptyTicker}</p>

      {data.description.trim() && (
        <p className="mt-3 line-clamp-3 whitespace-pre-line break-words text-sm leading-6 text-muted">{data.description.trim()}</p>
      )}

      {links.length > 0 && (
        <div className="mt-4 flex gap-2">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              aria-label={l.label}
              title={l.label}
              className="grid size-8 place-items-center rounded-full border border-border text-muted transition-colors hover:text-text"
            >
              {l.icon}
            </a>
          ))}
        </div>
      )}

      <dl className="mt-6 border-t border-border">
        {ROWS.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-4 border-b border-border py-3">
            <dt className="text-13 text-muted">{r.label}</dt>
            <dd className="text-right text-sm text-text">
              {r.value}
              {r.sub && <span className="block text-xs text-muted">{r.sub}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
