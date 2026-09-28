import { COPY } from "@lancio/shared";
import { OG_CONTENT_TYPE, OG_SIZE, docsOgImage } from "@/components/docs/og";

export const alt = `Lancio docs: ${COPY.og[1]}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return docsOgImage();
}
