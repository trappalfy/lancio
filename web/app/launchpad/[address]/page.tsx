import { shortAddress, type Hex } from "@lancio/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { TokenPage } from "@/components/token/TokenPage";
import { TOKEN_TABS, type TokenTab } from "@/components/token/types";
import { api } from "@/lib/api";

type Props = {
  params: Promise<{ address: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const isAddress = (a: string): a is Hex => /^0x[0-9a-fA-F]{40}$/.test(a);

/** Indexer record, or null (not indexed yet / indexer down). Shared by generateMetadata and the page. */
const loadToken = cache(async (address: string) => {
  try {
    return await api.token(address, AbortSignal.timeout(3_000));
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  if (!isAddress(address)) return {};
  const t = await loadToken(address);
  if (!t) return { title: `Token ${shortAddress(address)}` };
  // Root layout template appends " · Lancio".
  return {
    title: `${t.name} ($${t.symbol})`,
    description: t.meta.description?.trim().slice(0, 200) || `${t.name} ($${t.symbol}) on Lancio, a token launchpad on Robinhood Chain.`,
  };
}

export default async function Page({ params, searchParams }: Props) {
  const [{ address }, sp] = await Promise.all([params, searchParams]);
  if (!isAddress(address)) notFound();

  const side = sp.side === "buy" || sp.side === "sell" ? sp.side : undefined;
  const tab = TOKEN_TABS.find((t) => t === sp.tab) as TokenTab | undefined;
  const initial = await loadToken(address);

  return <TokenPage address={address} initial={initial} initialSide={side} initialTab={tab} />;
}
