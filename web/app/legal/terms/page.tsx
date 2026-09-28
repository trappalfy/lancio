// ТРЕБУЕТ ЮРИСТА — placeholder structure, not legal text. Do not publish as final terms.
import type { Metadata } from "next";
import { LEGAL_DRAFT_NOTE, LegalPage, type LegalSection } from "@/components/docs/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: `Terms of Use for Lancio. ${LEGAL_DRAFT_NOTE}`,
  robots: { index: false }, // until counsel signs off
};

const SECTIONS: LegalSection[] = [
  { id: "operator", title: "Who we are", body: "This section will name the entity that operates the site and how to reach it." },
  { id: "acceptance", title: "Accepting these terms", body: "This section will explain when these terms apply and how changes to them are published." },
  { id: "eligibility", title: "Who can use Lancio", body: "This section will set out who may use the site, including age and the jurisdictions where it is not offered." },
  {
    id: "service",
    title: "What Lancio is",
    body: "This section will describe the site as an interface to smart contracts on Robinhood Chain that you use from your own wallet, and what Lancio does not provide, such as custody, brokerage or advice.",
  },
  {
    id: "wallet",
    title: "Your wallet and your transactions",
    body: "This section will cover your responsibility for your wallet, your keys and the transactions you sign, which cannot be reversed.",
  },
  {
    id: "user-tokens",
    title: "Tokens launched by users",
    body: "This section will explain that tokens are created by users, not by Lancio, and that Lancio does not review or endorse them.",
  },
  { id: "fees", title: "Fees", body: "This section will restate the protocol fees set in the contracts and described in the docs." },
  {
    id: "prohibited",
    title: "Prohibited use",
    body: "This section will list uses that are not allowed, such as unlawful activity, impersonation and market manipulation.",
  },
  { id: "risks", title: "Risks", body: "This section will summarise the risks described on the Risks page of the docs." },
  { id: "warranties", title: "No warranties", body: "This section will set out the disclaimers that apply to the site and the contracts." },
  { id: "liability", title: "Limitation of liability", body: "This section will set out the limits of liability." },
  { id: "law", title: "Governing law and disputes", body: "This section will name the governing law and explain how disputes are resolved." },
  { id: "changes", title: "Changes and contact", body: "This section will explain how these terms can change and how to contact the operator." },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Use"
      intro="The Terms of Use will set out the rules for using the Lancio website. They are being prepared and will be published here after legal review."
      sections={SECTIONS}
    />
  );
}
