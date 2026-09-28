import { COPY } from "@lancio/shared";
import Link from "next/link";
import { LancioMark } from "@/components/brand/LancioMark";
import { XIcon } from "@/components/ui/icons";
import { config } from "@/lib/config";

const PRODUCT = [
  { href: "/", label: "Explore" },
  { href: "/analytics", label: "Analytics" },
  { href: "/launchpad/create", label: "Create" },
  { href: "/profile", label: "Profile" },
  { href: "/docs", label: "Docs" },
];
const LEGAL = [
  { href: "/legal/privacy", label: "Privacy Policy" },
  { href: "/legal/terms", label: "Terms of Use" },
];

function Column({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <h3 className="text-13 font-medium text-muted">{title}</h3>
      <ul className="mt-4 space-y-3">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="text-sm text-text/90 hover:text-accent-text transition-colors">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  const x = config.xHandle;
  return (
    <footer className="container-page mb-8 mt-20 md:mt-28">
      <div className="canvas-texture rounded-section border border-border/60 bg-surface p-6 shadow-section md:p-12">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-[1.5fr_0.7fr_0.8fr_1.4fr]">
          <div>
            <Link href="/" className="inline-flex items-center gap-3 text-text">
              <LancioMark className="w-9 text-accent" />
              <span className="font-heading text-28">Lancio</span>
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-6 text-muted">{COPY.footer.description}</p>
          </div>
          <Column title="Product" links={PRODUCT} />
          <Column title="Legal" links={LEGAL} />
          <div>
            <h3 className="text-13 font-medium text-muted">{COPY.footer.riskTitle}</h3>
            <p className="mt-4 text-sm leading-6 text-muted">{COPY.footer.risk}</p>
          </div>
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6 text-sm text-muted">
          <span>© 2026 Lancio</span>
          {x && (
            <a
              href={`https://x.com/${x}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2.5 text-text/90 hover:text-accent-text transition-colors"
            >
              <span className="underline underline-offset-4">@{x}</span>
              <span className="grid size-8 place-items-center rounded-lg border border-border">
                <XIcon size={14} />
              </span>
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}
