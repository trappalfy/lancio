import { OG_CONTENT_TYPE, OG_SIZE, tokenOgImage } from "@/components/docs/og";

export const alt = "Token on Lancio";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
/** Market cap and progress change; re-render at most once a minute. */
export const revalidate = 60;

export default async function Image({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  return tokenOgImage(address);
}
