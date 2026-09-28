"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { Button, Card, Skeleton } from "@/components/ui";
import { ProfileView } from "./ProfileView";

/** /profile — the connected wallet's profile, or a calm prompt to connect. */
export function OwnProfile() {
  const { address, status } = useAccount();
  const { openConnectModal } = useConnectModal();
  // wagmi starts "disconnected" on first render and reconnects right after; give it a moment before prompting.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSettled(true), 400);
    return () => clearTimeout(id);
  }, []);

  if (address) return <ProfileView address={address} />;

  const waiting = status === "connecting" || status === "reconnecting" || !settled;
  return (
    <div className="container-page py-8 md:py-12">
      <Card texture className="flex flex-col items-center px-5 py-14 text-center md:py-20">
        {waiting ? (
          <>
            <Skeleton className="size-18 rounded-full" />
            <Skeleton className="mt-5 h-5 w-56" />
            <Skeleton className="mt-3 h-4 w-72 max-w-full" />
          </>
        ) : (
          <>
            <h1 className="font-heading text-28 text-text">Profile</h1>
            <p className="mt-3 max-w-md text-sm text-muted">
              Connect a wallet to see the tokens you launched, your holdings and trades, and the creator fees you can claim.
            </p>
            <Button className="mt-6" onClick={openConnectModal} disabled={!openConnectModal}>
              Connect wallet
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
