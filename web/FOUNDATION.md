# web/ foundation — read this first

Next.js 16 (App Router, Turbopack), React 19, TypeScript strict, Tailwind v4, wagmi 2 + viem + RainbowKit 2, React Query 5.
Next 16 differs from older docs: `params`/`searchParams` are **Promises** (`const { address } = await params`); bundled docs are in `node_modules/next/dist/docs/`.

```
pnpm --filter @lancio/web dev | build | typecheck | lint      # from repo root
```
`web/.env.local` runs on **mocks** (`NEXT_PUBLIC_USE_MOCKS=true`), so every page works without contracts or indexer.
Append `?mock=empty` to any URL to see empty states. All deps are installed — **do not add dependencies**.

## Conventions (non-negotiable)
- **Colours only via tokens** (below). Tailwind's default palette is removed (`text-white`, `bg-black`, `text-red-500` don't exist). No hex in components. Use `/alpha` modifiers on tokens (`bg-accent/20`, `border-cream/40`).
- **Copy from `COPY`** (`@lancio/shared`). Missing string → write it in the same calm, exact voice; no emoji/hype/"safe"/"guaranteed"/"audited".
- **Numbers via shared formatters** (`formatEth`, `formatUsd`, `formatTokens`, `formatPriceEth`, `formatPct`, `formatProgress`, `shortAddress`, `timeAgo`) and **protocol numbers from shared constants/`PARAMS`** — never hard-code "8 ETH", "1%", "2 blocks".
- Cinzel (`font-heading`) only for page/section titles, wordmark, slogans — never small text or numbers. Addresses/hashes in `font-mono`.
- Paintings only in hero, empty states, docs, 404, OG. Never on working screens (trade, forms, tables).
- Server components by default; add `"use client"` only where hooks/state are needed.
- Don't edit foundation files (list at the bottom). Need a change? Put it in your own area file or report it.

## Design tokens (`app/globals.css`)
Theme: one dark theme only (owner decision 2026-09-28) — `data-theme="dark"` on `<html>`, no toggle, no light tokens. Every text token is ≥ 4.5:1 on `bg`, `surface`, `surface-2`.

| Utility colour | Use |
|---|---|
| `bg` `surface` `surface-2` | page / section cards / nested cards, inputs, pill-tab track |
| `border` | lines, frames, progress track |
| `text` `muted` | primary / secondary text |
| `accent` | antique gold **fill** (CTA, progress, active page). Text on it: `text-on-accent` |
| `accent-text` | gold usable **as text** (links, fresh time, graduated label) |
| `accent-soft` | 16% gold tint behind `accent-text` (chips, highlights) |
| `buy` `sell` | olive / carmine **text** (sides, +/- change) |
| `buy-bg`+`on-buy`, `sell-bg`+`on-sell` | filled Buy / Sell buttons |
| `crimson`+`on-crimson` | decorative badge fill (never crimson text) |
| `cream` | `#F1EADF` text over paintings (hero) |
| `pill-active` | active pill in a `surface-2` track |
| `overlay` | modal backdrop |

Other theme values: text sizes `text-13 text-28 text-40 text-56` (plus Tailwind `text-xs/sm/base/xl`) → scale 12/13/14/16/20/28/40/56; radii `rounded-section` (28) `rounded-card` (20) `rounded-image` (14), pills `rounded-full`; shadows `shadow-section`, `shadow-pop`; `tracking-display`; breakpoint `xs` = 480px (grid: 1 → xs:2 → md:3 → lg:4 → xl:5).

Custom utilities: `container-page` (1200px content, 16px gutters) · `font-heading` (Cinzel 600, caps tracking) · `canvas-texture` (canvas weave overlay for big panels; sets `position:relative` + `isolation`) · `graduated-panel` (warm surface→gold gradient + gold border; pair with `canvas-texture`) · `under-header` (hero slides under the sticky header) · `painting-muted` · `tabular`. Body has `tabular-nums` on by default. `--header-h` = 64px / 76px (md+).

For canvases/charts use `cssVar("--accent")` from `lib/theme.ts`.

## lib/
- **`utils.ts`** — `cn(...classes)` (clsx + tailwind-merge aware of the custom sizes/radii).
- **`config.ts`** — `config = { chainId, rpcUrl, indexerUrl, siteUrl, xHandle ("" if unset, no @), useMocks, heroLiveStats, banner: {id,title,text}|null, walletConnectProjectId, ipfsGateway, deployment: {launchpad, locker, hook, startBlock} }`. Every `NEXT_PUBLIC_*` is read literally here — read env **only** through `config`. `deployment.launchpad` is the zero address until contracts are deployed/env set.
- **`wagmi.ts`** — `appChain` (Robinhood Chain, id from env, RPC from env), `wagmiConfig` (RainbowKit defaults when a WalletConnect id exists, else injected wallets only; `ssr: true`). Registered with wagmi's `Register`, so hooks are fully typed.
- **`providers.tsx`** — `<Providers>`: Wagmi, React Query, RainbowKit (Lancio theme on CSS vars), Radix Tooltip provider, HeroHeader provider, sonner `<Toaster>`. Already mounted in the root layout.
- **`api.ts`** — typed indexer client for every route in `packages/shared/src/api-types.ts` (`${indexerUrl}/api`; mocks when `config.useMocks`).
  - Fetchers (usable on server too, e.g. `generateMetadata`): `api.tokens(q)`, `api.token(addr)`, `api.candles(addr, interval, {from,to})`, `api.trades(addr, {limit, before})`, `api.holders(addr, limit)`, `api.stats(window)`, `api.daily(days)`, `api.account(addr)`, `api.holdings(addr)`, `api.accountTrades(addr, {limit, before})`, `api.search(q)`, `api.top(limit)`, `api.ethUsd()`.
  - Hooks (client): `useTokens(q)`, `useToken(addr)`, `useCandles(addr, interval)`, `useTrades(addr, limit=50)`, `useHolders(addr, limit=20)`, `useStats("24h"|"all")`, `useDaily(days=14)`, `useAccount(addr)`, `useHoldings(addr)`, `useAccountTrades(addr, limit=50)`, `useSearch(q)` (disabled when empty; debounce in caller), `useTop(limit=10)`, `useEthUsd()`. Live data refetches every `LIVE_MS` (4 s); list/candle hooks keep previous data while loading the next key. Address hooks are disabled until the address is a valid `0x…40`.
  - `ApiError` (`.status`; `useToken` 404 → `error.status === 404`, no retry). Query keys: `qk.*` (all start with `"lancio"`).
- **`mock.ts`** — deterministic fixtures built with the shared curve math (65 tokens: 60 on the curve at varied progress, 5 graduated with pool trades; trades, candles for every interval, holders labelled curve/pool/creator, stats, 14-day series). `?mock=empty` → empty lists and 404 tokens. Any unknown account address is served as an alias of a mock creator (6 created tokens, creator fees, holdings), so a connected dev wallet has a profile. `mockTokens()`, `MOCK_CREATORS`, `MOCK_TRADERS` for previews. Only loaded when mocks are on.
- **`errors.ts`** — `toFriendlyError(err)` (launchpad/locker custom errors → `COPY.errors` or short text; user rejection; insufficient funds; chain mismatch), `isUserRejection(err)`, `revertErrorName(err)`.
- **`tx.ts`** — `useTx()` → `{ run, writeContractAsync, status, hash, receipt, error, reset, busy }`.
  `await tx.run(() => tx.writeContractAsync({ address: config.deployment.launchpad, abi: launchpadAbi, functionName: "buy", args, value }), { pending?, success? })`
  Toasts "Confirm in wallet" → "Pending…" (explorer link) → "Confirmed" | "Failed: {reason}"; wallet decline → neutral note, status `"rejected"`. Resolves with the receipt (null on reject/fail) and invalidates all queries (again after 2 s for indexer lag). `run` accepts any `() => Promise<Hash>` (e.g. `sendTransactionAsync` for the Universal Router).
- **`usd.ts`** — `useFormatUsd()` → `(wei) => "$22k"` or ETH fallback; `useWeiToUsd()` → `(wei) => number | null`.
- **`theme.ts`** — `cssVar(name)`.
- **`identicon.ts`** — `identiconSvg(seed, size)`, `emblemSvg(seed)`, `svgDataUri(svg)`.

ABIs: `import { launchpadAbi, lockerAbi, tokenAbi, v4QuoterAbi, universalRouterAbi, permit2Abi, poolManagerAbi } from "@lancio/shared/abi"` (not re-exported from the package root). Uniswap v4 addresses: `UNISWAP_V4` from `@lancio/shared`.

## components/ui/ (import from `@/components/ui`)
- `Button` — `variant: accent|outline|ghost|cream-outline|buy|sell`, `size: sm|md|lg|icon|icon-sm`, `loading`, `href` (internal → `<Link>`, `http…` → new tab), plus button props. `buttonClass(variant, size, className)` for custom elements.
- `Card` — section card (`as`, `padded`=true → 20/32px, `texture`). `SubCard` — nested `surface-2` card (`padded`). `CardHeader` — `{title, count?, subtitle?, actions?}` (Cinzel title row like "Explore · 4,228,127 launched" with controls right).
- `PillTabs<T>` — controlled `{value, onChange, items:{value,label,disabled?}[]}` or links `{items:{href,label,active}[]}`; `size: sm|md`.
- `Badge` — `variant: graduated (gold mark + "Graduated") | new | curve | neutral | crimson`; opaque, safe on images. `CountPill` — count next to a title.
- `Input` (`leading`, `trailing`, `inputClassName`), `Textarea`, `Field` (`{label, hint, error, htmlFor, aside}` — aside e.g. "0 / 280").
- `Skeleton`, `Spinner` (`size`), `ProgressBar` (`bps` 0..10000; label with `formatProgress`).
- `Tooltip` (`{content, side}` — child must be focusable), `Dialog` (`{open, onOpenChange, trigger?, title, description?, footer?}`, `DialogClose`), `Sheet` (`side: bottom|right|left`, same API, `SheetClose`), `Dropdown` (`{trigger, items: {label, icon?, href? | onSelect?, danger?} | {type:"separator"} | {type:"label", label}, align}`), `Accordion` (`{items:{value,title,content}[], type, defaultValue}`), `Select<T>` (`{value, onChange, options, placeholder}`).
- `Pagination` — `{page, totalPages, hrefFor(page)}` → ‹ 1 2 … 20 › (links, `scroll={false}`); `pageList()` helper.
- `StatTile` — `{label, value, sub?, hint?, size: md|lg|xl}` (value pre-formatted).
- `EmptyState` — `{image? ("/brand/painting-*.png"), title, description?, action?}`; painting is muted/darkened.
- Icons: use `lucide-react`; brand glyphs `XIcon`, `TelegramIcon`, `EthIcon` from `@/components/ui` (EthIcon is the only cool colour allowed).

## components/common/ (import from `@/components/common`)
- `TokenImage` — `{src, alt, size (px | "fill"), seed (address), sizes?, priority?}`; square rounded, identicon fallback on missing/failed image. `"fill"` needs a positioned parent (e.g. `relative aspect-square`).
- `Identicon` — `{address, size}` deterministic brand-palette avatar.
- `AddressLink` — `{address, kind: address|token|tx, copy?, href?}`; short mono address → explorer, or internal `href` + small explorer arrow.
- `CopyButton` — `{value, label?}`.
- `TimeAgo` — `{ts, freshSeconds=10}` live "8s ago"; gold while fresh.
- `EthAmount` — `{wei, unit?, digits?}`. `UsdAmount` — `{wei}` via `useEthUsd`, ETH fallback.

## components/layout/ & brand
- `Header` (sticky; mark → `/`; pill nav Explore/Forum/Analytics; WalletButton; blur surface once scrolled; mobile sheet). `NAV` exported.
- Home hero = particle field (`components/home/particles.ts` + `HeroParticles.tsx`, spec `HERO_PARTICLES.md`): the static painting under the canvas must keep the same framing as `FRAMING` in `particles.ts`.
- `HeroHeaderContext` — `useRegisterHero(ref)`: while that element is under the header, the header is transparent with cream text. Hero section: `const ref = useRef<HTMLElement>(null); useRegisterHero(ref); <section ref={ref} className="under-header …">` (client component).
- `WalletButton` (`tone: default|cream`): Connect (gold seal with the mark, pill with a thin gold edge; owner pick 2026-09-28) → address pill menu in the same shell (Profile, Creator fees → `/profile#creator-fees`, Copy address, Disconnect); wrong chain → "Switch to Robinhood Chain". `Footer`. `StatusBanner` (env-driven, per-id dismissal).
- `LancioMark` — `<LancioMark className="w-8 text-accent" title?/>` inline SVG, `currentColor` (also `LANCIO_MARK_PATH`). Static file: `/brand/lancio-mark.svg`.
- Brand images in `public/brand/`: `painting-shipwright.png` (hero + home OG), `hero-particles.jpg` (level-adjusted copy sampled into the hero particles, not for display), `painting-arsenale-launch-full.png`, `painting-forge-full.png`, `painting-colleganza.png`, `painting-gate.png`, `painting-key.png`, `chart-curve.png`. Use `next/image` (large PNGs; set `sizes`).

## Cross-area stubs (final signatures — owners replace bodies)
- `components/trade/TradePanel.tsx` — `TradePanel({ token: TokenDetail; initialSide?: "buy"|"sell" })`
- `components/trade/GraduationProgress.tsx` — `GraduationProgress({ token: TokenDetail })`
- `components/trade/CreatorFeesCard.tsx` — `CreatorFeesCard({ token: TokenDetail })`
- `components/forum/TokenForumTab.tsx` — `TokenForumTab({ token: TokenSummary })`
- `components/forum/AccountPostsTab.tsx` — `AccountPostsTab({ address: \`0x${string}\` })`

## Ownership
**Foundation (don't edit):** `app/layout.tsx`, `app/globals.css`, `app/manifest.ts`, app icons, `next.config.ts`, `mdx-components.tsx` (docs may extend styles), `lib/*`, `components/ui/*`, `components/common/*`, `components/layout/*`, `components/brand/*`.

**Page areas (own their route files + a `components/<area>/` folder, create what you need there):**
- Home / Explore — `app/page.tsx`, `components/home/`, `components/token/` (token cards shared with other pages)
- Create — `app/launchpad/create/`, `components/create/`
- Token page + trading — `app/launchpad/[address]/`, `components/trade/` (TradePanel, GraduationProgress, CreatorFeesCard, chart, trades, holders)
- Forum — `app/forum/**`, `components/forum/` (TokenForumTab, AccountPostsTab), `app/api/forum/**`
- Analytics — `app/analytics/`, `components/analytics/`
- Profile — `app/profile/**`, `components/profile/`
- Docs / legal / 404 — `app/docs/**`, `app/legal/**`, `app/not-found.tsx`, `components/docs/`

Route params: `/forum/[token]` takes the **token address** (tickers are not unique), `/forum/post/[id]`, `/profile/[address]`, `/launchpad/[address]`. `/launchpad` 301 → `/`.

## Env
`web/.env.local` (gitignored) and repo `.env.example`: `NEXT_PUBLIC_USE_MOCKS`, `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_INDEXER_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, `NEXT_PUBLIC_X_HANDLE`, `NEXT_PUBLIC_HERO_LIVE_STATS`, `NEXT_PUBLIC_BANNER_ID/TITLE/TEXT`, `NEXT_PUBLIC_IPFS_GATEWAY`, `NEXT_PUBLIC_LAUNCHPAD/LOCKER/HOOK/START_BLOCK`. Server-only: `PINATA_JWT`, `DATABASE_URL`, `SESSION_SECRET`. A new `NEXT_PUBLIC_*` must be added to `lib/config.ts` (foundation) — report it instead of reading `process.env` in pages.
