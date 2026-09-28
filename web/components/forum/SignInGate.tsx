"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import type { ReactNode } from "react";
import { Button, SubCard } from "@/components/ui";
import { useSiwe } from "@/lib/siwe";

/** Renders children once the connected wallet is signed in (SIWE); otherwise a connect / sign-in prompt. */
export function SignInGate({ action, children }: { action: "post" | "comment"; children: ReactNode }) {
  const siwe = useSiwe();
  const { openConnectModal } = useConnectModal();
  if (siwe.signedIn) return <>{children}</>;
  return (
    <SubCard className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted">
        {siwe.isConnected
          ? `Sign a message to ${action}. It sends no transaction and costs no gas.`
          : `Connect a wallet to ${action}. Anyone can join; holders get a badge.`}
      </p>
      {siwe.isConnected ? (
        <Button size="sm" loading={siwe.busy} onClick={() => void siwe.signIn()} className="shrink-0">
          Sign in
        </Button>
      ) : (
        <Button size="sm" onClick={openConnectModal} className="shrink-0">
          Connect wallet
        </Button>
      )}
    </SubCard>
  );
}
