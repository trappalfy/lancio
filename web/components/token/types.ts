/** Shared by the server page (URL params) and client components — keep free of "use client". */
export type Side = "buy" | "sell";
export type TokenTab = "trades" | "holders" | "forum" | "about";
export const TOKEN_TABS: readonly TokenTab[] = ["trades", "holders", "forum", "about"];
