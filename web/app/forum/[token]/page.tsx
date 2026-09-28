import type { Hex, TokenDetail } from "@lancio/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { AddressLink, TokenImage } from "@/components/common";
import { ForumSidebar } from "@/components/forum/ForumSidebar";
import { NewPostDialog } from "@/components/forum/NewPostDialog";
import { PostFeed } from "@/components/forum/PostFeed";
import { parseSort, sortLinks } from "@/components/forum/sort";
import { Button, Card, EmptyState, PillTabs } from "@/components/ui";
import { ADDRESS_RE } from "@/db/http";
import { api, ApiError } from "@/lib/api";

type Params = { params: Promise<{ token: string }> };

/** Token from the indexer: TokenDetail, "missing" (404) or null (indexer unreachable → render with the address only). */
const loadToken = cache(async (address: string): Promise<TokenDetail | "missing" | null> => {
  try {
    return await api.token(address);
  } catch (err) {
    return err instanceof ApiError && err.status === 404 ? "missing" : null;
  }
});

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { token } = await params;
  const t = ADDRESS_RE.test(token) ? await loadToken(token.toLowerCase()) : "missing";
  return { title: t && t !== "missing" ? `$${t.symbol} forum` : "Forum" };
}

export default async function TokenForumPage({ params, searchParams }: Params & { searchParams: Promise<{ sort?: string | string[] }> }) {
  const { token } = await params;
  if (!ADDRESS_RE.test(token)) notFound();
  const address = token.toLowerCase() as Hex;
  const t = await loadToken(address);
  if (t === "missing") notFound();
  const sort = parseSort((await searchParams).sort);
  const symbol = t?.symbol ?? null;

  return (
    <div className="container-page py-8 md:py-12">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="min-w-0">
          <Card className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <TokenImage src={t?.meta.image} alt={t?.name ?? address} seed={address} size={64} priority />
              <div className="min-w-0">
                <p className="text-13 text-muted">Forum room</p>
                <h1 className="truncate font-heading text-28 text-text">{t?.name ?? "Unknown token"}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  {symbol && <span className="font-semibold text-text">${symbol}</span>}
                  <AddressLink address={address} kind="token" copy />
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button href={`/launchpad/${address}`} variant="outline">
                Trade
              </Button>
              <NewPostDialog token={address} symbol={symbol} />
            </div>
          </Card>
          <PillTabs className="mt-6" aria-label="Sort posts" items={sortLinks(`/forum/${address}`, sort)} />
          <Card padded={false} className="mt-5 px-5 md:px-8">
            <PostFeed
              query={{ sort, token: address }}
              showToken={false}
              empty={
                <EmptyState
                  className="min-h-[360px] justify-center"
                  title={symbol ? `No threads about $${symbol} yet.` : "No threads yet."}
                  description="Start the first one. Holders get a badge next to their address."
                  action={<NewPostDialog token={address} symbol={symbol} />}
                />
              }
            />
          </Card>
        </div>
        <ForumSidebar className="lg:sticky lg:top-[calc(var(--header-h)+24px)]" />
      </div>
    </div>
  );
}
