import { COPY } from "@lancio/shared";
import { OG_CONTENT_TYPE, OG_SIZE, homeOgImage } from "@/components/docs/og";

export const alt = `Lancio: ${COPY.og[0]}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return homeOgImage();
}
