"use client";

import { COPY, shortAddress, type TokenSummary } from "@lancio/shared";
import * as D from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import { ArrowRight, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { TokenImage, UsdAmount } from "@/components/common";
import { Badge, Spinner } from "@/components/ui";
import { useSearch } from "@/lib/api";
import { tokenHref } from "./TokenCard";

const DEBOUNCE_MS = 150;
const isAddress = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s);

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** ⌘K / Ctrl+K anywhere on the page toggles the palette. */
export function useSearchHotkey(setOpen: (fn: (open: boolean) => boolean) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);
}

/** Command palette over /api/search: name, ticker or address → token page. */
export function SearchPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const term = useDebounced(query.trim(), DEBOUNCE_MS);
  const { data, isFetching } = useSearch(term);
  const results = term ? (data ?? []) : [];
  const typed = query.trim();
  const directAddress = isAddress(typed) && !results.some((t) => t.address.toLowerCase() === typed.toLowerCase()) ? typed : null;
  const settled = term === typed && !isFetching;

  const go = (address: string) => {
    onOpenChange(false);
    router.push(tokenHref({ address: address as TokenSummary["address"] }));
  };

  return (
    <D.Root
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setQuery("");
      }}
    >
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-sm" />
        <D.Content
          aria-describedby={undefined}
          className="fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-32px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-section border border-border bg-surface shadow-pop focus:outline-none"
        >
          <D.Title className="sr-only">Search tokens</D.Title>
          <Command shouldFilter={false} label="Search tokens" loop>
            <div className="flex items-center gap-3 border-b border-border px-5">
              <Search size={18} className="shrink-0 text-muted" aria-hidden />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Name, ticker or address"
                className="h-14 w-full bg-transparent text-base text-text outline-none placeholder:text-muted"
              />
              {isFetching && term ? <Spinner size={16} /> : null}
              <kbd className="hidden rounded-md border border-border bg-surface-2 px-1.5 py-0.5 text-xs text-muted sm:inline">Esc</kbd>
            </div>

            <Command.List className="max-h-[min(60vh,440px)] overflow-y-auto p-2">
              {!typed && <p className="px-3 py-8 text-center text-sm text-muted">Search by token name, ticker or contract address.</p>}

              {typed && settled && results.length === 0 && !directAddress && (
                <Command.Empty className="px-3 py-8 text-center text-sm text-muted">No tokens match “{typed}”.</Command.Empty>
              )}

              {results.length > 0 && (
                <Command.Group heading="Tokens" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted">
                  {results.map((t) => (
                    <ResultItem key={t.address} token={t} onSelect={() => go(t.address)} />
                  ))}
                </Command.Group>
              )}

              {directAddress && (
                <Command.Item
                  value={`address-${directAddress}`}
                  onSelect={() => go(directAddress)}
                  className="flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-3 text-sm text-text data-[selected=true]:bg-surface-2"
                >
                  <ArrowRight size={16} className="text-muted" aria-hidden />
                  <span>
                    Open token <span className="font-mono">{shortAddress(directAddress)}</span>
                  </span>
                </Command.Item>
              )}
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function ResultItem({ token, onSelect }: { token: TokenSummary; onSelect: () => void }) {
  return (
    <Command.Item
      value={token.address}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 data-[selected=true]:bg-surface-2"
    >
      <TokenImage src={token.meta.image} alt="" seed={token.address} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-text">{token.name}</span>
          <span className="shrink-0 text-13 text-muted">${token.symbol}</span>
        </div>
        <span className="font-mono text-xs text-muted">{shortAddress(token.address)}</span>
      </div>
      {token.status === "graduated" && <Badge variant="graduated" className="hidden xs:inline-flex" />}
      <UsdAmount wei={token.mcapEth} className="shrink-0 text-13 text-text" />
    </Command.Item>
  );
}

const noopSubscribe = () => () => {};
const shortcutLabel = () => (/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent) ? "⌘K" : "Ctrl K");

/** The page's search field: opens the palette (click, Enter, or ⌘K / Ctrl+K). */
export function SearchTrigger({ onOpen }: { onOpen: () => void }) {
  const mod = useSyncExternalStore(noopSubscribe, shortcutLabel, () => null);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-keyshortcuts="Meta+K Control+K"
      className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-full border border-border bg-surface px-4 text-left text-sm text-muted shadow-section transition-colors hover:border-accent/50 hover:text-text"
    >
      <Search size={18} aria-hidden className="shrink-0" />
      <span className="flex-1 truncate">{COPY.explore.searchPlaceholder}</span>
      {mod && <kbd className="hidden rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-sans text-xs text-muted sm:inline">{mod}</kbd>}
    </button>
  );
}
