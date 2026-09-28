"use client";

import {
  COPY,
  INITIAL_CURVE,
  LAUNCH_CAP,
  PARAMS,
  TOKEN_LIMITS,
  formatEth,
  maxBuyForTokens,
  quoteBuy,
} from "@lancio/shared";
import { launchpadAbi } from "@lancio/shared/abi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useQuery } from "@tanstack/react-query";
import { Fuel, Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { formatEther, parseEther, parseEventLogs, zeroAddress } from "viem";
import { useAccount, useBalance, usePublicClient, useReadContract, useSwitchChain } from "wagmi";
import { Accordion, Button, EthIcon, Field, Input, Select, Textarea, TelegramIcon, XIcon } from "@/components/ui";
import { config } from "@/lib/config";
import { isUserRejection, toFriendlyError } from "@/lib/errors";
import { useTx } from "@/lib/tx";
import { appChain } from "@/lib/wagmi";
import { DevBuyField } from "./DevBuyField";
import { ImageField } from "./ImageField";
import { TokenPreview } from "./TokenPreview";
import { uploadMetadata } from "./upload";
import { useImageUpload } from "./useImageUpload";
import {
  cleanTicker,
  nameValid,
  normalizeTelegram,
  normalizeWebsite,
  normalizeX,
  utf8Length,
  type TokenMetadata,
} from "./validate";

const LAUNCHPAD = config.deployment.launchpad;
const LAUNCHPAD_SET = LAUNCHPAD.toLowerCase() !== zeroAddress;

/** Largest dev buy that stays within the launch-window cap (≈0.0259 ETH). */
const CAP_MAX_WEI = maxBuyForTokens(INITIAL_CURVE, LAUNCH_CAP);
/** Max button rounds down to 6 decimals. */
const MAX_STEP = 10n ** 12n;

/** Worst-case placeholders for the gas estimate (longest name/ticker, CIDv1 URI). */
const GAS_NAME = "x".repeat(TOKEN_LIMITS.nameMax);
const GAS_SYMBOL = "X".repeat(TOKEN_LIMITS.symbolMax);
const GAS_URI = `ipfs://b${"a".repeat(58)}`;

const parseEth = (v: string): bigint | null => {
  if (!v || v === ".") return 0n;
  try {
    return parseEther(v);
  } catch {
    return null;
  }
};

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

type Step = "idle" | "metadata" | "tx" | "done";
type ButtonState = { label: string; disabled?: boolean; loading?: boolean; onClick?: () => void };

export function CreateForm() {
  const router = useRouter();
  const { address, chainId, status: accountStatus } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChain, isPending: switching } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: appChain.id });
  const tx = useTx();
  const image = useImageUpload();

  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [x, setX] = useState("");
  const [telegram, setTelegram] = useState("");
  const [website, setWebsite] = useState("");
  const [devBuy, setDevBuy] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [metaError, setMetaError] = useState<string | null>(null);
  const metaCache = useRef<{ key: string; uri: string } | null>(null);

  const connected = accountStatus === "connected" && !!address;
  const onChain = connected && chainId === appChain.id;
  const busy = step !== "idle";

  // ---- validation
  const nameBytes = utf8Length(name.trim());
  const nameError = name.trim() && !nameValid(name) ? "Name is too long." : undefined;
  const xUrl = normalizeX(x);
  const tgUrl = normalizeTelegram(telegram);
  const webUrl = normalizeWebsite(website);
  const devBuyWei = parseEth(devBuy);
  const devWei = devBuyWei ?? 0n;
  const expected = devWei > 0n ? quoteBuy(INITIAL_CURVE, devWei).tokensOut : 0n;
  const overCap = devWei > CAP_MAX_WEI;
  const hasDetails = nameValid(name) && ticker.length > 0;
  const fieldsValid = !nameError && xUrl !== undefined && tgUrl !== undefined && webUrl !== undefined && devBuyWei !== null && !overCap;

  // ---- chain reads
  const balanceQ = useBalance({ address, chainId: appChain.id, query: { enabled: connected, refetchInterval: 15_000 } });
  const balance = balanceQ.data?.value;
  const pausedQ = useReadContract({
    address: LAUNCHPAD,
    abi: launchpadAbi,
    functionName: "creationPaused",
    chainId: appChain.id,
    query: { enabled: LAUNCHPAD_SET, refetchInterval: 30_000 },
  });
  const paused = pausedQ.data === true;

  const gasDevWei = useDebounced(devWei, 400);
  const gasQ = useQuery({
    queryKey: ["lancio", "create-gas", address, gasDevWei.toString()],
    enabled: !!publicClient && onChain && LAUNCHPAD_SET && !paused && gasDevWei <= CAP_MAX_WEI,
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      const minOut = gasDevWei > 0n ? quoteBuy(INITIAL_CURVE, gasDevWei).tokensOut : 0n;
      const [gas, gasPrice] = await Promise.all([
        publicClient!.estimateContractGas({
          address: LAUNCHPAD,
          abi: launchpadAbi,
          functionName: "create",
          args: [GAS_NAME, GAS_SYMBOL, GAS_URI, minOut],
          value: gasDevWei,
          account: address!,
        }),
        publicClient!.getGasPrice(),
      ]);
      return gas * gasPrice;
    },
  });
  const gasCost = gasQ.data;
  const notEnoughEth = balance !== undefined && balance < devWei + (gasCost ?? 0n);

  const setMax = () => {
    let max = CAP_MAX_WEI;
    if (balance !== undefined) {
      const spendable = balance - 2n * (gasCost ?? 0n);
      if (spendable < max) max = spendable > 0n ? spendable : 0n;
    }
    max = (max / MAX_STEP) * MAX_STEP;
    setDevBuy(max > 0n ? formatEther(max) : "");
  };

  // ---- launch
  const metadata = (): TokenMetadata => ({
    name: name.trim(),
    symbol: ticker,
    description: description.trim() || null,
    image: image.state.status === "ready" ? image.state.uri : null,
    x: xUrl ?? null,
    telegram: tgUrl ?? null,
    website: webUrl ?? null,
  });

  const launch = async () => {
    if (!onChain || !hasDetails || !fieldsValid || devBuyWei === null) return;
    setMetaError(null);
    const meta = metadata();
    const key = JSON.stringify(meta);
    let uri = metaCache.current?.key === key ? metaCache.current.uri : null;
    if (!uri) {
      setStep("metadata");
      try {
        uri = (await uploadMetadata(meta)).uri;
        metaCache.current = { key, uri };
      } catch (err) {
        setMetaError(err instanceof Error ? err.message : "Upload failed. Try again.");
        setStep("idle");
        return;
      }
    }

    setStep("tx");
    // The dev buy is the first trade on a curve created in the same tx, so the output is exact.
    const minTokensOut = devBuyWei > 0n ? quoteBuy(INITIAL_CURVE, devBuyWei).tokensOut : 0n;
    const rc = await tx.run(
      () =>
        tx.writeContractAsync({
          address: LAUNCHPAD,
          abi: launchpadAbi,
          functionName: "create",
          args: [meta.name, meta.symbol, uri, minTokensOut],
          value: devBuyWei,
          chainId: appChain.id,
        }),
      { pending: "Launching…", success: COPY.create.success },
    );
    if (!rc || rc.status !== "success") {
      setStep("idle");
      return;
    }
    setStep("done");
    const created = parseEventLogs({ abi: launchpadAbi, eventName: "TokenCreated", logs: rc.logs }).find(
      (l) => l.address.toLowerCase() === LAUNCHPAD.toLowerCase(),
    );
    router.push(created ? `/launchpad/${created.args.token.toLowerCase()}` : "/profile");
  };

  const button: ButtonState = (() => {
    if (step === "metadata") return { label: "Uploading…", loading: true };
    if (step === "tx") return tx.status === "pending" ? { label: "Launching…", loading: true } : { label: "Confirm in wallet", loading: true };
    if (step === "done") return { label: "Launching…", loading: true };
    if (accountStatus === "connecting" || accountStatus === "reconnecting") return { label: "Connect wallet", loading: true };
    if (!connected) return { label: "Connect wallet", onClick: openConnectModal, disabled: !openConnectModal };
    if (!onChain)
      return {
        label: "Switch to Robinhood Chain",
        loading: switching,
        onClick: () =>
          switchChain({ chainId: appChain.id }, { onError: (e) => void (isUserRejection(e) || toast.error(toFriendlyError(e))) }),
      };
    if (!LAUNCHPAD_SET) return { label: "Launches are not open yet", disabled: true };
    if (paused) return { label: "New launches paused", disabled: true };
    if (!hasDetails) return { label: COPY.create.needDetails, disabled: true };
    if (!fieldsValid) return { label: "Check the highlighted fields", disabled: true };
    if (image.state.status === "uploading") return { label: "Uploading…", loading: true };
    if (image.state.status === "error") return { label: "Image upload failed · Retry", onClick: image.retry };
    if (notEnoughEth) return { label: "Not enough ETH", disabled: true };
    if (metaError) return { label: "Upload failed · Retry", onClick: () => void launch() };
    return { label: COPY.create.title, onClick: () => void launch() };
  })();

  const preview = {
    name,
    ticker,
    description,
    image: image.state.status === "empty" ? null : image.state.preview,
    x: xUrl ?? null,
    telegram: tgUrl ?? null,
    website: webUrl ?? null,
  };

  return (
    <div className="grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* ---- form */}
      <div className="p-5 sm:p-8 lg:p-10">
        <h1 className="font-heading text-28 text-text md:text-40">{COPY.create.title}</h1>

        <div className="mt-8 flex flex-col gap-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="Name" htmlFor="token-name" error={nameError} aside={`${nameBytes} / ${TOKEN_LIMITS.nameMax}`}>
              <Input
                id="token-name"
                placeholder="Token name"
                autoComplete="off"
                maxLength={TOKEN_LIMITS.nameMax * 2}
                value={name}
                disabled={busy}
                aria-invalid={!!nameError || undefined}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Ticker" htmlFor="token-ticker" aside={`${ticker.length} / ${TOKEN_LIMITS.symbolMax}`}>
              <Input
                id="token-ticker"
                placeholder="TICKER"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                value={ticker}
                disabled={busy}
                onChange={(e) => setTicker(cleanTicker(e.target.value))}
              />
            </Field>
          </div>

          <Field label="Description" htmlFor="token-description" aside={`${description.length} / ${TOKEN_LIMITS.descriptionMax}`}>
            <Textarea
              id="token-description"
              placeholder="What is this token about?"
              maxLength={TOKEN_LIMITS.descriptionMax}
              value={description}
              disabled={busy}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>

          <ImageField upload={image} disabled={busy} />

          <div className="grid gap-6 sm:grid-cols-2">
            <Field label="X profile" htmlFor="token-x" error={xUrl === undefined ? "Use x.com/handle or @handle." : undefined}>
              <Input
                id="token-x"
                placeholder="x.com/handle"
                autoComplete="off"
                spellCheck={false}
                leading={<XIcon size={15} />}
                value={x}
                disabled={busy}
                aria-invalid={xUrl === undefined || undefined}
                onChange={(e) => setX(e.target.value)}
              />
            </Field>
            <Field label="Telegram" htmlFor="token-telegram" error={tgUrl === undefined ? "Use t.me/community." : undefined}>
              <Input
                id="token-telegram"
                placeholder="t.me/community"
                autoComplete="off"
                spellCheck={false}
                leading={<TelegramIcon size={15} />}
                value={telegram}
                disabled={busy}
                aria-invalid={tgUrl === undefined || undefined}
                onChange={(e) => setTelegram(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Paired asset" hint={COPY.create.pairedHelper}>
            <Select
              aria-label="Paired asset"
              value="ETH"
              onChange={() => {}}
              options={[
                {
                  value: "ETH",
                  label: (
                    <span className="flex items-center gap-2.5">
                      <EthIcon size={20} />
                      ETH
                    </span>
                  ),
                },
              ]}
              className="h-12 w-full rounded-2xl"
            />
          </Field>

          <DevBuyField
            value={devBuy}
            onChange={setDevBuy}
            onMax={setMax}
            balance={balance ?? 0n}
            expected={expected}
            symbol={ticker}
            overCap={overCap}
            disabled={busy}
          />

          <Accordion
            className="border-y border-border"
            items={[
              {
                value: "advanced",
                title: "Advanced",
                content: (
                  <Field label="Website" htmlFor="token-website" error={webUrl === undefined ? "Enter a web address, like yourtoken.com." : undefined}>
                    <Input
                      id="token-website"
                      placeholder="yourtoken.com"
                      autoComplete="off"
                      spellCheck={false}
                      leading={<Globe size={15} />}
                      value={website}
                      disabled={busy}
                      aria-invalid={webUrl === undefined || undefined}
                      onChange={(e) => setWebsite(e.target.value)}
                    />
                  </Field>
                ),
              },
            ]}
          />

          <div>
            <div className="flex items-center justify-between gap-4 text-13 text-muted">
              <span>{COPY.create.summary(PARAMS.launchFeeEth)}</span>
              <span className="flex items-center gap-1.5 tabular" title="Estimated network fee">
                <Fuel size={14} aria-hidden />
                {gasCost !== undefined ? `≈ ${formatEth(gasCost)}` : "—"}
              </span>
            </div>
            <Button
              size="lg"
              className="mt-4 h-14 w-full text-base"
              loading={button.loading}
              disabled={button.disabled || button.loading}
              onClick={button.onClick}
            >
              {button.label}
            </Button>
            {metaError && step === "idle" && (
              <p role="alert" className="mt-3 text-13 text-sell">
                {metaError}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ---- live preview (under the form on mobile) */}
      <aside className="canvas-texture border-t border-border bg-surface-2/40 p-5 sm:p-8 lg:border-l lg:border-t-0 lg:p-10">
        <div className="lg:sticky lg:top-[calc(var(--header-h)+24px)]">
          <p className="mb-4 text-xs font-medium uppercase tracking-display text-muted">Preview</p>
          <TokenPreview data={preview} />
        </div>
      </aside>
    </div>
  );
}
