import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Cinzel, Inter, JetBrains_Mono } from "next/font/google";
import { COPY } from "@lancio/shared";
import { FontPreview } from "@/components/dev/FontPreview";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { StatusBanner } from "@/components/layout/StatusBanner";
import { config } from "@/lib/config";
import { FONT_STORAGE_KEY, fontPreviewCss } from "@/lib/font-options";
import { Providers } from "@/lib/providers";
import { candidateFontVars } from "./font-candidates";
import "./globals.css";

const cinzel = Cinzel({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-cinzel", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

/** TEMPORARY: font candidates + switcher, local dev only (see lib/font-options.ts). */
const FONT_PREVIEW = process.env.NODE_ENV !== "production";

export const metadata: Metadata = {
  metadataBase: new URL(config.siteUrl),
  title: { default: "Lancio", template: "%s · Lancio" },
  description: COPY.footer.description,
  applicationName: "Lancio",
  openGraph: { siteName: "Lancio", type: "website" },
  twitter: { card: "summary_large_image", site: config.xHandle ? `@${config.xHandle}` : undefined },
};

export const viewport: Viewport = {
  themeColor: "#14100C",
  colorScheme: "dark",
};

/** Runs before first paint: status-banner dismissal (+ the dev font preview choice). The site has a single dark theme. */
const bootScript = `(function(){try{var d=document.documentElement;var b=${JSON.stringify(
  config.banner?.id ?? "",
)};if(b&&localStorage.getItem('lancio-banner-dismissed:'+b))d.dataset.bannerDismissed=''${
  FONT_PREVIEW
    ? `;var f=JSON.parse(localStorage.getItem(${JSON.stringify(FONT_STORAGE_KEY)})||'null');if(f){d.dataset.fontH=f.h;d.dataset.fontUi=f.ui}`
    : ""
}}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${cinzel.variable} ${inter.variable} ${mono.variable}${FONT_PREVIEW ? ` ${candidateFontVars}` : ""}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
        {FONT_PREVIEW && <style dangerouslySetInnerHTML={{ __html: fontPreviewCss() }} />}
      </head>
      <body className="flex min-h-dvh flex-col">
        <Providers>
          <StatusBanner />
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
          {FONT_PREVIEW && <FontPreview />}
        </Providers>
      </body>
    </html>
  );
}
