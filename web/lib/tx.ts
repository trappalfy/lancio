"use client";

import { explorerTx } from "@lancio/shared";
import { useQueryClient } from "@tanstack/react-query";
import { createElement, useCallback, useState } from "react";
import { toast } from "sonner";
import type { Hash, TransactionReceipt } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import { isUserRejection, toFriendlyError } from "./errors";

export type TxStatus = "idle" | "confirm" | "pending" | "success" | "error" | "rejected";

export type TxLabels = {
  /** Toast while waiting for the chain. Default "Pending…". */
  pending?: string;
  /** Toast on success. Default "Confirmed". */
  success?: string;
};

const explorerLink = (hash: Hash) =>
  createElement("a", { href: explorerTx(hash), target: "_blank", rel: "noreferrer", className: "underline underline-offset-4" }, "View on explorer");

/**
 * Wallet transaction with the standard toast flow (brief §12):
 * "Confirm in wallet" → "Pending…" (explorer link) → "Confirmed" | "Failed: {reason}".
 * Declining in the wallet shows a neutral note, not an error.
 *
 *   const tx = useTx();
 *   const receipt = await tx.run(() => tx.writeContractAsync({ address, abi: launchpadAbi, functionName: "buy", args, value }));
 *
 * `run` takes any function that returns a tx hash (writeContractAsync, sendTransactionAsync, …) and resolves
 * with the receipt, or null when rejected/failed. Invalidates all React Query data after confirmation.
 */
export function useTx() {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<TxStatus>("idle");
  const [hash, setHash] = useState<Hash | null>(null);
  const [receipt, setReceipt] = useState<TransactionReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setHash(null);
    setReceipt(null);
    setError(null);
  }, []);

  const run = useCallback(
    async (send: () => Promise<Hash>, labels: TxLabels = {}): Promise<TransactionReceipt | null> => {
      setStatus("confirm");
      setError(null);
      setReceipt(null);
      const id = toast.loading("Confirm in wallet");
      let h: Hash;
      try {
        h = await send();
      } catch (err) {
        if (isUserRejection(err)) {
          setStatus("rejected");
          toast.message(toFriendlyError(err), { id });
        } else {
          const msg = toFriendlyError(err);
          setStatus("error");
          setError(msg);
          toast.error(`Failed: ${msg}`, { id });
        }
        return null;
      }
      setHash(h);
      setStatus("pending");
      toast.loading(labels.pending ?? "Pending…", { id, description: explorerLink(h) });
      try {
        if (!publicClient) throw new Error("No RPC client for Robinhood Chain.");
        const rc = await publicClient.waitForTransactionReceipt({ hash: h });
        setReceipt(rc);
        if (rc.status !== "success") {
          setStatus("error");
          setError("Transaction reverted.");
          toast.error("Failed: Transaction reverted.", { id, description: explorerLink(h) });
          return rc;
        }
        setStatus("success");
        toast.success(labels.success ?? "Confirmed", { id, description: explorerLink(h) });
        void queryClient.invalidateQueries();
        // The indexer trails the chain by a moment — refresh once more.
        setTimeout(() => void queryClient.invalidateQueries(), 2_000);
        return rc;
      } catch (err) {
        const msg = toFriendlyError(err);
        setStatus("error");
        setError(msg);
        toast.error(`Failed: ${msg}`, { id, description: explorerLink(h) });
        return null;
      }
    },
    [publicClient, queryClient],
  );

  return {
    run,
    writeContractAsync,
    status,
    hash,
    receipt,
    error,
    reset,
    /** True from "Confirm in wallet" until the receipt arrives. */
    busy: status === "confirm" || status === "pending",
  };
}
