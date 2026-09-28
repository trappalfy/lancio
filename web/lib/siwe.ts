"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { createSiweMessage } from "viem/siwe";
import { useAccount, useSignMessage } from "wagmi";
import { ForumError, forumFetch } from "@/db/fetch";
import type { MeResponse } from "@/db/types";
import { config } from "./config";
import { isUserRejection, toFriendlyError } from "./errors";

export const meKey = ["forum", "me"] as const;

export const SIWE_STATEMENT = "Sign in to Lancio to post, comment and vote. This signature sends no transaction and costs no gas.";

const fetchMe = ({ signal }: { signal?: AbortSignal } = {}) => forumFetch<MeResponse>("/api/auth/me", { signal });

// One sign-in at a time across every component using the hook.
let inflight: Promise<boolean> | null = null;

/**
 * Sign-In with Ethereum for the forum. `signedIn` is true only when the session wallet is the connected wallet.
 * `ensureSignedIn()` opens the connect modal when no wallet is connected, else signs in if needed; resolves true when ready.
 */
export function useSiwe() {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { signMessageAsync } = useSignMessage();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: meKey, queryFn: fetchMe, staleTime: 5 * 60_000, retry: 1 });
  const [busy, setBusy] = useState(false);

  const sessionAddress = me.data?.address ?? null;
  const signedIn = !!address && !!sessionAddress && sessionAddress.toLowerCase() === address.toLowerCase();

  const signIn = useCallback(async (): Promise<boolean> => {
    if (!address) {
      openConnectModal?.();
      return false;
    }
    if (!inflight) {
      inflight = (async () => {
        try {
          const { nonce } = await forumFetch<{ nonce: string }>("/api/auth/nonce");
          const message = createSiweMessage({
            domain: window.location.host,
            address,
            statement: SIWE_STATEMENT,
            uri: window.location.origin,
            version: "1",
            chainId: config.chainId,
            nonce,
            issuedAt: new Date(),
            expirationTime: new Date(Date.now() + 10 * 60_000),
          });
          const signature = await signMessageAsync({ message });
          const next = await forumFetch<MeResponse>("/api/auth/verify", { method: "POST", json: { message, signature } });
          qc.setQueryData(meKey, next);
          // Feeds carry the viewer's votes (and hidden items for admins).
          void qc.invalidateQueries({ queryKey: ["forum", "posts"] });
          void qc.invalidateQueries({ queryKey: ["forum", "post"] });
          return true;
        } catch (err) {
          if (isUserRejection(err)) toast("Signature declined in wallet.");
          else toast.error(err instanceof ForumError ? err.message : toFriendlyError(err));
          return false;
        } finally {
          inflight = null;
        }
      })();
    }
    setBusy(true);
    try {
      return await inflight;
    } finally {
      setBusy(false);
    }
  }, [address, openConnectModal, signMessageAsync, qc]);

  const signOut = useCallback(async () => {
    try {
      const next = await forumFetch<MeResponse>("/api/auth/logout", { method: "POST" });
      qc.setQueryData(meKey, next);
      void qc.invalidateQueries({ queryKey: ["forum", "posts"] });
      void qc.invalidateQueries({ queryKey: ["forum", "post"] });
    } catch (err) {
      toast.error(err instanceof ForumError ? err.message : "Could not sign out. Try again.");
    }
  }, [qc]);

  const ensureSignedIn = useCallback(async (): Promise<boolean> => {
    if (!isConnected || !address) {
      openConnectModal?.();
      return false;
    }
    if (signedIn) return true;
    // The session query may still be loading: an existing session for this wallet needs no new signature.
    const current = await qc.ensureQueryData({ queryKey: meKey, queryFn: () => fetchMe() }).catch(() => null);
    if (current?.address && current.address.toLowerCase() === address.toLowerCase()) return true;
    return signIn();
  }, [isConnected, address, openConnectModal, signedIn, signIn, qc]);

  /** Call after a 401 from a forum route: the session expired or belongs to another wallet. */
  const refresh = useCallback(() => void qc.invalidateQueries({ queryKey: meKey }), [qc]);

  return {
    /** Connected wallet (checksummed) or undefined. */
    address,
    isConnected,
    signedIn,
    isAdmin: signedIn && !!me.data?.isAdmin,
    loading: me.isPending,
    busy,
    signIn,
    signOut,
    ensureSignedIn,
    refresh,
  };
}
