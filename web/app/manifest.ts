import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lancio",
    short_name: "Lancio",
    description: "Token launchpad on Robinhood Chain.",
    start_url: "/",
    display: "standalone",
    background_color: "#14100C",
    theme_color: "#14100C",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
