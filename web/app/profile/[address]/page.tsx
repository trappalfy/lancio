import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { shortAddress } from "@lancio/shared";
import { getAddress, isAddress } from "viem";
import { ProfileView } from "@/components/profile/ProfileView";

type Props = { params: Promise<{ address: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  if (!isAddress(address, { strict: false })) return { title: "Profile" };
  const a = getAddress(address);
  return { title: `Profile ${shortAddress(a)}`, description: `Tokens launched, holdings and trades of ${a} on Lancio.` };
}

export default async function Page({ params }: Props) {
  const { address } = await params;
  if (!isAddress(address, { strict: false })) notFound();
  return <ProfileView address={getAddress(address)} />;
}
