import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["13", "28", "40", "56"],
      radius: ["section", "card", "image"],
      shadow: ["section", "pop"],
    },
  },
});

/** className combiner: clsx + tailwind-merge (knows Lancio's custom text sizes and radii). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
