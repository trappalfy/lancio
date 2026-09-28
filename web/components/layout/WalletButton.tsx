"use client";

import { shortAddress } from "@lancio/shared";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ChevronDown, Coins, Copy, LogOut, User } from "lucide-react";
import { toast } from "sonner";
import { useDisconnect, useSwitchChain } from "wagmi";
import { LancioMark } from "@/components/brand/LancioMark";
import { Identicon } from "@/components/common/Identicon";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { toFriendlyError, isUserRejection } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { appChain } from "@/lib/wagmi";

function SwitchChainButton({ className }: { className?: string }) {
  const { switchChain, isPending } = useSwitchChain();
  return (
    <Button
      variant="accent"
      loading={isPending}
      className={className}
      onClick={() =>
        switchChain(
          { chainId: appChain.id },
          { onError: (e) => (isUserRejection(e) ? undefined : toast.error(toFriendlyError(e))) },
        )
      }
    >
      Switch to Robinhood Chain
    </Button>
  );
}

type Tone = "default" | "cream";

/** Shared shell of both header states: a pill with a thin gold edge; over the hero it sits on a dark veil. */
const shell = (tone: Tone) =>
  cn(
    "inline-flex h-10 items-center rounded-full border border-accent/35 text-sm font-medium transition-[border-color,background-color] duration-200 hover:border-accent/70",
    tone === "cream" ? "bg-bg/40 text-cream" : "bg-surface text-text",
  );

/** Not connected: a gold seal with the Lancio mark (turns like a coin on hover) + "Connect". */
function ConnectSeal({ tone, onClick, className }: { tone: Tone; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={cn(shell(tone), "group justify-center gap-2.5 pr-4 pl-1 whitespace-nowrap select-none", className)}>
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#ecd08f,#c9a058_55%,#8a6630)] text-[#2a1b0c] shadow-[inset_0_0_0_1.5px_rgb(42_27_12/0.35),0_1px_3px_rgb(0_0_0/0.5)] transition-transform duration-500 motion-safe:group-hover:rotate-[36deg]"
      >
        <LancioMark className="w-5" />
      </span>
      Connect
    </button>
  );
}

function AccountMenu({ address, tone, className }: { address: string; tone: Tone; className?: string }) {
  const { disconnect } = useDisconnect();
  return (
    <Dropdown
      trigger={
        <button type="button" className={cn(shell(tone), "gap-2 pr-3 pl-1", className)}>
          <Identicon address={address} size={32} />
          <span className="font-mono text-13">{shortAddress(address)}</span>
          <ChevronDown size={16} className="opacity-70" />
        </button>
      }
      items={[
        { label: "Profile", icon: <User />, href: "/profile" },
        { label: "Creator fees", icon: <Coins />, href: "/profile#creator-fees" },
        {
          label: "Copy address",
          icon: <Copy />,
          onSelect: () => {
            void navigator.clipboard.writeText(address).then(() => toast.success("Address copied"));
          },
        },
        { type: "separator" },
        { label: "Disconnect", icon: <LogOut />, onSelect: () => disconnect() },
      ]}
    />
  );
}

/** Connect (gold seal) → address pill with menu; wrong network → "Switch to Robinhood Chain". */
export function WalletButton({ className, tone = "default" }: { className?: string; tone?: Tone }) {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, mounted }) => {
        if (!mounted) return <div aria-hidden className={cn("h-10 w-32", className)} />;
        if (!account || !chain) return <ConnectSeal tone={tone} onClick={openConnectModal} className={className} />;
        if (chain.unsupported) return <SwitchChainButton className={className} />;
        return <AccountMenu address={account.address} tone={tone} className={className} />;
      }}
    </ConnectButton.Custom>
  );
}
