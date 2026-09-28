import { COPY } from "@lancio/shared";
import { BaseError, ContractFunctionRevertedError, InsufficientFundsError, UserRejectedRequestError } from "viem";

/** Custom errors not covered by COPY.errors. */
const EXTRA: Record<string, string> = {
  InvalidName: "Name must be 1–32 characters.",
  InvalidSymbol: "Ticker must be 1–10 characters.",
  NotCreator: "Only the token's creator can do this.",
  NotLocker: "This call is reserved for the Lancio locker.",
  NotLaunchpad: "This call is reserved for the Lancio launchpad.",
  NotLocked: "This token has no locked pool yet.",
  ZeroAddress: "An address is missing.",
  ZeroAmount: "Enter an amount above zero.",
  UnknownToken: "This token was not launched on Lancio.",
  ContractBuyerInWindow: "During the launch window, buys must come straight from a wallet.",
  ExceedsSold: "Sell amount is larger than the tokens sold from the curve.",
  EthTransferFailed: "The ETH transfer failed. Try again.",
};

/** Revert error name (e.g. "SlippageExceeded") if the error carries a decoded custom error. */
export function revertErrorName(err: unknown): string | null {
  if (err instanceof BaseError) {
    const rev = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (rev instanceof ContractFunctionRevertedError) return rev.data?.errorName ?? null;
  }
  return null;
}

/** Signature declined in the wallet — a state, not an error (brief §12). */
export function isUserRejection(err: unknown): boolean {
  if (err instanceof BaseError && err.walk((e) => e instanceof UserRejectedRequestError)) return true;
  const e = err as { code?: number; name?: string; message?: string } | null;
  return e?.code === 4001 || e?.name === "UserRejectedRequestError" || /user (rejected|denied)/i.test(e?.message ?? "");
}

/** Human text for any wallet / RPC / contract error. */
export function toFriendlyError(err: unknown): string {
  if (isUserRejection(err)) return COPY.errors.UserRejected;
  const name = revertErrorName(err);
  if (name) {
    if (name in COPY.errors) return COPY.errors[name as keyof typeof COPY.errors];
    if (name in EXTRA) return EXTRA[name];
  }
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof InsufficientFundsError)) return COPY.errors.InsufficientEth;
    const msg = `${err.shortMessage} ${err.details ?? ""}`;
    if (/insufficient funds|exceeds balance/i.test(msg)) return COPY.errors.InsufficientEth;
    if (/chain mismatch|does not match the target chain/i.test(msg)) return "Switch to Robinhood Chain and try again.";
    if (/deadline|expired/i.test(msg)) return COPY.errors.DeadlineExpired;
    return err.shortMessage || "Transaction failed.";
  }
  if (err instanceof Error) return /insufficient funds/i.test(err.message) ? COPY.errors.InsufficientEth : err.message.split("\n")[0];
  return "Something went wrong. Try again.";
}
