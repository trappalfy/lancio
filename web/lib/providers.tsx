"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, darkTheme, type Theme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { WagmiProvider } from "wagmi";
import { HeroHeaderProvider } from "@/components/layout/HeroHeaderContext";
import { appChain, wagmiConfig } from "./wagmi";

/** RainbowKit theme built on CSS variables, so the modal follows the site theme without re-rendering. */
const base = darkTheme({ accentColor: "#c9a058", accentColorForeground: "#1a120b", borderRadius: "large", overlayBlur: "small" });
const lancioRkTheme: Theme = {
  ...base,
  colors: {
    ...base.colors,
    accentColor: "var(--accent)",
    accentColorForeground: "var(--on-accent)",
    actionButtonBorder: "var(--border)",
    actionButtonBorderMobile: "var(--border)",
    actionButtonSecondaryBackground: "var(--surface-2)",
    closeButton: "var(--muted)",
    closeButtonBackground: "var(--surface-2)",
    connectButtonBackground: "var(--surface)",
    connectButtonBackgroundError: "var(--sell-bg)",
    connectButtonInnerBackground: "var(--surface-2)",
    connectButtonText: "var(--text)",
    connectButtonTextError: "var(--on-sell)",
    connectionIndicator: "var(--buy)",
    downloadBottomCardBackground: "var(--surface)",
    downloadTopCardBackground: "var(--surface-2)",
    error: "var(--sell)",
    generalBorder: "var(--border)",
    generalBorderDim: "var(--border)",
    menuItemBackground: "var(--surface-2)",
    modalBackdrop: "var(--overlay)",
    modalBackground: "var(--surface)",
    modalBorder: "var(--border)",
    modalText: "var(--text)",
    modalTextDim: "var(--muted)",
    modalTextSecondary: "var(--muted)",
    profileAction: "var(--surface-2)",
    profileActionHover: "var(--border)",
    profileForeground: "var(--surface)",
    selectedOptionBorder: "var(--accent)",
    standby: "var(--accent)",
  },
  fonts: { body: "var(--font-sans)" },
  radii: { actionButton: "999px", connectButton: "999px", menuButton: "999px", modal: "28px", modalMobile: "28px" },
  shadows: {
    ...base.shadows,
    dialog: "var(--shadow-pop)",
    connectButton: "none",
  },
};

function ThemedToaster() {
  return (
    <Toaster
      theme="dark"
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast: "bg-surface-2! text-text! border! border-border! rounded-card! shadow-pop! font-sans!",
          description: "text-muted!",
          actionButton: "bg-accent! text-on-accent!",
          cancelButton: "bg-surface! text-text!",
          closeButton: "bg-surface! text-muted! border-border!",
          success: "[&_[data-icon]]:text-buy!",
          error: "[&_[data-icon]]:text-sell!",
        },
      }}
    />
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 3_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={lancioRkTheme} initialChain={appChain} modalSize="compact" appInfo={{ appName: "Lancio" }}>
          <TooltipPrimitive.Provider delayDuration={150}>
            <HeroHeaderProvider>{children}</HeroHeaderProvider>
            <ThemedToaster />
          </TooltipPrimitive.Provider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
