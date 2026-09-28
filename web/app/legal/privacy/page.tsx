// ТРЕБУЕТ ЮРИСТА — placeholder structure, not legal text. Do not publish as a final privacy policy.
import type { Metadata } from "next";
import { LEGAL_DRAFT_NOTE, LegalPage, type LegalSection } from "@/components/docs/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `Privacy Policy for Lancio. ${LEGAL_DRAFT_NOTE}`,
  robots: { index: false }, // until counsel signs off
};

const SECTIONS: LegalSection[] = [
  { id: "operator", title: "Who we are", body: "This section will name the entity responsible for the site and how to contact it about privacy." },
  { id: "scope", title: "What this policy covers", body: "This section will explain which parts of the site and its services the policy applies to." },
  {
    id: "data",
    title: "Data the site handles",
    body: "This section will list the data the site handles, for example public wallet addresses, forum posts, token images and descriptions you upload, and technical logs.",
  },
  {
    id: "onchain",
    title: "Public blockchain data",
    body: "This section will explain that transactions on Robinhood Chain are public and permanent, and that they cannot be changed or deleted by Lancio.",
  },
  {
    id: "browser",
    title: "Stored in your browser",
    body: "This section will describe what the site keeps in your browser, such as your theme choice and dismissed notices.",
  },
  { id: "purposes", title: "Why the data is used", body: "This section will set out the purposes for which data is used and the grounds for using it." },
  {
    id: "providers",
    title: "Service providers",
    body: "This section will list the providers that process data for the site, such as hosting, file storage for token images, and network infrastructure.",
  },
  { id: "retention", title: "How long data is kept", body: "This section will state how long each kind of data is kept." },
  { id: "rights", title: "Your rights", body: "This section will describe your rights over your data and how to exercise them." },
  { id: "changes", title: "Changes and contact", body: "This section will explain how this policy can change and how to get in touch." },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="The Privacy Policy will explain what data the Lancio website handles and why. It is being prepared and will be published here after legal review."
      sections={SECTIONS}
    />
  );
}
